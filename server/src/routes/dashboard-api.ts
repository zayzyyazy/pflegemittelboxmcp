import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appConfig } from '../config.js';
import {
  clearLogs,
  createDashboardTestCase,
  deleteDashboardTestCase,
  getLogs,
  getSettings,
  listDashboardTestCases,
  listRecentPostCallAlerts,
  setSetting,
  updateDashboardTestCase,
} from '../db.js';
import { TOOL_DEFS, runDashboardTool } from '../dashboard/catalog.js';
import { getPostCallMonitorState, runPostCallMonitorCycle } from '../post-call-monitor.js';

const execFileAsync = promisify(execFile);

export const dashboardApiRouter = Router();

const LEAPING_FUNCTIONS = [
  {
    name: 'get_customer_by_insurance_number',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/get_customer_by_insurance_number',
    parameters: ['insurance_number'],
    notes: 'Main customer lookup. Called after VNR capture and normalization.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'check_birthday',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/check_birthday',
    parameters: ['customer_id', 'birthday'],
    notes: 'Birthday verification after a customer lookup.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'get_customer_by_plz_geb',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/get_customer_by_plz_geb',
    parameters: ['plz', 'house_number', 'birthday'],
    notes: 'Address fallback lookup that already includes birthday.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'check_insurance_number_format',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/check_insurance_number_format',
    parameters: ['insurance_number'],
    notes: 'Shape validator before customer lookup by VNR.',
    safe: true,
    productionChanging: false,
  },
];

dashboardApiRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'pflegemittelbox-mcp',
    version: '0.1.0',
    env: appConfig.ENV_LABEL,
    node_env: appConfig.NODE_ENV,
    uptime_s: Math.round(process.uptime()),
    tool_count: TOOL_DEFS.length,
    tools: TOOL_DEFS.map((tool) => tool.name),
    mcp_auth_enabled: appConfig.MCP_AUTH_ENABLED,
    dashboard_auth_enabled: appConfig.DASHBOARD_AUTH_ENABLED,
  });
});

dashboardApiRouter.get('/tools', (_req, res) => {
  res.json({ tools: TOOL_DEFS });
});

dashboardApiRouter.get('/leaping-functions', (_req, res) => {
  res.json({ functions: LEAPING_FUNCTIONS });
});

dashboardApiRouter.post('/tools/:name/test', async (req, res) => {
  try {
    const result = await runDashboardTool(req.params.name, (req.body ?? {}) as Record<string, unknown>);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      error &&
      typeof error === 'object' &&
      'statusCode' in error &&
      typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : 500;
    const durationMs =
      error &&
      typeof error === 'object' &&
      'duration_ms' in error &&
      typeof (error as { duration_ms?: unknown }).duration_ms === 'number'
        ? (error as { duration_ms: number }).duration_ms
        : undefined;
    res.status(statusCode).json({ error: message, duration_ms: durationMs });
  }
});

dashboardApiRouter.get('/test-cases', (_req, res) => {
  const testCases = listDashboardTestCases().map((entry) => ({
    ...entry,
    input: JSON.parse(entry.input_json),
  }));
  res.json({ test_cases: testCases });
});

dashboardApiRouter.post('/test-cases', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const toolName = typeof body.tool_name === 'string' ? body.tool_name.trim() : '';
  const input = body.input ?? {};

  if (!name) {
    res.status(400).json({ error: '"name" is required' });
    return;
  }
  if (!toolName) {
    res.status(400).json({ error: '"tool_name" is required' });
    return;
  }

  const id = createDashboardTestCase(name, toolName, JSON.stringify(input));
  const saved = listDashboardTestCases().find((entry) => entry.id === id);
  res.status(201).json({
    ok: true,
    test_case: saved
      ? { ...saved, input: JSON.parse(saved.input_json) }
      : { id, name, tool_name: toolName, input },
  });
});

dashboardApiRouter.put('/test-cases/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const toolName = typeof body.tool_name === 'string' ? body.tool_name.trim() : '';
  const input = body.input ?? {};

  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid test case id' });
    return;
  }
  if (!name || !toolName) {
    res.status(400).json({ error: '"name" and "tool_name" are required' });
    return;
  }

  updateDashboardTestCase(id, name, toolName, JSON.stringify(input));
  const saved = listDashboardTestCases().find((entry) => entry.id === id);
  res.json({
    ok: true,
    test_case: saved ? { ...saved, input: JSON.parse(saved.input_json) } : null,
  });
});

dashboardApiRouter.delete('/test-cases/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Invalid test case id' });
    return;
  }
  deleteDashboardTestCase(id);
  res.json({ ok: true });
});

dashboardApiRouter.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  res.json({ logs: getLogs(limit) });
});

dashboardApiRouter.delete('/logs', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

dashboardApiRouter.get('/post-call-alerts', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  res.json({ alerts: listRecentPostCallAlerts(limit) });
});

dashboardApiRouter.get('/post-call-monitor/status', (_req, res) => {
  res.json(getPostCallMonitorState());
});

dashboardApiRouter.post('/post-call-monitor/run', async (_req, res) => {
  try {
    const summary = await runPostCallMonitorCycle(appConfig);
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message });
  }
});

dashboardApiRouter.get('/settings', (_req, res) => {
  const settings = getSettings();
  res.json({
    mcp_url: settings.mcp_url ?? '',
    env_label: settings.env_label ?? appConfig.ENV_LABEL,
    leaping_mcp_url: settings.leaping_mcp_url ?? '',
    leaping_agent_id: settings.leaping_agent_id ?? '',
  });
});

dashboardApiRouter.put('/settings', (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowed = ['mcp_url', 'env_label', 'leaping_mcp_url', 'leaping_agent_id'] as const;
  for (const key of allowed) {
    if (typeof body[key] === 'string') {
      setSetting(key, body[key]);
    }
  }
  const settings = getSettings();
  res.json({
    mcp_url: settings.mcp_url ?? '',
    env_label: settings.env_label ?? appConfig.ENV_LABEL,
    leaping_mcp_url: settings.leaping_mcp_url ?? '',
    leaping_agent_id: settings.leaping_agent_id ?? '',
  });
});

dashboardApiRouter.get('/server-runtime', async (_req, res) => {
  const runtime = {
    node_version: process.version,
    pid: process.pid,
    platform: process.platform,
    uptime_s: Math.round(process.uptime()),
    cwd: process.cwd(),
    pm2: {
      available: false,
      process: null as unknown,
      error: null as string | null,
    },
  };

  try {
    const { stdout } = await execFileAsync('pm2', ['jlist']);
    const processes = JSON.parse(stdout) as Array<Record<string, unknown>>;
    const processInfo =
      processes.find((entry) => entry.name === 'pflegemittelbox-mcp') ??
      processes[0] ??
      null;
    runtime.pm2 = {
      available: true,
      process: processInfo,
      error: null,
    };
  } catch (error) {
    runtime.pm2 = {
      available: false,
      process: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  res.json(runtime);
});
