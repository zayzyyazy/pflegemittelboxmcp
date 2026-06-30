import { appConfig } from '../config.js';
import { logCall, recordPostCallAlertHistory } from '../db.js';
import { parseAddressVerificationGuardrail } from '../tools/address-verification-guardrail.js';
import {
  coerceDebugEchoSessionInput,
  runDebugEchoSession,
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
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from '../tools/verification-method-brains.js';
import {
  coerceVerificationBrainInput,
  runVerificationBrain,
} from '../tools/verification-brain.js';

export function sanitizeGuardrailInput(input: Record<string, unknown>) {
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

export const TOOL_DEFS = [
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
        raw_text: { type: 'string', description: 'Latest user utterance or transcript text.' },
        known_plz: { type: 'string', description: 'Previously collected PLZ or blank/null.' },
        known_house_number: { type: 'string', description: 'Previously collected house number or blank/null.' },
        known_birthday: { type: 'string', description: 'Previously collected birthday in YYYY-MM-DD or blank/null.' },
        attempt: { type: 'number', description: 'Attempt number, usually 1 or 2.' },
      },
      required: ['raw_text', 'attempt'],
    },
  },
  {
    name: 'pmb_debug_echo_session',
    description:
      'Clone-only debug helper: echoes session_id and bound fields from Leaping Function nodes. ' +
      'Do not wire into production Marie. Bind session_id = leaping_conversation_id_hex to verify stable IDs.',
    category: 'debug',
    safe: true,
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
    name: 'pmb_verification_phone_brain',
    description: 'Deterministic phone verification controller. Use only after get_customer_by_phone already found a customer.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        phone_lookup_found: { type: 'boolean' },
        latest_customer_input: { type: 'string' },
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
    description: 'Deterministic address fallback verification controller for PLZ + house number + birthday.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        phone_lookup_found: { type: 'boolean' },
        latest_customer_input: { type: 'string' },
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
    description: 'Deterministic VNR verification controller that blocks birthday check before customer lookup.',
    category: 'guardrail',
    safe: true,
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        latest_customer_input: { type: 'string' },
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
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pmb_delivery_status_reasoner',
    description:
      'Deterministic delivery-status reasoner that returns a safe exact answer based on status, approval, and shipment history only.',
    category: 'reasoning',
    safe: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pmb_post_call_alert_detector',
    description:
      'Post-call QA and alert detector for verification loops, frustration, dropped calls, and birthday_system issues.',
    category: 'qa',
    safe: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pmb_post_call_email_notifier',
    description:
      'Runs post-call alert detection, normalizes the result into a human-readable email, and sends it through the configured provider when an alert is required.',
    category: 'qa',
    safe: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'pmb_health_check',
    description: 'Alias for health_check. Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    category: 'utility',
    safe: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'health_check',
    description: 'Returns service health status. Use this to verify the MCP server is reachable from Leaping.',
    category: 'utility',
    safe: true,
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
] as const;

export async function runDashboardTool(name: string, input: Record<string, unknown>) {
  const start = Date.now();
  try {
    let output: unknown;

    if (name === 'normalize_vnr' || name === 'pmb_normalize_vnr') {
      const { text } = input as { text: string };
      if (typeof text !== 'string' || !text.trim()) {
        throw new Error('"text" (string) is required');
      }
      output = normalizeVnr(text);
    } else if (name === 'pmb_address_verification_guardrail') {
      const guardrailInput = sanitizeGuardrailInput(input);
      if (!guardrailInput.raw_text.trim()) {
        throw new Error('"raw_text" (string) is required');
      }
      if (!Number.isFinite(guardrailInput.attempt) || guardrailInput.attempt < 1) {
        throw new Error('"attempt" must be a number >= 1');
      }
      output = parseAddressVerificationGuardrail(guardrailInput);
    } else if (name === 'pmb_debug_echo_session') {
      output = runDebugEchoSession(coerceDebugEchoSessionInput(input));
    } else if (name === 'pmb_verification_phone_brain') {
      output = runVerificationPhoneBrain(coerceVerificationPhoneBrainInput(input));
    } else if (name === 'pmb_verification_address_brain') {
      output = runVerificationAddressBrain(coerceVerificationAddressBrainInput(input));
    } else if (name === 'pmb_verification_vnr_brain') {
      output = runVerificationVnrBrain(coerceVerificationVnrBrainInput(input));
    } else if (name === 'pmb_verification_brain') {
      output = runVerificationBrain(coerceVerificationBrainInput(input));
    } else if (name === 'pmb_delivery_status_reasoner') {
      output = runDeliveryStatusReasoner(coerceDeliveryStatusReasonerInput(input));
    } else if (name === 'pmb_post_call_alert_detector') {
      output = runPostCallAlertDetector(coercePostCallAlertDetectorInput(input));
    } else if (name === 'pmb_post_call_email_notifier') {
      const result = await runPostCallEmailNotifier(coercePostCallEmailNotifierInput(input), {
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
      });
      recordPostCallAlertHistory({
        callId: result.call_id,
        callDate: result.call_date,
        alertRequired: result.alert_required,
        emailSent: result.email_sent,
        provider: result.provider,
        subject: result.subject,
        biggestProblem: result.biggest_problem,
        emailText: result.email_text,
        reason: result.reason,
        severity: null,
      });
      output = result;
    } else if (name === 'health_check' || name === 'pmb_health_check') {
      output = { ok: true, service: 'pflegemittelbox-mcp', version: '0.1.0' };
    } else {
      const error = new Error(`Unknown tool: ${name}`);
      (error as Error & { statusCode?: number }).statusCode = 404;
      throw error;
    }

    const durationMs = Date.now() - start;
    logCall(name, input, output, null, durationMs);
    return { output, duration_ms: durationMs };
  } catch (error) {
    const durationMs = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    logCall(name, input, null, message, durationMs);
    throw Object.assign(new Error(message), {
      statusCode:
        error instanceof Error && 'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
          ? (error as { statusCode: number }).statusCode
          : 500,
      duration_ms: durationMs,
    });
  }
}
