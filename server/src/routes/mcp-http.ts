/**
 * MCP HTTP transport endpoints.
 *
 * Supports two transports on the same /mcp/sse path:
 *
 *   GET  /mcp/sse      — Legacy SSE transport (old MCP protocol, kept for compat)
 *   POST /mcp/sse      — Streamable HTTP transport (MCP spec 2024-11-05, what Leaping uses)
 *   POST /mcp/messages — SSE session message handler (legacy, raw body required)
 *
 * How Leaping discovery works (Streamable HTTP):
 *   1. POST /mcp/sse  { method: "initialize", ... }
 *   2. POST /mcp/sse  { method: "notifications/initialized" }  → 202
 *   3. POST /mcp/sse  { method: "tools/list" }
 *   4. POST /mcp/sse  { method: "tools/call", params: { name, arguments } }
 */
import express, { Router, Request, Response } from 'express';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { appConfig } from '../config.js';
import { createMcpServer, sseTransports } from '../mcp.js';
import { parseAddressVerificationGuardrail } from '../tools/address-verification-guardrail.js';
import {
  coerceDebugEchoSessionInput,
  coerceDebugEchoSessionOnlyInput,
  runDebugEchoSession,
  runDebugEchoSessionOnly,
} from '../tools/debug-echo-session.js';
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
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from '../tools/verification-method-router.js';
import {
  LEAPING_VERIFICATION_BRAIN_SCHEMA,
  LEAPING_VERIFICATION_VNR_BRAIN_SCHEMA,
  LEAPING_VERIFICATION_METHOD_ROUTER_SCHEMA,
} from '../tools/verification-leaping-schemas.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from '../tools/verification-method-brains.js';
import {
  toDashboardVerificationBrainResponse,
  toLeapingVerificationBrainResponse,
  toLoggedVerificationBrainResponse,
} from '../tools/verification-brain-response.js';
import {
  coerceVerificationBrainInput,
  runVerificationBrain,
} from '../tools/verification-brain.js';
import { logCall } from '../db.js';

export const mcpRouter = Router();

// ── Shared tool catalogue (single source of truth for Streamable HTTP) ────
const MCP_TOOLS = [
  {
    name: 'normalize_vnr',
    description:
      'Normalize messy spoken German VNR / insurance number text into a clean candidate. ' +
      'VNR format: 1 Latin letter + 9 digits (e.g. L039359923). ' +
      'Handles phonetic forms ("L wie Ludwig") and German number words.',
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
      'Parse and preserve PLZ, house number, and birthday from address-verification fallback turns. ' +
      'This tool does not look up or authenticate a customer. It only structures values and says what Marie should ask next.',
    inputSchema: {
      type: 'object',
      properties: {
        raw_text: {
          type: 'string',
          description: 'Latest customer utterance or transcript chunk to parse.',
        },
        known_plz: {
          type: 'string',
          description: 'Previously collected 5-digit German PLZ, if already known.',
        },
        known_house_number: {
          type: 'string',
          description: 'Previously collected house number, if already known.',
        },
        known_birthday: {
          type: 'string',
          description: 'Previously collected birthday in YYYY-MM-DD format, if already known.',
        },
        attempt: {
          type: 'number',
          description: 'Current address verification attempt number, usually 1 or 2.',
        },
      },
      required: ['raw_text', 'attempt'],
    },
  },
  {
    name: 'pmb_debug_echo_session',
    description:
      'Clone-only debug helper: echoes session_id and bound fields from Leaping Function nodes. ' +
      'Do not wire into production Marie.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        latest_customer_input: { type: 'string' },
        plz: { type: 'string' },
        hnr: { type: 'string' },
        bday: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_debug_echo_session_only',
    description:
      'Clone-only session binding smoke test. Accepts only session_id — no optional fields. ' +
      'Use in Leaping to verify session_id binding without LLM-filled extras.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_verification_method_router',
    description:
      'Clone-only verification method router. Runs after intent detection and before Kundenidentifikation. ' +
      'Chooses phone, address, or VNR path and stores it in MCP session. Does not perform CRM lookups.',
    inputSchema: LEAPING_VERIFICATION_METHOD_ROUTER_SCHEMA,
  },
  {
    name: 'pmb_verification_phone_brain',
    description:
      'Deterministic phone verification controller. Use only after get_customer_by_phone already found a customer.',
    inputSchema: LEAPING_VERIFICATION_BRAIN_SCHEMA,
  },
  {
    name: 'pmb_verification_address_brain',
    description:
      'Deterministic address fallback verification controller for PLZ + house number + birthday.',
    inputSchema: LEAPING_VERIFICATION_BRAIN_SCHEMA,
  },
  {
    name: 'pmb_verification_vnr_brain',
    description:
      'Deterministic VNR verification controller that blocks birthday check before customer lookup.',
    inputSchema: LEAPING_VERIFICATION_VNR_BRAIN_SCHEMA,
  },
  {
    name: 'pmb_verification_brain',
    description:
      'Deterministic verification decision engine for phone, address, and VNR identification paths.',
    inputSchema: {
      type: 'object',
      properties: {
        phone_lookup_found: { type: 'boolean' },
        identified: { type: 'boolean' },
        authenticated: { type: 'boolean' },
        lookup_path: { type: 'string' },
        plz: { type: 'string' },
        house_number: { type: 'string' },
        birthday_customer: { type: 'string' },
        vnr_raw: { type: 'string' },
        vnr_confirmed: { type: 'boolean' },
        vnr_candidate: { type: 'string' },
        vnr_valid_shape: { type: 'boolean' },
        get_customer_by_plz_geb_result: { type: 'string' },
        get_customer_by_insurance_number_result: { type: 'string' },
        check_birthday_result: { type: 'string' },
        check_birthday_error: { type: 'string' },
        birthday_system_available: { type: 'boolean' },
        attempt_counts: { type: 'object' },
        customer_requested_human: { type: 'boolean' },
        office_hours: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_delivery_status_reasoner',
    description:
      'Deterministic delivery-status reasoner for Pflegebox answers based on status, approval, and shipment history.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        box_genehmigt: { type: 'string' },
        letzte_box: { type: 'array' },
        gen_pg54_ab: { type: 'string' },
        gen_pg51_ab: { type: 'string' },
        requested_month: { type: 'string' },
        now: { type: 'string' },
        vip: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_post_call_alert_detector',
    description:
      'Post-call QA and alert detector for failed verification loops, frustration, dropped calls, and birthday_system issues.',
    inputSchema: {
      type: 'object',
      properties: {
        call_id: { type: 'string' },
        duration_seconds: { type: 'number' },
        call_status: { type: 'string' },
        authenticated: { type: 'boolean' },
        verification_successful: { type: 'boolean' },
        transcript_text: { type: 'string' },
        function_calls: { type: 'array' },
        transitions: { type: 'array' },
        detected_events: { type: 'object' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_post_call_email_notifier',
    description:
      'Runs post-call alert detection, formats a human-readable email, and sends it through Resend when an alert is required.',
    inputSchema: {
      type: 'object',
      properties: {
        call_id: { type: 'string' },
        call_date: { type: 'string' },
        duration_seconds: { type: 'number' },
        call_status: { type: 'string' },
        authenticated: { type: 'boolean' },
        verification_successful: { type: 'boolean' },
        transcript_text: { type: 'string' },
        function_calls: { type: 'array' },
        transitions: { type: 'array' },
        detected_events: { type: 'object' },
        to_email: { type: 'string' },
        dry_run: { type: 'boolean' },
      },
      required: [],
    },
  },
  {
    name: 'pmb_health_check',
    description:
      'Alias for health_check. Returns service health status. Use to verify the MCP server is reachable from Leaping.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'health_check',
    description:
      'Returns service health status. Use to verify the MCP server is reachable from Leaping.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Shared tool runner ─────────────────────────────────────────────────────
async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const start = Date.now();
  const nullableString = (value: unknown): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };

  switch (name) {
    case 'normalize_vnr': {
      const text = args.text;
      if (typeof text !== 'string' || !text.trim())
        throw new Error('"text" (non-empty string) is required');
      const result = normalizeVnr(text);
      logCall('normalize_vnr', { text }, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_normalize_vnr': {
      const text = args.text;
      if (typeof text !== 'string' || !text.trim())
        throw new Error('"text" (non-empty string) is required');
      const result = normalizeVnr(text);
      logCall('pmb_normalize_vnr', { text }, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_address_verification_guardrail': {
      const raw_text = args.raw_text;
      if (typeof raw_text !== 'string' || !raw_text.trim()) {
        throw new Error('"raw_text" (non-empty string) is required');
      }

      const attempt = Number(args.attempt ?? 1);
      if (!Number.isFinite(attempt) || attempt < 1) {
        throw new Error('"attempt" must be a number >= 1');
      }

      const input = {
        raw_text,
        known_plz: nullableString(args.known_plz),
        known_house_number: nullableString(args.known_house_number),
        known_birthday: nullableString(args.known_birthday),
        attempt,
      };
      const result = parseAddressVerificationGuardrail(input);
      logCall('pmb_address_verification_guardrail', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_debug_echo_session': {
      const input = coerceDebugEchoSessionInput(args);
      const result = runDebugEchoSession(input);
      logCall('pmb_debug_echo_session', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_debug_echo_session_only': {
      const input = coerceDebugEchoSessionOnlyInput(args);
      const result = runDebugEchoSessionOnly(input);
      logCall('pmb_debug_echo_session_only', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_verification_method_router': {
      const input = coerceVerificationMethodRouterInput(args);
      const result = runVerificationMethodRouter(input);
      logCall('pmb_verification_method_router', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_verification_phone_brain': {
      const input = coerceVerificationPhoneBrainInput(args);
      const result = runVerificationPhoneBrain(input);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_phone_brain', input, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }

    case 'pmb_verification_address_brain': {
      const input = coerceVerificationAddressBrainInput(args);
      const result = runVerificationAddressBrain(input);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_address_brain', input, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }

    case 'pmb_verification_vnr_brain': {
      const input = coerceVerificationVnrBrainInput(args);
      const result = runVerificationVnrBrain(input);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_vnr_brain', input, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text', text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }

    case 'pmb_verification_brain': {
      const input = coerceVerificationBrainInput(args);
      const result = runVerificationBrain(input);
      logCall('pmb_verification_brain', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_delivery_status_reasoner': {
      const input = coerceDeliveryStatusReasonerInput(args);
      const result = runDeliveryStatusReasoner(input);
      logCall('pmb_delivery_status_reasoner', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_post_call_alert_detector': {
      const input = coercePostCallAlertDetectorInput(args);
      const result = runPostCallAlertDetector(input);
      logCall('pmb_post_call_alert_detector', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_post_call_email_notifier': {
      const input = coercePostCallEmailNotifierInput(args);
      const result = await runPostCallEmailNotifier(input, {
        provider: appConfig.ALERT_EMAIL_PROVIDER,
        apiKey: appConfig.RESEND_API_KEY,
        from: appConfig.ALERT_EMAIL_FROM,
        defaultTo: appConfig.ALERT_EMAIL_TO,
        subjectPrefix: appConfig.ALERT_EMAIL_SUBJECT_PREFIX,
        gmailUser: appConfig.GMAIL_SMTP_USER,
        gmailAppPassword: appConfig.GMAIL_SMTP_APP_PASSWORD,
      });
      logCall('pmb_post_call_email_notifier', input, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }

    case 'pmb_health_check': {
      const result = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
      logCall('pmb_health_check', {}, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    case 'health_check': {
      const result = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
      logCall('health_check', {}, result, null, Date.now() - start);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    default:
      throw new Error(`Unknown tool: "${name}"`);
  }
}

// ── POST /mcp/sse — Streamable HTTP transport (Leaping) ───────────────────
// express.json() is applied inline only here so /mcp/messages still gets
// the raw stream that SSEServerTransport needs.
mcpRouter.post('/sse', express.json(), async (req: Request, res: Response) => {
  // ── 1. Log the full incoming request ──────────────────────────────────
  const body = req.body as {
    jsonrpc?: string;
    method?: string;
    id?: string | number;
    params?: unknown;
  };

  console.log(
    '\n[MCP ▶] POST /mcp/sse',
    JSON.stringify(
      {
        method: body?.method ?? '(missing)',
        id: body?.id ?? null,
        headers: {
          'content-type': req.headers['content-type'],
          accept: req.headers['accept'],
          'mcp-session-id': req.headers['mcp-session-id'],
          'user-agent': req.headers['user-agent'],
        },
        body,
      },
      null,
      2
    )
  );

  if (!body || typeof body.method !== 'string') {
    console.log('[MCP ◀] 400 — invalid or missing JSON-RPC body');
    res.status(400).json({ error: 'Missing or invalid JSON-RPC body' });
    return;
  }

  const { method, id, params } = body;

  // ── 2. Notifications: 202, no response body ────────────────────────────
  // Notifications have no "id" field per JSON-RPC spec.
  if (id === undefined || id === null || method.startsWith('notifications/')) {
    console.log(`[MCP ◀] 202 — notification "${method}"`);
    logCall(`mcp:${method}`, params ?? {}, null, null, 0);
    res.status(202).end();
    return;
  }

  // ── 3. Requests: dispatch by method ───────────────────────────────────
  try {
    let result: unknown;

    switch (method) {
      case 'initialize': {
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'pflegemittelbox-mcp', version: '0.1.0' },
        };
        break;
      }

      case 'tools/list': {
        result = { tools: MCP_TOOLS };
        break;
      }

      case 'tools/call': {
        const p = params as { name?: string; arguments?: Record<string, unknown> };
        if (!p?.name) throw new Error('"params.name" is required for tools/call');
        result = await runTool(p.name, p.arguments ?? {});
        break;
      }

      case 'ping': {
        result = {};
        break;
      }

      default: {
        const errResp = {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: "${method}"` },
        };
        console.log('[MCP ◀] 200 (method-not-found):', JSON.stringify(errResp));
        logCall(`mcp:${method}`, params ?? {}, null, `Method not found: ${method}`, 0);
        res.status(200).json(errResp);
        return;
      }
    }

    logCall(`mcp:${method}`, params ?? {}, result, null, 0);

    const response = { jsonrpc: '2.0', id, result };
    console.log('[MCP ◀] 200:', JSON.stringify(response, null, 2));
    res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errResp = { jsonrpc: '2.0', id, error: { code: -32603, message } };
    console.error('[MCP ◀] 200 (error):', message);
    logCall(`mcp:${method}`, params ?? {}, null, message, 0);
    res.status(200).json(errResp);
  }
});

// ── GET /mcp/sse — Legacy SSE transport (kept for backward compat) ─────────
// A fresh McpServer is created per connection so that repeated GET requests
// (e.g. reconnects or multiple Discover clicks) never hit the same instance.
mcpRouter.get('/sse', async (_req: Request, res: Response) => {
  const transport = new SSEServerTransport('/mcp/messages', res);
  const server = createMcpServer(); // one instance per connection lifetime

  sseTransports[transport.sessionId] = transport;

  res.on('close', () => {
    delete sseTransports[transport.sessionId];
    server.close().catch(() => {}); // detach transport → allow GC
  });

  await server.connect(transport);
});

// ── POST /mcp/messages — SSE session message handler (legacy) ─────────────
// MUST come before any express.json() in the app to keep raw body stream intact.
mcpRouter.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query.sessionId as string;
  const transport = sseTransports[sessionId];

  if (!transport) {
    res.status(400).json({ error: `No active SSE session for sessionId: ${sessionId}` });
    return;
  }

  await transport.handlePostMessage(req, res);
});
