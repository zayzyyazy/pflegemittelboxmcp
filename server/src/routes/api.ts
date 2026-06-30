/**
 * REST API used exclusively by the dashboard.
 * All routes are under /api and require express.json() (mounted in index.ts).
 */
import { Router } from 'express';
import { appConfig } from '../config.js';
import { parseAddressVerificationGuardrail } from '../tools/address-verification-guardrail.js';
import {
  coerceDeliveryStatusReasonerInput,
  runDeliveryStatusReasoner,
} from '../tools/delivery-status-reasoner.js';
import { normalizeVnr } from '../tools/normalize-vnr.js';
import {
  coercePostCallAlertDetectorInput,
  runPostCallAlertDetector,
} from '../tools/post-call-alert-detector.js';
import {
  coercePostCallEmailNotifierInput,
  runPostCallEmailNotifier,
} from '../tools/post-call-email-notifier.js';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from '../tools/verification-method-brains.js';
import {
  coerceVerificationBrainInput,
  runVerificationBrain,
} from '../tools/verification-brain.js';
import { logCall, getLogs, clearLogs, getSettings, setSetting } from '../db.js';
import { getPostCallMonitorState, runPostCallMonitorCycle } from '../post-call-monitor.js';

export const apiRouter = Router();

function sanitizeGuardrailInput(input: Record<string, unknown>) {
  const nullableString = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  return {
    raw_text: typeof input.raw_text === 'string' ? input.raw_text : '',
    known_plz: nullableString(input.known_plz),
    known_house_number: nullableString(input.known_house_number),
    known_birthday: nullableString(input.known_birthday),
    attempt: Number(input.attempt ?? 1),
  };
}

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
    name: 'pmb_normalize_vnr',
    description:
      'Alias for normalize_vnr. Normalize messy spoken German VNR / insurance number text into a clean candidate.',
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
    name: 'pmb_address_verification_guardrail',
    description:
      'Strict parser/state helper for PLZ, Hausnummer, and Geburtsdatum during address-based identification fallback. ' +
      'It preserves known values, parses the latest utterance, and tells Marie what to ask next without doing any lookup.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        raw_text: {
          type: 'string',
          description: 'Latest user utterance or transcript text.',
        },
        known_plz: {
          type: 'string',
          description: 'Previously collected PLZ or blank/null.',
        },
        known_house_number: {
          type: 'string',
          description: 'Previously collected house number or blank/null.',
        },
        known_birthday: {
          type: 'string',
          description: 'Previously collected birthday in YYYY-MM-DD or blank/null.',
        },
        attempt: {
          type: 'number',
          description: 'Attempt number, usually 1 or 2.',
        },
      },
      required: ['raw_text', 'attempt'],
    },
  },
  {
    name: 'pmb_verification_phone_brain',
    description:
      'Deterministic phone verification controller. Use only after get_customer_by_phone already found a customer.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        phone_lookup_found: { type: 'boolean' },
        birthday_customer: { type: 'string' },
        check_birthday_result: { type: 'string' },
        check_birthday_error: { type: 'string' },
        birthday_system_available: { type: 'boolean' },
        birthday_request_count: { type: 'number' },
        birthday_check_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_address_brain',
    description:
      'Deterministic address fallback verification controller for PLZ + house number + birthday.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        phone_lookup_found: { type: 'boolean' },
        plz: { type: 'string' },
        house_number: { type: 'string' },
        birthday_customer: { type: 'string' },
        get_customer_by_plz_geb_result: { type: 'string' },
        address_lookup_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_vnr_brain',
    description:
      'Deterministic VNR verification controller that blocks birthday check before customer lookup.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        vnr_raw: { type: 'string' },
        vnr_candidate: { type: 'string' },
        vnr_confirmed: { type: 'boolean' },
        check_insurance_number_format_result: { type: 'string' },
        get_customer_by_insurance_number_result: { type: 'string' },
        birthday_customer: { type: 'string' },
        check_birthday_result: { type: 'string' },
        check_birthday_error: { type: 'string' },
        birthday_system_available: { type: 'boolean' },
        vnr_request_count: { type: 'number' },
        vnr_lookup_attempts: { type: 'number' },
        birthday_request_count: { type: 'number' },
        birthday_check_attempts: { type: 'number' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_brain',
    description:
      'Deterministic verification decision engine for phone, address, and VNR paths. ' +
      'Returns the next safe action, any allowed function call, any allowed transition, and exact response wording.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        phone_lookup_found: { type: 'boolean', description: 'Whether phone lookup already found a customer.' },
        identified: { type: 'boolean', description: 'Whether the customer is identified.' },
        authenticated: { type: 'boolean', description: 'Whether the customer is authenticated.' },
        lookup_path: { type: 'string', description: 'phone | address | vnr | unknown' },
        plz: { type: 'string', description: 'Collected PLZ if any.' },
        house_number: { type: 'string', description: 'Collected house number if any.' },
        birthday_customer: { type: 'string', description: 'Customer-provided birthday if any.' },
        vnr_raw: { type: 'string', description: 'Raw VNR text if any.' },
        vnr_confirmed: { type: 'boolean', description: 'Whether the VNR has been confirmed by the customer.' },
        vnr_candidate: { type: 'string', description: 'Normalized VNR candidate if any.' },
        vnr_valid_shape: { type: 'boolean', description: 'Whether the VNR is known to match the required shape.' },
        get_customer_by_plz_geb_result: { type: 'string', description: 'found | not_found | error | not_called' },
        get_customer_by_insurance_number_result: { type: 'string', description: 'found | not_found | error | not_called' },
        check_birthday_result: { type: 'string', description: 'success | failed | error | not_called' },
        check_birthday_error: { type: 'string', description: 'Any birthday-check error message.' },
        birthday_system_available: { type: 'boolean', description: 'Whether the stored birthday field is available for checking.' },
        attempt_counts: { type: 'object', description: 'JSON object with birthday/address/VNR attempt counts.' },
        customer_requested_human: { type: 'boolean', description: 'Whether the customer asked for a human.' },
        office_hours: { type: 'boolean', description: 'Whether office hours are open.' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_delivery_status_reasoner',
    description:
      'Deterministic delivery-status reasoner that returns a safe exact answer based on status, approval, and shipment history only.',
    category: 'reasoning',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Customer status, expected aktiv for valid delivery reasoning.' },
        box_genehmigt: { type: 'string', description: 'Box approval state, expected genehmigt.' },
        letzte_box: { type: 'array', description: 'Shipment history string or JSON array of strings.' },
        gen_pg54_ab: { type: 'string', description: 'PG54 approval start date if available.' },
        gen_pg51_ab: { type: 'string', description: 'PG51 approval start date if available.' },
        requested_month: { type: 'string', description: 'Month the customer is asking about.' },
        now: { type: 'string', description: 'Optional current date context.' },
        vip: { type: 'boolean', description: 'Optional VIP marker.' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_post_call_alert_detector',
    description:
      'Post-call QA and alert detector for verification loops, frustration, dropped calls, and birthday_system issues.',
    category: 'qa',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'Optional call identifier.' },
        duration_seconds: { type: 'number', description: 'Call duration in seconds.' },
        call_status: { type: 'string', description: 'completed | failed | transferred | dropped | unknown' },
        authenticated: { type: 'boolean', description: 'Whether the caller was authenticated.' },
        verification_successful: { type: 'boolean', description: 'Whether verification ultimately succeeded.' },
        transcript_text: { type: 'string', description: 'Optional full transcript text.' },
        function_calls: { type: 'array', description: 'JSON array of function call records.' },
        transitions: { type: 'array', description: 'JSON array of stage transitions.' },
        detected_events: { type: 'object', description: 'JSON object of structured detected events.' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_post_call_email_notifier',
    description:
      'Runs post-call alert detection, normalizes the result into a human-readable email, and sends it through Resend when an alert is required.',
    category: 'qa',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'Optional call identifier.' },
        call_date: { type: 'string', description: 'Optional call date string for the email.' },
        duration_seconds: { type: 'number', description: 'Call duration in seconds.' },
        call_status: { type: 'string', description: 'completed | failed | transferred | dropped | unknown' },
        authenticated: { type: 'boolean', description: 'Whether the caller was authenticated.' },
        verification_successful: { type: 'boolean', description: 'Whether verification ultimately succeeded.' },
        transcript_text: { type: 'string', description: 'Optional full transcript text.' },
        function_calls: { type: 'array', description: 'JSON array of function call records.' },
        transitions: { type: 'array', description: 'JSON array of stage transitions.' },
        detected_events: { type: 'object', description: 'JSON object of structured detected events.' },
        to_email: { type: 'string', description: 'Optional override recipient email address.' },
        dry_run: { type: 'boolean', description: 'If true, builds the email preview without sending it.' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_health_check',
    description:
      'Alias for health_check. Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    category: 'utility',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
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

// ── Status ──────────────────────────────────────────────────────────────
apiRouter.get('/status', (_req, res) => {
  const toolNames = TOOL_DEFS.map((tool) => tool.name);
  res.json({
    ok: true,
    service: 'pflegemittelbox-mcp',
    version: '0.1.0',
    env: appConfig.ENV_LABEL,
    node_env: appConfig.NODE_ENV,
    tool_count: toolNames.length,
    tools: toolNames,
    uptime_s: Math.round(process.uptime()),
  });
});

apiRouter.get('/tools', (_req, res) => {
  res.json({ tools: TOOL_DEFS });
});

// ── Tool test runner ────────────────────────────────────────────────────
apiRouter.post('/tools/:name/test', async (req, res) => {
  const { name } = req.params;
  const input = req.body ?? {};

  const start = Date.now();

  try {
    let output: unknown;

    if (name === 'normalize_vnr' || name === 'pmb_normalize_vnr') {
      const { text } = input as { text: string };
      if (typeof text !== 'string' || !text.trim()) {
        res.status(400).json({ error: '"text" (string) is required' });
        return;
      }
      output = normalizeVnr(text);
    } else if (name === 'pmb_address_verification_guardrail') {
      const guardrailInput = sanitizeGuardrailInput(input as Record<string, unknown>);
      if (!guardrailInput.raw_text.trim()) {
        res.status(400).json({ error: '"raw_text" (string) is required' });
        return;
      }
      if (!Number.isFinite(guardrailInput.attempt) || guardrailInput.attempt < 1) {
        res.status(400).json({ error: '"attempt" must be a number >= 1' });
        return;
      }
      output = parseAddressVerificationGuardrail(guardrailInput);
    } else if (name === 'pmb_verification_phone_brain') {
      output = runVerificationPhoneBrain(input as Record<string, unknown>);
    } else if (name === 'pmb_verification_address_brain') {
      output = runVerificationAddressBrain(input as Record<string, unknown>);
    } else if (name === 'pmb_verification_vnr_brain') {
      output = runVerificationVnrBrain(input as Record<string, unknown>);
    } else if (name === 'pmb_verification_brain') {
      output = runVerificationBrain(coerceVerificationBrainInput(input as Record<string, unknown>));
    } else if (name === 'pmb_delivery_status_reasoner') {
      output = runDeliveryStatusReasoner(
        coerceDeliveryStatusReasonerInput(input as Record<string, unknown>)
      );
    } else if (name === 'pmb_post_call_alert_detector') {
      output = runPostCallAlertDetector(
        coercePostCallAlertDetectorInput(input as Record<string, unknown>)
      );
    } else if (name === 'pmb_post_call_email_notifier') {
      output = await runPostCallEmailNotifier(
        coercePostCallEmailNotifierInput(input as Record<string, unknown>),
        {
          provider: appConfig.ALERT_EMAIL_PROVIDER,
          apiKey: appConfig.RESEND_API_KEY,
          from: appConfig.ALERT_EMAIL_FROM,
          defaultTo: appConfig.ALERT_EMAIL_TO,
          subjectPrefix: appConfig.ALERT_EMAIL_SUBJECT_PREFIX,
          gmailUser: appConfig.GMAIL_SMTP_USER,
          gmailAppPassword: appConfig.GMAIL_SMTP_APP_PASSWORD,
          llmEnabled: appConfig.ALERT_EMAIL_LLM_ENABLED,
          openaiApiKey: appConfig.OPENAI_API_KEY,
          openaiModel: appConfig.OPENAI_MODEL,
          openaiBaseUrl: appConfig.OPENAI_BASE_URL,
        }
      );
    } else if (name === 'health_check' || name === 'pmb_health_check') {
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
  const ALLOWED = ['mcp_url', 'env_label', 'leaping_mcp_url', 'leaping_agent_id'];

  for (const key of ALLOWED) {
    if (typeof body[key] === 'string') {
      setSetting(key, body[key]);
    }
  }
  res.json(getSettings());
});

apiRouter.get('/post-call-monitor/status', (_req, res) => {
  res.json(getPostCallMonitorState());
});

apiRouter.post('/post-call-monitor/run', async (_req, res) => {
  try {
    const summary = await runPostCallMonitorCycle(appConfig);
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, error: message });
  }
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
