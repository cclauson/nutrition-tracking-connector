import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { PrismaClient, Prisma } from '@prisma/client';
import { createEntraProxyProvider } from './auth/entra-proxy.js';

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function getUserId(extra: any): string {
  const sub = extra?.authInfo?.extra?.sub;
  if (!sub) throw new Error('Missing user identity');
  return sub as string;
}

function createMcpServer(prisma: PrismaClient): McpServer {
  const server = new McpServer({
    name: 'nutrition-tracking-mcp',
    version: '1.0.0',
  });

  // --- create_metric ---
  server.tool(
    'create_metric',
    'Define a new metric to track (e.g. Weight, Steps, Workouts)',
    {
      name: z.string().describe('Metric name (e.g. "Weight", "Steps")'),
      unit: z.string().optional().describe('Unit of measurement (e.g. "lbs", "steps")'),
      resolution: z.enum(['daily', 'timestamped']).describe('daily = one entry per day, timestamped = multiple entries per day'),
      type: z.enum(['numeric', 'checkin']).describe('numeric = has a value, checkin = presence-only'),
    },
    async ({ name, unit, resolution, type }, extra) => {
      const userId = getUserId(extra);
      try {
        const metric = await prisma.metric.create({
          data: { userId, name, unit, resolution, type },
        });
        return { content: [{ type: 'text' as const, text: `Created metric "${metric.name}" (${metric.type}, ${metric.resolution})${metric.unit ? ` in ${metric.unit}` : ''}` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return { content: [{ type: 'text' as const, text: `A metric named "${name}" already exists.` }], isError: true };
        }
        throw err;
      }
    },
  );

  // --- list_metrics ---
  server.tool(
    'list_metrics',
    'List all metrics you are tracking',
    {},
    async (_args, extra) => {
      const userId = getUserId(extra);
      const metrics = await prisma.metric.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
      if (metrics.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No metrics defined yet. Use create_metric to get started.' }] };
      }
      const lines = metrics.map(m =>
        `- ${m.name} (${m.type}, ${m.resolution})${m.unit ? ` [${m.unit}]` : ''}`
      );
      return { content: [{ type: 'text' as const, text: lines.join('\n') }] };
    },
  );

  // --- log_metric ---
  server.tool(
    'log_metric',
    'Log an entry for a metric',
    {
      name: z.string().describe('Metric name'),
      value: z.number().optional().describe('Value to log (required for numeric metrics, omit for checkin)'),
      date: z.string().optional().describe('Date in YYYY-MM-DD format (defaults to today). Ignored for timestamped metrics.'),
    },
    async ({ name, value, date }, extra) => {
      const userId = getUserId(extra);
      const metric = await prisma.metric.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (!metric) {
        return { content: [{ type: 'text' as const, text: `No metric named "${name}" found. Use create_metric first.` }], isError: true };
      }

      // Validate value vs type
      if (metric.type === 'numeric' && value == null) {
        return { content: [{ type: 'text' as const, text: `Metric "${name}" is numeric — a value is required.` }], isError: true };
      }
      if (metric.type === 'checkin' && value != null) {
        return { content: [{ type: 'text' as const, text: `Metric "${name}" is checkin — value should not be provided.` }], isError: true };
      }

      const now = new Date();

      let entryDate: string;
      let timestamp: Date;
      if (metric.resolution === 'daily') {
        entryDate = date || now.toISOString().slice(0, 10);
        timestamp = new Date(entryDate + 'T00:00:00.000Z');
      } else {
        timestamp = now;
        entryDate = now.toISOString();
      }

      if (metric.resolution === 'daily') {
        // Upsert for daily — one entry per date
        await prisma.metricEntry.upsert({
          where: { metricId_date: { metricId: metric.id, date: entryDate } },
          create: { metricId: metric.id, value, date: entryDate, timestamp },
          update: { value, timestamp },
        });
      } else {
        // Always insert for timestamped
        await prisma.metricEntry.create({
          data: { metricId: metric.id, value, date: entryDate, timestamp },
        });
      }

      const display = metric.type === 'checkin' ? 'checked in' : `logged ${value}${metric.unit ? ` ${metric.unit}` : ''}`;
      return { content: [{ type: 'text' as const, text: `${metric.name}: ${display} on ${entryDate.slice(0, 10)}` }] };
    },
  );

  // --- get_metric_entries ---
  server.tool(
    'get_metric_entries',
    'Query entries for a metric over a date range',
    {
      name: z.string().describe('Metric name'),
      from: z.string().optional().describe('Start date (YYYY-MM-DD), defaults to 7 days ago'),
      to: z.string().optional().describe('End date (YYYY-MM-DD), defaults to today'),
    },
    async ({ name, from, to }, extra) => {
      const userId = getUserId(extra);
      const metric = await prisma.metric.findUnique({
        where: { userId_name: { userId, name } },
      });
      if (!metric) {
        return { content: [{ type: 'text' as const, text: `No metric named "${name}" found.` }], isError: true };
      }

      const today = new Date().toISOString().slice(0, 10);
      const fromDate = from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const toDate = to || today;

      const entries = await prisma.metricEntry.findMany({
        where: {
          metricId: metric.id,
          date: { gte: fromDate, lte: toDate + '\uffff' },
        },
        orderBy: { date: 'asc' },
      });

      if (entries.length === 0) {
        return { content: [{ type: 'text' as const, text: `No entries for "${name}" between ${fromDate} and ${toDate}.` }] };
      }

      const lines = entries.map(e => {
        const dateStr = e.date.slice(0, 10);
        if (metric.type === 'checkin') return `- ${dateStr}: ✓`;
        return `- ${dateStr}: ${e.value}${metric.unit ? ` ${metric.unit}` : ''}`;
      });
      return { content: [{ type: 'text' as const, text: `${metric.name} (${fromDate} to ${toDate}):\n${lines.join('\n')}` }] };
    },
  );

  // --- delete_metric ---
  server.tool(
    'delete_metric',
    'Delete a metric and all its entries',
    {
      name: z.string().describe('Metric name to delete'),
    },
    async ({ name }, extra) => {
      const userId = getUserId(extra);
      try {
        await prisma.metric.delete({
          where: { userId_name: { userId, name } },
        });
        return { content: [{ type: 'text' as const, text: `Deleted metric "${name}" and all its entries.` }] };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
          return { content: [{ type: 'text' as const, text: `No metric named "${name}" found.` }], isError: true };
        }
        throw err;
      }
    },
  );

  return server;
}

export function createMcpRouter(tenantId: string, entraClientId: string, proxyBaseUrl: string, prisma: PrismaClient, entraAuthority?: string): {
  mcpRouter: Router;
  wellKnownRouter: Router;
} {
  const authProvider = createEntraProxyProvider(tenantId, entraClientId, proxyBaseUrl, entraAuthority);

  // .well-known endpoints (no auth) — mounted at root by the caller
  const wellKnownRouter = Router();

  wellKnownRouter.get('/oauth-protected-resource', (req, res) => {
    authProvider.handleProtectedResourceMetadata(req, res);
  });

  wellKnownRouter.get('/oauth-authorization-server', (req, res) => {
    authProvider.handleAuthServerMetadata(req, res);
  });

  // MCP transport endpoints — mounted at /api/mcp by the caller
  const mcpRouter = Router();

  // POST - MCP messages (initialize + subsequent requests)
  mcpRouter.post('/', ...authProvider.middleware, async (req: Request, res: Response) => {
    try {
      const method = (req.body as any)?.method;
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      console.log('MCP POST:', { method, id: (req.body as any)?.id, sessionId, hasBody: !!req.body, activeSessions: sessions.size });

      // Existing session
      if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId)!;
        await transport.handleRequest(req as any, res as any, req.body);
        return;
      }

      // New session — must be an initialize request
      if (sessionId || !isInitializeRequest(req.body)) {
        console.log('MCP POST rejected:', { sessionId, isInitialize: isInitializeRequest(req.body), body: JSON.stringify(req.body).slice(0, 500) });
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'Bad request: expected initialize request without session ID' },
          id: (req.body as any)?.id ?? null,
        });
        return;
      }

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      const server = createMcpServer(prisma);

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) {
          console.log('MCP session closed:', sid);
          sessions.delete(sid);
        }
      };

      transport.onerror = (err) => {
        console.error('MCP transport error:', err);
      };

      await server.connect(transport);
      console.log('MCP server connected, handling initialize request...');
      await transport.handleRequest(req as any, res as any, req.body);

      if (transport.sessionId) {
        sessions.set(transport.sessionId, { transport, server });
        console.log('MCP session created:', transport.sessionId);
      }
    } catch (err) {
      console.error('MCP POST handler error:', err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  });

  // GET - SSE stream for server-to-client notifications
  mcpRouter.get('/', ...authProvider.middleware, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log('MCP GET:', { sessionId, hasSession: sessionId ? sessions.has(sessionId) : false });
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req as any, res as any);
  });

  // DELETE - session termination
  mcpRouter.delete('/', ...authProvider.middleware, async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    console.log('MCP DELETE:', { sessionId });
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: 'Invalid or missing session ID' });
      return;
    }
    const { transport } = sessions.get(sessionId)!;
    await transport.handleRequest(req as any, res as any);
  });

  return { mcpRouter, wellKnownRouter };
}
