/**
 * REST API used exclusively by the dashboard.
 * All routes are under /api and require express.json() (mounted in index.ts).
 */
import { Router } from 'express';
import { normalizeVnr } from '../tools/normalize-vnr.js';
import { logCall, getLogs, clearLogs, getSettings, setSetting } from '../db.js';

export const apiRouter = Router();

// ── Status ──────────────────────────────────────────────────────────────
apiRouter.get('/status', (_req, res) => {
  res.json({
    ok: true,
    service: 'pflegemittelbox-mcp',
    version: '0.1.0',
    env: process.env.ENV_LABEL || 'local',
    tool_count: 2,
    uptime_s: Math.round(process.uptime()),
  });
});

// ── Tool definitions ────────────────────────────────────────────────────
const TOOL_DEFS = [
  {
    name: 'normalize_vnr',
    description:
      'Normalize messy spoken German VNR / insurance number text into a clean candidate. ' +
      'VNR = 1 letter + 9 digits (e.g. L039359923). Handles phonetic forms and German number words.',
    category: 'normalization',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description:
            'German spoken VNR text, e.g. "L wie Ludwig null drei neun drei fünf neun neun zwei drei"',
        },
      },
      required: ['text'],
    },
  },
  {
    name: 'health_check',
    description:
      'Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    category: 'utility',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

apiRouter.get('/tools', (_req, res) => {
  res.json({ tools: TOOL_DEFS });
});

// ── Tool test runner ────────────────────────────────────────────────────
apiRouter.post('/tools/:name/test', (req, res) => {
  const { name } = req.params;
  const input = req.body ?? {};

  const start = Date.now();

  try {
    let output: unknown;

    if (name === 'normalize_vnr') {
      const { text } = input as { text: string };
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: '"text" (string) is required' });
        return;
      }
      output = normalizeVnr(text);
    } else if (name === 'health_check') {
      output = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
    } else {
      res.status(404).json({ error: `Unknown tool: ${name}` });
      return;
    }

    const duration_ms = Date.now() - start;
    logCall(name, input, output, null, duration_ms);
    res.json({ output, duration_ms });
  } catch (err) {
    const duration_ms = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logCall(name, input, null, errorMsg, duration_ms);
    res.status(500).json({ error: errorMsg, duration_ms });
  }
});

// ── Call logs ────────────────────────────────────────────────────────────
apiRouter.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  res.json({ logs: getLogs(limit) });
});

apiRouter.delete('/logs', (_req, res) => {
  clearLogs();
  res.json({ ok: true });
});

// ── Settings ─────────────────────────────────────────────────────────────
apiRouter.get('/settings', (_req, res) => {
  res.json(getSettings());
});

apiRouter.put('/settings', (req, res) => {
  const body = req.body as Record<string, string>;
  const ALLOWED = ['mcp_url', 'env_label', 'leaping_mcp_url'];

  for (const key of ALLOWED) {
    if (typeof body[key] === 'string') {
      setSetting(key, body[key]);
    }
  }
  res.json(getSettings());
});

// ── Leaping functions reference (static, read-only) ─────────────────────
// These are the real Marie API functions configured inside Leaping.
// Marked safe/risky so it's obvious what is dangerous to test from the dashboard.
const LEAPING_FUNCTIONS = [
  {
    name: 'get_customer_by_insurance_number',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/get_customer_by_insurance_number',
    parameters: ['insurance_number'],
    notes: 'Main customer lookup. Called after VNR is captured and normalised.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'check_birthday',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/check_birthday',
    parameters: ['customer_id', 'birthday'],
    notes: 'Verifies customer birthday during identity check (second factor).',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'recognize_customer_by_phone',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/recognize_customer_by_phone',
    parameters: ['phone_number'],
    notes: 'Looks up caller by phone before asking for VNR. Used in greeting stage.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'clean_phone_number',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/clean_phone_number',
    parameters: ['phone_raw'],
    notes: 'Normalises a spoken German phone number to E.164 format.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'check_insurance_number_format',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/check_insurance_number_format',
    parameters: ['insurance_number'],
    notes: 'Validates VNR format before triggering customer lookup.',
    safe: true,
    productionChanging: false,
  },
  {
    name: 'leaping_call_customer_phone',
    type: 'Leaping Built-in',
    method: 'POST',
    url: '(internal Leaping action)',
    parameters: ['phone_number'],
    notes: 'RISKY: Initiates an outbound call to the customer. Do not test without care.',
    safe: false,
    productionChanging: true,
  },
  {
    name: 'save_phone_number',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/save_phone_number',
    parameters: ['customer_id', 'phone_number'],
    notes: 'RISKY: Writes a new phone number to the customer record.',
    safe: false,
    productionChanging: true,
  },
  {
    name: 'create_ticket',
    type: 'Leaping HTTP Function',
    method: 'POST',
    url: '${LEAPING_FUNC_BASE}/create_ticket',
    parameters: ['customer_id', 'type', 'description'],
    notes: 'RISKY: Creates a support ticket. Used after failed verification or manual-check flag.',
    safe: false,
    productionChanging: true,
  },
];

apiRouter.get('/leaping-functions', (_req, res) => {
  res.json({ functions: LEAPING_FUNCTIONS });
});
