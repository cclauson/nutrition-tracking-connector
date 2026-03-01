import "./telemetry.js";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { auth } from "express-oauth2-jwt-bearer";
import { createMcpRouter } from "./mcp.js";
import { createDashboardRouter } from "./routes/dashboard.js";

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

  // Dashboard REST endpoints (JWT-protected)
  const jwtCheck = auth({
    audience: entraClientId,
    issuerBaseURL: `${entraAuthority || `https://login.microsoftonline.com/${entraTenantId}`}/v2.0`,
    tokenSigningAlg: 'RS256',
  });
  app.use('/api/dashboard', jwtCheck, createDashboardRouter(prisma));

  console.log("MCP endpoints enabled at /api/mcp");
  console.log("Dashboard endpoints enabled at /api/dashboard");
} else {
  console.log("MCP endpoints disabled (ENTRA_TENANT_ID, ENTRA_CLIENT_ID, PROXY_BASE_URL not all set)");
}

// --- REST API ---

app.get("/api", (_req, res) => {
  res.json({ service: "vnext-api", version: "1.0.0" });
});

app.get("/health", (_req, res) => {
  res.sendStatus(200);
});

// --- Error handler for JWT validation errors ---
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Auth error:', {
    name: err.name,
    message: err.message,
    code: err.code,
    status: err.status,
  });
  res.status(err.status || 401).json({
    error: err.message,
    code: err.code,
  });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
