import "./telemetry.js";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { createMcpRouter } from "./mcp.js";

const app = express();
const port = process.env.PORT || 3000;
const prisma = new PrismaClient();

app.use(express.json());

// --- MCP endpoints (optional — only mounted if env vars are set) ---
const entraTenantId = process.env.ENTRA_TENANT_ID;
const entraClientId = process.env.ENTRA_CLIENT_ID;
const proxyBaseUrl = process.env.PROXY_BASE_URL;
const entraAuthority = process.env.ENTRA_AUTHORITY;

if (entraTenantId && entraClientId && proxyBaseUrl) {
  const { mcpRouter, wellKnownRouter } = createMcpRouter(entraTenantId, entraClientId, proxyBaseUrl, prisma, entraAuthority);

  // .well-known must be at the origin root (RFC 8615)
  app.use("/.well-known", wellKnownRouter);

  // MCP transport at /api/mcp
  app.use("/api/mcp", mcpRouter);

  console.log("MCP endpoints enabled at /api/mcp");
} else {
  console.log("MCP endpoints disabled (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, PROXY_BASE_URL not all set)");
}

// --- Existing REST API ---

app.get("/api", (_req, res) => {
  res.json({ service: "vnext-api", version: "1.0.0" });
});

app.get("/api/items", async (_req, res) => {
  const items = await prisma.item.findMany();
  res.json(items);
});

app.post("/api/items", async (req, res) => {
  const { name } = req.body;
  const item = await prisma.item.create({ data: { name } });
  res.status(201).json(item);
});

app.delete("/api/items/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  await prisma.item.delete({ where: { id } });
  res.sendStatus(204);
});

app.get("/health", (_req, res) => {
  res.sendStatus(200);
});

// --- Error handler for JWT validation errors ---
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  let tokenClaims: any = null;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const parts = authHeader.slice(7).split('.');
      if (parts.length === 3) {
        tokenClaims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      }
    } catch { /* ignore decode errors */ }
  }
  console.error('Auth error:', {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
    tokenClaims,
  });
  res.status(err.status || 401).json({
    error: err.message,
    code: err.code,
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
