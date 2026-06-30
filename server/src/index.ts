import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcpRouter } from './routes/mcp-http.js';
import { apiRouter } from './routes/api.js';
import { dashboardApiRouter } from './routes/dashboard-api.js';
import { setSetting } from './db.js';
import { appConfig } from './config.js';
import { getPostCallMonitorState, startPostCallMonitor } from './post-call-monitor.js';
import { createMcpAuthMiddleware } from './mcp-auth.js';
import { createDashboardAuthMiddleware } from './dashboard-auth.js';

const app = express();
const startedAt = new Date().toISOString();
let shuttingDown = false;
const postCallMonitor = startPostCallMonitor(appConfig);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardDistDir = path.join(__dirname, '../../dashboard/dist');
const dashboardIndexFile = path.join(dashboardDistDir, 'index.html');

// Sync ENV_LABEL env var → settings table on each startup
if (appConfig.ENV_LABEL) {
  setSetting('env_label', appConfig.ENV_LABEL);
}

if (appConfig.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

app.use(cors({ origin: true }));

const mcpAuthMiddleware = createMcpAuthMiddleware(appConfig);
const dashboardAuthMiddleware = createDashboardAuthMiddleware(appConfig);

// ── MCP routes ────────────────────────────────────────────────────────────
// POST /mcp/sse applies express.json() inline (Streamable HTTP, what Leaping uses).
// POST /mcp/messages does NOT — SSEServerTransport reads the raw body stream.
app.use('/mcp', mcpAuthMiddleware, mcpRouter);

// ── Dashboard REST API (JSON body parser applies only here) ──────────────
app.use('/api', express.json(), apiRouter);
app.use('/api/dashboard', dashboardAuthMiddleware, express.json(), dashboardApiRouter);

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
    post_call_monitor: getPostCallMonitorState(),
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
      post_call_monitor_status: '/api/post-call-monitor/status',
    },
  });
});

if (fs.existsSync(dashboardIndexFile)) {
  app.use(
    '/ui',
    dashboardAuthMiddleware,
    express.static(dashboardDistDir, {
      index: false,
    })
  );

  app.get('/ui', dashboardAuthMiddleware, (_req, res) => {
    res.sendFile(dashboardIndexFile);
  });

  app.get('/ui/*', dashboardAuthMiddleware, (_req, res) => {
    res.sendFile(dashboardIndexFile);
  });
} else {
  app.get('/ui', dashboardAuthMiddleware, (_req, res) => {
    res.status(503).json({
      ok: false,
      error: 'Dashboard build not found. Run the dashboard build before using /ui.',
    });
  });
}

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
      dashboard_api: `${publicBaseUrl}/api/dashboard`,
      dashboard_ui: `${publicBaseUrl}/ui`,
      mcp_sse: `${publicBaseUrl}/mcp/sse`,
      mcp_messages: `${publicBaseUrl}/mcp/messages`,
    },
    mcp_auth_enabled: appConfig.MCP_AUTH_ENABLED,
    mcp_auth_type: appConfig.MCP_AUTH_ENABLED ? appConfig.MCP_AUTH_TYPE : 'none',
    dashboard_auth_enabled: appConfig.DASHBOARD_AUTH_ENABLED,
    post_call_monitor_enabled: appConfig.POST_CALL_MONITOR_ENABLED,
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
  postCallMonitor?.stop();
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
