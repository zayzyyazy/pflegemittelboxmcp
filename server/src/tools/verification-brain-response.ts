import type { VerificationMethodBrainResult } from './verification-method-brains.js';

/**
 * Jun 30 afternoon Leaping contract: core controller fields only.
 * Omits session debug blobs (stored_values, attempts, state_summary) and slim aliases.
 */
export function toLeapingLegacyCoreResponse(
  result: VerificationMethodBrainResult
): Record<string, unknown> {
  const core: Record<string, unknown> = {
    ok: result.ok,
    method: result.method,
    next_action: result.next_action,
    allowed_to_call_function: result.allowed_to_call_function,
    function_to_call: result.function_to_call,
    allowed_to_transition: result.allowed_to_transition,
    transition_to: result.transition_to,
    say: result.say,
    reason: result.reason,
    missing_fields: result.missing_fields,
    safety_flags: result.safety_flags,
  };

  if (result.function_arguments && Object.keys(result.function_arguments).length > 0) {
    core.function_arguments = result.function_arguments;
  }
  if (result.leaping_function_arguments && Object.keys(result.leaping_function_arguments).length > 0) {
    core.leaping_function_arguments = result.leaping_function_arguments;
  }
  if (result.known_values_required_next_call && Object.keys(result.known_values_required_next_call).length > 0) {
    core.known_values_required_next_call = result.known_values_required_next_call;
  }
  if (result.awaiting_field) {
    core.awaiting_field = result.awaiting_field;
  }

  return core;
}

/** Full brain result for server logs and dashboard debugging. */
export function toLoggedVerificationBrainResponse(result: VerificationMethodBrainResult) {
  return result;
}
