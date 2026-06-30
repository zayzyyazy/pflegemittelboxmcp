import type {
  VerificationActionType,
  VerificationMethodBrainResult,
  VerificationSessionAttempts,
  VerificationSessionStoredValues,
  AddressAwaitingField,
} from './verification-method-brains.js';
import { sanitizeVerificationBrainSplitResponse } from './verification-brain-sanitize.js';

export interface VerificationBrainController {
  ok: boolean;
  action_type: VerificationActionType;
  say: string;
  function_name: string | null;
  function_arguments?: Record<string, string>;
  transition_name: 'weiter' | 'nicht_identifiziert' | null;
  requires_followup_mcp_call: boolean;
  active_brain: 'phone' | 'address' | 'vnr';
  session_id_received?: boolean;
  session_mode?: 'session' | 'stateless';
  known_values_required_next_call?: Record<string, string>;
}

export interface VerificationBrainDebug {
  method: 'phone' | 'address' | 'vnr';
  next_action: string;
  allowed_to_call_function: boolean;
  allowed_to_transition: boolean;
  function_to_call: string | null;
  transition_to: 'weiter' | 'nicht_identifiziert' | null;
  reason: string;
  missing_fields: string[];
  safety_flags: string[];
  stored_values?: VerificationSessionStoredValues;
  attempts?: VerificationSessionAttempts;
  state_summary?: string;
  awaiting_field?: AddressAwaitingField | null;
  expected_field?: AddressAwaitingField | null;
  leaping_function_arguments?: Record<string, string>;
  known_values_required_next_call?: Record<string, string>;
  session_id?: string;
}

export interface VerificationBrainSplitResponse {
  controller: VerificationBrainController;
  debug: VerificationBrainDebug;
}

function fallbackActionType(nextAction: string, ok: boolean): VerificationActionType {
  if (nextAction.startsWith('CALL_')) return 'CALL_FUNCTION';
  if (nextAction.startsWith('TRANSITION_')) return 'TRANSITION';
  if (nextAction === 'TECHNICAL_ESCALATION' || nextAction === 'WRONG_METHOD') return 'ERROR';
  return 'SAY_ONLY';
}

function fallbackRequiresFollowup(nextAction: string, actionType: VerificationActionType): boolean {
  if (actionType === 'TRANSITION') return false;
  if (nextAction === 'TECHNICAL_ESCALATION' || nextAction === 'WRONG_METHOD' || nextAction === 'TRANSFER_HUMAN') {
    return false;
  }
  return true;
}

export function splitVerificationBrainResponse(
  result: VerificationMethodBrainResult
): VerificationBrainSplitResponse {
  const action_type = result.action_type ?? fallbackActionType(result.next_action, result.ok);
  const requires_followup_mcp_call =
    result.requires_followup_mcp_call ?? fallbackRequiresFollowup(result.next_action, action_type);

  const controller: VerificationBrainController = {
    ok: result.ok,
    action_type,
    say: result.say,
    function_name: result.function_name ?? result.function_to_call ?? null,
    transition_name: result.transition_name ?? result.transition_to ?? null,
    requires_followup_mcp_call,
    active_brain: result.active_brain ?? result.method,
  };

  if (result.function_arguments && Object.keys(result.function_arguments).length > 0) {
    controller.function_arguments = result.function_arguments;
  }

  if (result.session_id_received !== undefined) {
    controller.session_id_received = result.session_id_received;
  }
  if (result.session_mode !== undefined) {
    controller.session_mode = result.session_mode;
  }

  if (
    result.session_mode === 'stateless' &&
    result.known_values_required_next_call &&
    Object.keys(result.known_values_required_next_call).length > 0
  ) {
    controller.known_values_required_next_call = result.known_values_required_next_call;
  }

  const debug: VerificationBrainDebug = {
    method: result.method,
    next_action: result.next_action,
    allowed_to_call_function: result.allowed_to_call_function,
    allowed_to_transition: result.allowed_to_transition,
    function_to_call: result.function_to_call,
    transition_to: result.transition_to,
    reason: result.reason,
    missing_fields: result.missing_fields,
    safety_flags: result.safety_flags,
    stored_values: result.stored_values,
    attempts: result.attempts,
    state_summary: result.state_summary,
    awaiting_field: result.awaiting_field,
    expected_field: result.expected_field,
    leaping_function_arguments: result.leaping_function_arguments,
    known_values_required_next_call: result.known_values_required_next_call,
    session_id: result.session_id,
  };

  return { controller, debug };
}

/** Leaping MCP tool response: controller fields only. */
export function toLeapingVerificationBrainResponse(
  result: VerificationMethodBrainResult
): VerificationBrainController {
  return splitVerificationBrainResponse(result).controller;
}

/** Dashboard / operator tools: controller plus sanitized debug envelope. */
export function toDashboardVerificationBrainResponse(
  result: VerificationMethodBrainResult
): VerificationBrainSplitResponse {
  return sanitizeVerificationBrainSplitResponse(splitVerificationBrainResponse(result));
}

/** Log payload: controller plus sanitized debug for SQLite logs. */
export function toLoggedVerificationBrainResponse(
  result: VerificationMethodBrainResult
): VerificationBrainSplitResponse {
  return sanitizeVerificationBrainSplitResponse(splitVerificationBrainResponse(result));
}

const LEAPING_FORBIDDEN_KEYS = new Set([
  'stored_values',
  'attempts',
  'reason',
  'missing_fields',
  'safety_flags',
  'state_summary',
  'next_action',
  'function_to_call',
  'transition_to',
  'leaping_function_arguments',
  'known_values_required_next_call',
  'awaiting_field',
  'expected_field',
  'method',
  'allowed_to_call_function',
  'allowed_to_transition',
  'customer_id',
  'get_customer_by_plz_geb_result',
  'get_customer_by_insurance_number_result',
  'check_birthday_result',
  'check_insurance_number_format_result',
]);

export function leapingResponseContainsForbiddenDebug(value: unknown, path = ''): string[] {
  const hits: string[] = [];
  if (value === null || value === undefined) return hits;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      hits.push(...leapingResponseContainsForbiddenDebug(value[i], `${path}[${i}]`));
    }
    return hits;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (!path && LEAPING_FORBIDDEN_KEYS.has(key)) {
        hits.push(key);
      }
      hits.push(...leapingResponseContainsForbiddenDebug(nested, nextPath));
    }
  }
  return hits;
}
