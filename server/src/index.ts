import express from 'express';
import cors from 'cors';
import { mcpRouter } from './routes/mcp-http.js';
import { apiRouter } from './routes/api.js';
import { setSetting } from './db.js';
import { appConfig } from './config.js';

const app = express();
const startedAt = new Date().toISOString();
let shuttingDown = false;

// Sync ENV_LABEL env var → settings table on each startup
if (appConfig.ENV_LABEL) {
  setSetting('env_label', appConfig.ENV_LABEL);
}

if (appConfig.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({ origin: true }));

// ── MCP routes ────────────────────────────────────────────────────────────
// POST /mcp/sse applies express.json() inline (Streamable HTTP, what Leaping uses).
// POST /mcp/messages does NOT — SSEServerTransport reads the raw body stream.
app.use('/mcp', mcpRouter);

// ── Dashboard REST API (JSON body parser applies only here) ──────────────
app.use('/api', express.json(), apiRouter);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'pflegemittelbox-mcp',
    version: '0.1.0',
    env: appConfig.ENV_LABEL,
    node_env: appConfig.NODE_ENV,
    uptime_s: Math.round(process.uptime()),
    shutting_down: shuttingDown,
    started_at: startedAt,
  });
});

// ── Root sanity check ────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    message: 'Pflegemittelbox MCP Server',
    ok: true,
    env: appConfig.ENV_LABEL,
    endpoints: {
      mcp_sse: '/mcp/sse',
      mcp_messages: '/mcp/messages',
      api: '/api',
      health: '/health',
    },
  });
});

const server = app.listen(appConfig.PORT, () => {
  const publicBaseUrl =
    appConfig.PUBLIC_BASE_URL ?? `http://0.0.0.0:${appConfig.PORT}`;
  console.log(JSON.stringify({
    level: 'info',
    event: 'server_started',
    service: 'pflegemittelbox-mcp',
    version: '0.1.0',
    node_env: appConfig.NODE_ENV,
    env_label: appConfig.ENV_LABEL,
    port: appConfig.PORT,
    started_at: startedAt,
    public_base_url: publicBaseUrl,
    endpoints: {
      health: `${publicBaseUrl}/health`,
      api: `${publicBaseUrl}/api`,
      mcp_sse: `${publicBaseUrl}/mcp/sse`,
      mcp_messages: `${publicBaseUrl}/mcp/messages`,
    },
  }, null, 2));
});

server.on('error', (error: NodeJS.ErrnoException) => {
  const errorWithAddress = error as NodeJS.ErrnoException & {
    address?: string;
    port?: number;
  };
  console.error(JSON.stringify({
    level: 'error',
    event: 'server_start_failed',
    message: error.message,
    code: error.code,
    syscall: error.syscall,
    address: errorWithAddress.address,
    port: errorWithAddress.port,
  }));
  process.exit(1);
});

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({
    level: 'info',
    event: 'shutdown_started',
    signal,
    service: 'pflegemittelbox-mcp',
  }));

  server.close((error) => {
    if (error) {
      console.error(JSON.stringify({
        level: 'error',
        event: 'shutdown_failed',
        signal,
        message: error.message,
      }));
      process.exit(1);
      return;
    }

    console.log(JSON.stringify({
      level: 'info',
      event: 'shutdown_complete',
      signal,
      service: 'pflegemittelbox-mcp',
    }));
    process.exit(0);
  });

  setTimeout(() => {
    console.error(JSON.stringify({
      level: 'error',
      event: 'shutdown_timeout',
      signal,
      service: 'pflegemittelbox-mcp',
    }));
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
