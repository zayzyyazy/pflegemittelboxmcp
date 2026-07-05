import {
  coerceUnifiedVerificationBrainInput,
  runUnifiedVerificationBrain,
  type UnifiedVerificationBrainInput,
} from './verification-orchestrator.js';
import type { VerificationMethodBrainResult } from './verification-method-brains.js';

export type VerificationLogicAction =
  | 'ALLOW_ASK_CUSTOMER'
  | 'ALLOW_CALL_FUNCTION'
  | 'ALLOW_TRANSITION'
  | 'ALLOW_CLARIFY_METHOD'
  | 'BLOCK_ESCALATE'
  | 'BLOCK_TRANSFER';

export type VerificationLogicPhase =
  | 'method_choice'
  | 'collect_plz'
  | 'collect_house_number'
  | 'collect_birthday'
  | 'collect_birth_year'
  | 'collect_vnr'
  | 'collect_vnr_letter'
  | 'confirm_vnr'
  | 'confirm_address'
  | 'auth_birthday'
  | 'complete'
  | 'failed'
  | 'escalate';

export interface VerificationLogicGuidance {
  goal: string;
  missing_fields: string[];
  collected: {
    plz: string | null;
    house_number: string | null;
    birthday: string | null;
    vnr_candidate: string | null;
  };
  /** Marie generates her own customer-facing wording. */
  marie_generates_speech: true;
  clarify_method: boolean;
  retry_field: string | null;
  parse_failed: boolean;
  attempt_warning: boolean;
}

export interface VerificationLogicResponse {
  ok: boolean;
  mode: 'logic_layer';
  action: VerificationLogicAction;
  /** Always empty — Marie must not read MCP scripts. */
  say: '';
  function_name: string | null;
  function_arguments?: Record<string, string>;
  transition_name: 'weiter' | 'nicht_identifiziert' | null;
  requires_followup_mcp_call: boolean;
  active_path: 'phone' | 'address' | 'vnr' | null;
  phase: VerificationLogicPhase;
  guidance: VerificationLogicGuidance;
  session_id_received?: boolean;
  session_mode?: 'session' | 'stateless';
}

function mapPhase(result: VerificationMethodBrainResult): VerificationLogicPhase {
  switch (result.next_action) {
    case 'ASK_METHOD':
      return 'method_choice';
    case 'ASK_PLZ':
      return 'collect_plz';
    case 'ASK_HOUSE_NUMBER':
      return 'collect_house_number';
    case 'ASK_BIRTHDAY':
      return 'collect_birthday';
    case 'ASK_BIRTH_YEAR':
      return 'collect_birth_year';
    case 'ASK_VNR':
      return 'collect_vnr';
    case 'ASK_VNR_LETTER':
      return 'collect_vnr_letter';
    case 'CONFIRM_VNR':
      return 'confirm_vnr';
    case 'CONFIRM_ADDRESS_VALUES':
      return 'confirm_address';
    case 'CALL_CHECK_BIRTHDAY':
      return 'auth_birthday';
    case 'TRANSITION_WEITER':
      return 'complete';
    case 'TRANSITION_NICHT_IDENTIFIZIERT':
    case 'FALLBACK_TO_VNR':
      return result.next_action === 'FALLBACK_TO_VNR' ? 'collect_vnr' : 'failed';
    case 'TECHNICAL_ESCALATION':
      return 'escalate';
    case 'TRANSFER_HUMAN':
      return 'escalate';
    default:
      if (result.next_action.startsWith('CALL_')) return 'auth_birthday';
      return 'collect_birthday';
  }
}

function mapGoal(result: VerificationMethodBrainResult, phase: VerificationLogicPhase): string {
  if (phase === 'method_choice') {
    return result.safety_flags.includes('method_choice_retry')
      ? 'clarify_verification_method'
      : 'choose_verification_method';
  }
  if (phase === 'collect_plz') return 'collect_postal_code';
  if (phase === 'collect_house_number') return 'collect_house_number';
  if (phase === 'collect_birthday') {
    if (result.safety_flags.includes('birthday_parse_failed')) return 'retry_birthday_parse';
    return 'collect_birthday';
  }
  if (phase === 'collect_birth_year') return 'collect_birth_year';
  if (phase === 'collect_vnr' || phase === 'collect_vnr_letter') {
    if (result.next_action === 'FALLBACK_TO_VNR') return 'fallback_to_vnr_after_address';
    return phase === 'collect_vnr_letter' ? 'collect_vnr_leading_letter' : 'collect_insurance_number';
  }
  if (phase === 'confirm_vnr') return 'confirm_insurance_number';
  if (phase === 'confirm_address') return 'confirm_address_values';
  if (phase === 'auth_birthday') return 'authenticate_birthday';
  if (phase === 'complete') return 'verification_complete';
  if (phase === 'failed') return 'verification_failed';
  return 'technical_escalation';
}

function mapAction(result: VerificationMethodBrainResult): VerificationLogicAction {
  if (result.next_action === 'TRANSFER_HUMAN') return 'BLOCK_TRANSFER';
  if (result.next_action === 'TECHNICAL_ESCALATION') return 'BLOCK_ESCALATE';
  if (result.next_action.startsWith('CALL_')) return 'ALLOW_CALL_FUNCTION';
  if (result.next_action.startsWith('TRANSITION_')) return 'ALLOW_TRANSITION';
  if (result.next_action === 'ASK_METHOD') {
    return result.safety_flags.includes('method_choice_retry')
      ? 'ALLOW_CLARIFY_METHOD'
      : 'ALLOW_CLARIFY_METHOD';
  }
  return 'ALLOW_ASK_CUSTOMER';
}

function attemptWarning(result: VerificationMethodBrainResult): boolean {
  const flags = result.safety_flags;
  return (
    flags.includes('vnr_request_limit_reached') ||
    flags.includes('birthday_request_limit_reached') ||
    flags.includes('address_lookup_limit_reached') ||
    flags.includes('vnr_lookup_limit_reached') ||
    flags.includes('birthday_check_limit_reached')
  );
}

export function toVerificationLogicResponse(
  result: VerificationMethodBrainResult
): VerificationLogicResponse {
  const phase = mapPhase(result);
  const stored = result.stored_values;
  const action = mapAction(result);
  const parseFailed =
    result.safety_flags.includes('birthday_parse_failed') ||
    result.safety_flags.includes('birthday_invalid') ||
    result.safety_flags.includes('method_choice_retry');

  const response: VerificationLogicResponse = {
    ok: result.ok,
    mode: 'logic_layer',
    action,
    say: '',
    function_name: result.function_to_call ?? result.function_name ?? null,
    transition_name: result.transition_to ?? result.transition_name ?? null,
    requires_followup_mcp_call:
      result.requires_followup_mcp_call ??
      (action === 'ALLOW_CALL_FUNCTION' || action === 'ALLOW_ASK_CUSTOMER' || action === 'ALLOW_CLARIFY_METHOD'),
    active_path: result.active_brain ?? (result.next_action === 'ASK_METHOD' ? null : result.method),
    phase,
    guidance: {
      goal: mapGoal(result, phase),
      missing_fields: result.missing_fields,
      collected: {
        plz: stored?.plz ?? null,
        house_number: stored?.house_number ?? null,
        birthday: stored?.birthday_customer ?? null,
        vnr_candidate: stored?.vnr_candidate ?? null,
      },
      marie_generates_speech: true,
      clarify_method: phase === 'method_choice',
      retry_field: result.awaiting_field ?? result.expected_field ?? null,
      parse_failed: parseFailed,
      attempt_warning: attemptWarning(result),
    },
    session_id_received: result.session_id_received,
    session_mode: result.session_mode,
  };

  if (result.function_arguments && Object.keys(result.function_arguments).length > 0) {
    response.function_arguments = result.function_arguments;
  }

  if (action === 'ALLOW_TRANSITION') {
    response.requires_followup_mcp_call = false;
  }

  return response;
}

/**
 * Option A hybrid verification: MCP logic/safety layer only.
 * Marie owns all customer-facing speech; MCP returns allowed actions + guidance.
 */
export function runVerificationLogicLayer(
  rawInput: UnifiedVerificationBrainInput
): VerificationLogicResponse {
  return toVerificationLogicResponse(runUnifiedVerificationBrain(rawInput));
}

export function runVerificationLogicLayerFromRecord(
  input: Record<string, unknown>
): VerificationLogicResponse {
  return runVerificationLogicLayer(coerceUnifiedVerificationBrainInput(input));
}
