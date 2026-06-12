import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { mcpRouter } from './routes/mcp-http.js';
import { apiRouter } from './routes/api.js';
import { setSetting } from './db.js';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();

// Sync ENV_LABEL env var → settings table on each startup
if (process.env.ENV_LABEL) {
  setSetting('env_label', process.env.ENV_LABEL);
}

// CORS — allow any origin.
// This server is local-only; ngrok/Cloudflare Tunnel expose it selectively.
// Leaping connects via ngrok so its Origin header is not localhost.
app.use(cors({ origin: true }));

// ── MCP routes ────────────────────────────────────────────────────────────
// POST /mcp/sse applies express.json() inline (Streamable HTTP, what Leaping uses).
// POST /mcp/messages does NOT — SSEServerTransport reads the raw body stream.
app.use('/mcp', mcpRouter);

// ── Dashboard REST API (JSON body parser applies only here) ──────────────
app.use('/api', express.json(), apiRouter);

// ── Root sanity check ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    message: 'Pflegemittelbox MCP Server',
    endpoints: {
      mcp_sse: '/mcp/sse',
      mcp_messages: '/mcp/messages',
      api: '/api',
    },
  });
});

app.listen(PORT, () => {
  console.log(`
┌─────────────────────────────────────────────┐
│  Pflegemittelbox MCP Server                 │
│                                             │
│  MCP SSE:    http://localhost:${PORT}/mcp/sse     │
│  Dashboard:  http://localhost:5173          │
│  API:        http://localhost:${PORT}/api         │
│                                             │
│  ENV: ${(process.env.ENV_LABEL ?? 'local').padEnd(37)}│
└─────────────────────────────────────────────┘
`);
});
