/**
 * MCP server factory.
 *
 * Do NOT export a singleton McpServer. The SDK's internal Protocol class throws
 * "Already connected to a transport" if connect() is called on the same instance
 * twice. Always call createMcpServer() to get a fresh instance per connection.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { appConfig } from './config.js';
import {
  runDeliveryStatusReasoner,
} from './tools/delivery-status-reasoner.js';
import { normalizeVnr } from './tools/normalize-vnr.js';
import {
  runPostCallAlertDetector,
} from './tools/post-call-alert-detector.js';
import {
  runPostCallEmailNotifier,
} from './tools/post-call-email-notifier.js';
import { parseAddressVerificationGuardrail } from './tools/address-verification-guardrail.js';
import {
  coerceDebugEchoSessionInput,
  coerceDebugEchoSessionOnlyInput,
  runDebugEchoSession,
  runDebugEchoSessionOnly,
} from './tools/debug-echo-session.js';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './tools/verification-method-router.js';
import {
  leapingVerificationBrainZod,
  leapingVerificationMethodRouterZod,
  leapingVerificationVnrBrainZod,
} from './tools/verification-leaping-schemas.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './tools/verification-method-brains.js';
import {
  toDashboardVerificationBrainResponse,
  toLeapingVerificationBrainResponse,
  toLoggedVerificationBrainResponse,
} from './tools/verification-brain-response.js';
import { runVerificationBrain } from './tools/verification-brain.js';
import {
  coerceSafeInsuranceLookupInput,
  coerceSafePlzGebLookupInput,
  runSafeGetCustomerByInsuranceNumber,
  runSafeGetCustomerByPlzGeb,
} from './tools/safe-customer-lookup.js';
import { logCall } from './db.js';

// Active legacy SSE sessions — used by POST /mcp/messages
export const sseTransports: Record<string, SSEServerTransport> = {};

/**
 * Create a fresh McpServer with all tools registered.
 * One instance per SSE connection; discard after the connection closes.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'pflegemittelbox-mcp',
    version: '0.1.0',
  });

  const runNormalizeVnr = async (toolName: string, text: string) => {
    const start = Date.now();
    const result = normalizeVnr(text);
    logCall(toolName, { text }, result, null, Date.now() - start);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
  };

  const runHealthCheck = async (toolName: string) => {
    const result = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
    logCall(toolName, {}, result, null, 0);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  };

  server.tool(
    'normalize_vnr',
    'Normalize messy spoken German VNR / insurance number text into a clean candidate. ' +
      'VNR format: 1 Latin letter + 9 digits (e.g. L039359923). ' +
      'Understands phonetic forms ("L wie Ludwig") and German number words.',
    {
      text: z
        .string()
        .describe(
          'German spoken VNR text, e.g. "L wie Ludwig null drei neun drei fünf neun neun zwei drei"'
        ),
    },
    async ({ text }) => {
      return runNormalizeVnr('normalize_vnr', text);
    }
  );

  server.tool(
    'pmb_normalize_vnr',
    'Alias for normalize_vnr. Normalize messy spoken German VNR / insurance number text into a clean candidate.',
    {
      text: z
        .string()
        .describe(
          'German spoken VNR text, e.g. "L wie Ludwig null drei neun drei fünf neun neun zwei drei"'
        ),
    },
    async ({ text }) => runNormalizeVnr('pmb_normalize_vnr', text)
  );

  server.tool(
    'health_check',
    'Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    async () => runHealthCheck('health_check')
  );

  server.tool(
    'pmb_health_check',
    'Alias for health_check. Returns service health status.',
    async () => runHealthCheck('pmb_health_check')
  );

  server.tool(
    'pmb_safe_get_customer_by_plz_geb',
    'Safe CRM lookup by PLZ, house number, and birthday. Proxies Marie GET kunde_plzb.php and returns only ' +
      '{ found: true, id, birthday_present } or { found: false }. No email, delivery, or VIP fields.',
    {
      plz: z.string().describe('5-digit German PLZ.'),
      hnr: z.string().optional().describe('House number (alias: house_number).'),
      house_number: z.string().optional().describe('House number (alias: hnr).'),
      bday: z.string().optional().describe('Birthday YYYY-MM-DD (alias: birthday).'),
      birthday: z.string().optional().describe('Birthday YYYY-MM-DD (alias: bday).'),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceSafePlzGebLookupInput(input);
      const result = await runSafeGetCustomerByPlzGeb(coerced);
      logCall('pmb_safe_get_customer_by_plz_geb', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_safe_get_customer_by_insurance_number',
    'Safe CRM lookup by insurance number (VNR). Proxies Marie GET kunde_vnr.php and returns only ' +
      '{ found: true, id, birthday_present } or { found: false }. No email, delivery, or VIP fields.',
    {
      insurance_number: z.string().describe('Normalized VNR, e.g. L039359923.'),
    },
    async ({ insurance_number }) => {
      const start = Date.now();
      const coerced = coerceSafeInsuranceLookupInput({ insurance_number });
      const result = await runSafeGetCustomerByInsuranceNumber(coerced);
      logCall('pmb_safe_get_customer_by_insurance_number', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_address_verification_guardrail',
    'Parse and preserve PLZ, house number, and birthday from address-verification fallback turns. ' +
      'This tool does not look up or authenticate a customer. It only structures values and says what Marie should ask next.',
    {
      raw_text: z
        .string()
        .describe('Latest customer utterance or transcript chunk to parse.'),
      known_plz: z
        .string()
        .nullable()
        .describe('Previously collected 5-digit German PLZ, if already known.'),
      known_house_number: z
        .string()
        .nullable()
        .describe('Previously collected house number, if already known.'),
      known_birthday: z
        .string()
        .nullable()
        .describe('Previously collected birthday in YYYY-MM-DD format, if already known.'),
      attempt: z
        .number()
        .int()
        .min(1)
        .describe('Current address verification attempt number, usually 1 or 2.'),
    },
    async ({ raw_text, known_plz, known_house_number, known_birthday, attempt }) => {
      const start = Date.now();
      const result = parseAddressVerificationGuardrail({
        raw_text,
        known_plz,
        known_house_number,
        known_birthday,
        attempt,
      });
      logCall(
        'pmb_address_verification_guardrail',
        { raw_text, known_plz, known_house_number, known_birthday, attempt },
        result,
        null,
        Date.now() - start
      );
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_debug_echo_session',
    'Clone-only debug helper: echoes session_id and bound fields from Leaping Function nodes. ' +
      'Do not wire into production Marie. Bind session_id = leaping_conversation_id_hex to verify stable IDs.',
    {
      session_id: z.string().optional(),
      latest_customer_input: z.string().optional(),
      plz: z.string().optional(),
      hnr: z.string().optional(),
      bday: z.string().optional(),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceDebugEchoSessionInput(input);
      const result = runDebugEchoSession(coerced);
      logCall('pmb_debug_echo_session', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_debug_echo_session_only',
    'Clone-only session binding smoke test. Accepts only session_id — no optional fields. ' +
      'Use instead of pmb_debug_echo_session in Leaping to verify session_id binding without LLM-filled extras.',
    {
      session_id: z.string().optional(),
    },
    async (input) => {
      const start = Date.now();
      const coerced = coerceDebugEchoSessionOnlyInput(input);
      const result = runDebugEchoSessionOnly(coerced);
      logCall('pmb_debug_echo_session_only', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_verification_method_router',
    'Clone-only verification method router. Runs after intent detection and before Kundenidentifikation. ' +
      'Chooses phone, address, or VNR path and stores it in MCP session. Does not perform CRM lookups.',
    leapingVerificationMethodRouterZod,
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationMethodRouterInput(input);
      const result = runVerificationMethodRouter(coerced);
      logCall('pmb_verification_method_router', coerced, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_verification_phone_brain',
    'Deterministic phone verification step controller. Use only after get_customer_by_phone already found a customer.',
    leapingVerificationBrainZod,
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationPhoneBrainInput(input);
      const result = runVerificationPhoneBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_phone_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }
  );

  server.tool(
    'pmb_verification_address_brain',
    'Deterministic address fallback verification step controller for PLZ + house number + birthday.',
    leapingVerificationBrainZod,
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationAddressBrainInput(input);
      const result = runVerificationAddressBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_address_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }
  );

  server.tool(
    'pmb_verification_vnr_brain',
    'Deterministic VNR verification step controller that enforces the safe order: confirm VNR, format check, customer lookup, then birthday check.',
    leapingVerificationVnrBrainZod,
    async (input) => {
      const start = Date.now();
      const coerced = coerceVerificationVnrBrainInput(input);
      const result = runVerificationVnrBrain(coerced);
      const logged = toLoggedVerificationBrainResponse(result);
      logCall('pmb_verification_vnr_brain', coerced, logged, null, Date.now() - start);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(toLeapingVerificationBrainResponse(result), null, 2) }],
      };
    }
  );

  server.tool(
    'pmb_verification_brain',
    'Deterministic verification decision engine for phone, address, and VNR identification paths. ' +
      'Returns the next safe action, function permission, transition permission, and exact response wording.',
    {
      phone_lookup_found: z.boolean().optional(),
      identified: z.boolean().optional(),
      authenticated: z.boolean().optional(),
      lookup_path: z.enum(['phone', 'address', 'vnr', 'unknown']).optional(),
      plz: z.string().optional(),
      house_number: z.string().optional(),
      birthday_customer: z.string().optional(),
      vnr_raw: z.string().optional(),
      vnr_confirmed: z.boolean().optional(),
      vnr_candidate: z.string().optional(),
      vnr_valid_shape: z.boolean().optional(),
      get_customer_by_plz_geb_result: z
        .enum(['found', 'not_found', 'error', 'not_called'])
        .optional(),
      get_customer_by_insurance_number_result: z
        .enum(['found', 'not_found', 'error', 'not_called'])
        .optional(),
      check_birthday_result: z.enum(['success', 'failed', 'error', 'not_called']).optional(),
      check_birthday_error: z.string().optional(),
      birthday_system_available: z.boolean().optional(),
      attempt_counts: z
        .object({
          birthday_requests: z.number().optional(),
          address_lookup_attempts: z.number().optional(),
          vnr_lookup_attempts: z.number().optional(),
          birthday_check_attempts: z.number().optional(),
        })
        .optional(),
      customer_requested_human: z.boolean().optional(),
      office_hours: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const result = runVerificationBrain(input);
      logCall('pmb_verification_brain', input, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_delivery_status_reasoner',
    'Deterministic delivery-status reasoner for Pflegebox answers. ' +
      'Returns a safe exact answer based only on current status, approval, and shipment history.',
    {
      status: z.string().optional(),
      box_genehmigt: z.string().optional(),
      letzte_box: z.union([z.string(), z.array(z.string())]).optional(),
      gen_pg54_ab: z.string().optional(),
      gen_pg51_ab: z.string().optional(),
      requested_month: z.string().optional(),
      now: z.string().optional(),
      vip: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
      const result = runDeliveryStatusReasoner(input);
      logCall('pmb_delivery_status_reasoner', input, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_post_call_alert_detector',
    'Post-call QA and alert detector for verification loops, customer frustration, dropped calls, and missing birthday_system issues.',
    {
      call_id: z.string().optional(),
      duration_seconds: z.number().optional(),
      call_status: z.enum(['completed', 'failed', 'transferred', 'dropped', 'unknown']).optional(),
      authenticated: z.boolean().optional(),
      verification_successful: z.boolean().optional(),
      transcript_text: z.string().optional(),
      function_calls: z
        .array(
          z.object({
            name: z.string(),
            arguments: z.unknown().optional(),
            result: z.unknown().optional(),
            error: z.string().optional(),
            timestamp: z.string().optional(),
          })
        )
        .optional(),
      transitions: z
        .array(
          z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            timestamp: z.string().optional(),
          })
        )
        .optional(),
      detected_events: z
        .object({
          customer_frustrated: z.boolean().optional(),
          customer_requested_human: z.boolean().optional(),
          technical_issue_mentioned: z.boolean().optional(),
          repeated_birthday_requests: z.number().optional(),
          repeated_vnr_requests: z.number().optional(),
          repeated_address_requests: z.number().optional(),
          silence_or_dead_air: z.boolean().optional(),
        })
        .optional(),
    },
    async (input) => {
      const start = Date.now();
      const result = runPostCallAlertDetector(input);
      logCall('pmb_post_call_alert_detector', input, result, null, Date.now() - start);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    'pmb_post_call_email_notifier',
    'Runs the post-call alert detector, normalizes the result into a human-readable email, and sends it through Resend when an alert is required.',
    {
      call_id: z.string().optional(),
      call_date: z.string().optional(),
      duration_seconds: z.number().optional(),
      call_status: z.enum(['completed', 'failed', 'transferred', 'dropped', 'unknown']).optional(),
      authenticated: z.boolean().optional(),
      verification_successful: z.boolean().optional(),
      transcript_text: z.string().optional(),
      function_calls: z
        .array(
          z.object({
            name: z.string(),
            arguments: z.unknown().optional(),
            result: z.unknown().optional(),
            error: z.string().optional(),
            timestamp: z.string().optional(),
          })
        )
        .optional(),
      transitions: z
        .array(
          z.object({
            from: z.string().optional(),
            to: z.string().optional(),
            timestamp: z.string().optional(),
          })
        )
        .optional(),
      detected_events: z
        .object({
          customer_frustrated: z.boolean().optional(),
          customer_requested_human: z.boolean().optional(),
          technical_issue_mentioned: z.boolean().optional(),
          repeated_birthday_requests: z.number().optional(),
          repeated_vnr_requests: z.number().optional(),
          repeated_address_requests: z.number().optional(),
          silence_or_dead_air: z.boolean().optional(),
        })
        .optional(),
      to_email: z.string().optional(),
      dry_run: z.boolean().optional(),
    },
    async (input) => {
      const start = Date.now();
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
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}
