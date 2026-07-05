import {
  buildMethodChoiceQuestion,
  detectAddressPreference,
  detectMethodChoiceAnswer,
  detectPathFromInput,
  detectVnrPreference,
  type VerificationPath,
} from './verification-method-router.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  loadVerificationSessionState,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
  storeVerificationSessionState,
  type VerificationMethodBrainResult,
} from './verification-method-brains.js';
import { resolvePhoneLookupFound } from './leaping-field-bindings.js';

export interface UnifiedVerificationBrainInput {
  session_id?: string;
  latest_customer_input?: string;
  phone_lookup_found?: boolean | string;
  customer_intent?: string;
  id_phone?: string;
  id?: string;
  customer_id?: string;
  get_customer_by_phone_result?: unknown;
  get_customer_by_plz_geb_result?: unknown;
  get_customer_by_insurance_number_result?: unknown;
  check_insurance_number_format_result?: unknown;
  check_birthday_result?: unknown;
  check_birthday_error?: string;
  birthday_system?: string | boolean;
  birthday_system_available?: boolean;
  birthday_customer?: string;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

const METHOD_CHOICE_RETRY_SAY =
  'Meinten Sie die Versichertennummer oder die Postleitzahl? Bitte antworten Sie mit Versichertennummer oder Postleitzahl.';

const METHOD_CHOICE_CLARIFY_SAY =
  'Ich habe das leider nicht eindeutig verstanden. Meinten Sie die Versichertennummer oder die Postleitzahl?';

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function coerceUnifiedVerificationBrainInput(
  input: Record<string, unknown>
): UnifiedVerificationBrainInput {
  return {
    session_id: optionalString(input.session_id),
    latest_customer_input: optionalString(input.latest_customer_input),
    phone_lookup_found: input.phone_lookup_found as boolean | string | undefined,
    customer_intent: optionalString(input.customer_intent),
    id_phone: optionalString(input.id_phone),
    id: optionalString(input.id) ?? optionalString(input.customer_id),
    customer_id: optionalString(input.customer_id),
    get_customer_by_phone_result: input.get_customer_by_phone_result,
    get_customer_by_plz_geb_result: input.get_customer_by_plz_geb_result,
    get_customer_by_insurance_number_result: input.get_customer_by_insurance_number_result,
    check_insurance_number_format_result: input.check_insurance_number_format_result,
    check_birthday_result: input.check_birthday_result,
    check_birthday_error: optionalString(input.check_birthday_error),
    birthday_system:
      typeof input.birthday_system === 'boolean'
        ? input.birthday_system
        : optionalString(input.birthday_system),
    birthday_system_available:
      typeof input.birthday_system_available === 'boolean'
        ? input.birthday_system_available
        : undefined,
    birthday_customer: optionalString(input.birthday_customer),
    customer_requested_human:
      typeof input.customer_requested_human === 'boolean'
        ? input.customer_requested_human
        : undefined,
    office_hours: typeof input.office_hours === 'boolean' ? input.office_hours : undefined,
  };
}

function detectVoluntaryPathSwitch(
  currentPath: VerificationPath | null | undefined,
  latestCustomerInput: string | undefined
): VerificationPath | null {
  if (!latestCustomerInput?.trim() || !currentPath) return null;

  const wantsVnr = detectVnrPreference(latestCustomerInput);
  const wantsAddress = detectAddressPreference(latestCustomerInput);
  if (!wantsVnr && !wantsAddress) return null;

  if (currentPath === 'vnr' && wantsAddress && !wantsVnr) return 'address';
  if (currentPath === 'address' && wantsVnr && !wantsAddress) return 'vnr';
  if (currentPath === 'phone') {
    if (wantsAddress && !wantsVnr) return 'address';
    if (wantsVnr && !wantsAddress) return 'vnr';
  }

  return null;
}

function persistPathChoice(
  sessionId: string | undefined,
  path: VerificationPath,
  phoneLookupFound: boolean
): void {
  if (!sessionId) return;
  const session = loadVerificationSessionState(sessionId);
  if (!session) return;
  session.active_verification_path = path;
  session.awaiting_method_choice = false;
  session.method_choice_attempts = 0;
  session.phone_lookup_found = phoneLookupFound;
  storeVerificationSessionState(sessionId, session);
}

function markAwaitingMethodChoice(sessionId: string | undefined): void {
  if (!sessionId) return;
  const session = loadVerificationSessionState(sessionId);
  if (!session) return;
  session.awaiting_method_choice = true;
  storeVerificationSessionState(sessionId, session);
}

function incrementMethodChoiceAttempts(sessionId: string | undefined): number {
  if (!sessionId) return 0;
  const session = loadVerificationSessionState(sessionId);
  if (!session) return 0;
  session.method_choice_attempts += 1;
  storeVerificationSessionState(sessionId, session);
  return session.method_choice_attempts;
}

function buildMethodChoiceResult(
  rawInput: UnifiedVerificationBrainInput,
  sessionReceived: boolean,
  retry = false
): VerificationMethodBrainResult {
  if (sessionReceived) {
    markAwaitingMethodChoice(rawInput.session_id);
  }
  const attemptCount = retry && sessionReceived
    ? incrementMethodChoiceAttempts(rawInput.session_id)
    : 0;

  return {
    ok: true,
    method: 'phone',
    active_brain: null,
    action_type: 'SAY_ONLY',
    next_action: 'ASK_METHOD',
    say: retry
      ? attemptCount >= 2
        ? METHOD_CHOICE_CLARIFY_SAY
        : METHOD_CHOICE_RETRY_SAY
      : buildMethodChoiceQuestion(rawInput.customer_intent),
    reason: retry
      ? 'Customer answer to the method question was not understood; ask again with a shorter prompt.'
      : 'Verification method must be chosen before collecting PLZ, VNR, or birthday.',
    missing_fields: ['verification_method'],
    safety_flags: retry ? ['method_choice_retry'] : [],
    allowed_to_call_function: false,
    allowed_to_transition: false,
    requires_followup_mcp_call: true,
    session_id_received: sessionReceived,
    session_mode: sessionReceived ? 'session' : 'stateless',
  };
}

function dispatchBrain(
  path: VerificationPath,
  rawInput: UnifiedVerificationBrainInput
): VerificationMethodBrainResult {
  const record = rawInput as unknown as Record<string, unknown>;
  if (path === 'phone') {
    return runVerificationPhoneBrain(coerceVerificationPhoneBrainInput(record));
  }
  if (path === 'address') {
    return runVerificationAddressBrain(coerceVerificationAddressBrainInput(record));
  }
  return runVerificationVnrBrain(coerceVerificationVnrBrainInput(record));
}

function finalizeFallbackToVnr(
  rawInput: UnifiedVerificationBrainInput,
  fallbackResult: VerificationMethodBrainResult
): VerificationMethodBrainResult {
  const sessionId = rawInput.session_id;
  if (sessionId) {
    persistPathChoice(sessionId, 'vnr', resolvePhoneLookupFound(rawInput as unknown as Record<string, unknown>));
  }

  return {
    ...fallbackResult,
    active_brain: 'vnr',
    requires_followup_mcp_call: true,
  };
}

function resolveInitialPath(
  rawInput: UnifiedVerificationBrainInput,
  session: ReturnType<typeof loadVerificationSessionState>,
  phoneLookupFound: boolean
): VerificationPath | null {
  if (phoneLookupFound) return 'phone';

  const methodAnswer = detectMethodChoiceAnswer(rawInput.latest_customer_input);
  if (methodAnswer) return methodAnswer;

  if (session?.awaiting_method_choice && rawInput.latest_customer_input) {
    return null;
  }

  return detectPathFromInput(rawInput.latest_customer_input, false);
}

/**
 * Single-dialogue verification orchestrator.
 * Combines method routing, path switching, and phone/address/VNR brain dispatch in one MCP tool.
 */
export function runUnifiedVerificationBrain(
  rawInput: UnifiedVerificationBrainInput
): VerificationMethodBrainResult {
  const sessionId = rawInput.session_id;
  const session = loadVerificationSessionState(sessionId);
  const sessionReceived = Boolean(sessionId && session);
  const inputRecord = rawInput as unknown as Record<string, unknown>;
  const phoneLookupFound = resolvePhoneLookupFound(inputRecord, session);

  const switchedPath = detectVoluntaryPathSwitch(
    session?.active_verification_path,
    rawInput.latest_customer_input
  );
  if (switchedPath) {
    persistPathChoice(sessionId, switchedPath, phoneLookupFound);
  }

  let activePath = switchedPath ?? session?.active_verification_path ?? null;

  if (!activePath) {
    const resolvedPath = resolveInitialPath(rawInput, session, phoneLookupFound);
    if (resolvedPath) {
      activePath = resolvedPath;
      persistPathChoice(sessionId, resolvedPath, phoneLookupFound);
    }
  }

  if (!activePath) {
    const retry = Boolean(session?.awaiting_method_choice && rawInput.latest_customer_input);
    return buildMethodChoiceResult(rawInput, sessionReceived, retry);
  }

  const result = dispatchBrain(activePath, rawInput);

  if (result.next_action === 'FALLBACK_TO_VNR') {
    return finalizeFallbackToVnr(rawInput, result);
  }

  return result;
}
