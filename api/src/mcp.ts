import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { createEntraProxyProvider } from './auth/entra-proxy.js';

const sessions = new Map<string, { transport: StreamableHTTPServerTransport; server: McpServer }>();

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'nutrition-tracking-mcp',
    version: '1.0.0',
  });

  server.tool(
    'hello',
    'Says hello to someone',
    { name: z.string().describe('Name to greet') },
    async ({ name }) => ({
      content: [{ type: 'text', text: `Hello, ${name}! This is a response from the Nutrition Tracking MCP server.` }],
    }),
  );

  return server;
}

export function createMcpRouter(tenantId: string, entraClientId: string, proxyBaseUrl: string, entraAuthority?: string): {
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

      const server = createMcpServer();

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
