import { normalizeVnr as normalizeVnrLoose } from './normalize-vnr.js';
import { isLookupFound, isLookupNotFound, toSafeLookupSummary, coercePhoneLookupFound, normalizeLeapingLookupInput, type LookupResultStorage } from './lookup-result-sanitize.js';
import {
  hasBirthdaySystemSignal,
  inferVnrInsuranceLookupResult,
  leapingVnrLookupFieldsPresent,
} from './leaping-field-bindings.js';
import { parseVnrUtterance } from './verification-vnr-parser.js';

export interface VerificationPhoneBrainInput {
  session_id?: string;
  phone_lookup_found?: boolean;
  latest_customer_input?: string;
  birthday_customer?: string;
  check_birthday_result?: 'success' | 'failed' | 'error' | 'not_called';
  check_birthday_error?: string;
  birthday_system_available?: boolean;
  birthday_request_count?: number;
  birthday_check_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationAddressBrainInput {
  session_id?: string;
  phone_lookup_found?: boolean;
  latest_customer_input?: string;
  plz?: string;
  house_number?: string;
  birthday_customer?: string;
  get_customer_by_plz_geb_result?: 'found' | 'not_found' | 'error' | 'not_called';
  address_lookup_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export interface VerificationVnrBrainInput {
  session_id?: string;
  latest_customer_input?: string;
  vnr_raw?: string;
  vnr_candidate?: string;
  vnr_confirmed?: boolean;
  check_insurance_number_format_result?: 'valid' | 'invalid' | 'error' | 'not_called';
  get_customer_by_insurance_number_result?: unknown;
  id?: string;
  customer_id?: string;
  birthday_system?: string | boolean;
  birthday_customer?: string;
  check_birthday_result?: 'success' | 'failed' | 'error' | 'not_called';
  check_birthday_error?: string;
  birthday_system_available?: boolean;
  vnr_request_count?: number;
  vnr_lookup_attempts?: number;
  birthday_request_count?: number;
  birthday_check_attempts?: number;
  customer_requested_human?: boolean;
  office_hours?: boolean;
}

export type AddressAwaitingField = 'plz' | 'house_number' | 'birthday_customer' | 'confirm_address';
export type VerificationActionType = 'SAY_ONLY' | 'CALL_FUNCTION' | 'TRANSITION' | 'ERROR';

export interface VerificationMethodBrainResult {
  ok: boolean;
  method: 'phone' | 'address' | 'vnr';
  next_action: string;
  allowed_to_call_function: boolean;
  function_to_call: string | null;
  allowed_to_transition: boolean;
  transition_to: 'weiter' | 'nicht_identifiziert' | null;
  say: string;
  reason: string;
  missing_fields: string[];
  safety_flags: string[];
  session_id?: string;
  session_mode?: 'session' | 'stateless';
  session_id_received?: boolean;
  state_summary?: string;
  attempts?: VerificationSessionAttempts;
  stored_values?: VerificationSessionStoredValues;
  function_arguments?: Record<string, string>;
  leaping_function_arguments?: Record<string, string>;
  action_type?: VerificationActionType;
  active_brain?: 'phone' | 'address' | 'vnr';
  function_name?: string | null;
  transition_name?: 'weiter' | 'nicht_identifiziert' | null;
  requires_followup_mcp_call?: boolean;
  awaiting_field?: AddressAwaitingField | null;
  expected_field?: AddressAwaitingField | null;
  known_values_required_next_call?: Record<string, string>;
}

export interface VerificationSessionAttempts {
  plz_attempts: number;
  house_number_attempts: number;
  birthday_collection_attempts: number;
  address_lookup_attempts: number;
  vnr_request_attempts: number;
  vnr_lookup_attempts: number;
  birthday_check_attempts: number;
}

export interface VerificationSessionStoredValues {
  active_verification_path: 'phone' | 'address' | 'vnr' | null;
  phone_lookup_found: boolean | null;
  plz: string | null;
  house_number: string | null;
  birthday_customer: string | null;
  vnr_candidate: string | null;
  vnr_digits_candidate: string | null;
  vnr_confirmed: boolean | null;
  check_birthday_result: string | null;
  check_birthday_error: string | null;
  get_customer_by_plz_geb_result: string | LookupResultStorage | null;
  get_customer_by_insurance_number_result: string | LookupResultStorage | null;
  check_insurance_number_format_result: string | null;
}

interface VerificationSessionState extends VerificationSessionStoredValues {
  pending_birthday_day: number | null;
  pending_birthday_month: number | null;
  awaiting_field: AddressAwaitingField | null;
  attempts: VerificationSessionAttempts;
  birthday_collected_before_vnr_lookup: boolean;
  vnr_customer_birthday_collected: boolean;
  vnr_awaiting_check_birthday_result: boolean;
  vnr_awaiting_customer_birthday: boolean;
  vnr_awaiting_insurance_lookup_result: boolean;
  vnr_birthday_auth_succeeded: boolean;
}

type Confidence = 'high' | 'medium' | 'low';
type BirthdayStatus = 'complete' | 'incomplete_year' | 'impossible' | 'missing';

interface BirthdayParseResult {
  status: BirthdayStatus;
  iso: string | null;
  reason?: string;
  day?: number;
  month?: number;
  year?: number;
}

interface Token {
  raw: string;
  normalized: string;
}

const DIGIT_WORDS: Record<string, string> = {
  null: '0',
  nul: '0',
  eins: '1',
  ein: '1',
  eine: '1',
  einen: '1',
  zwei: '2',
  zwo: '2',
  drei: '3',
  vier: '4',
  funf: '5',
  fuenf: '5',
  fünf: '5',
  sechs: '6',
  sieben: '7',
  acht: '8',
  neun: '9',
};

const UNIT_WORDS: Record<string, number> = {
  null: 0,
  nul: 0,
  ein: 1,
  eins: 1,
  eine: 1,
  einen: 1,
  zwei: 2,
  zwo: 2,
  drei: 3,
  vier: 4,
  funf: 5,
  fuenf: 5,
  fünf: 5,
  sechs: 6,
  sieben: 7,
  acht: 8,
  neun: 9,
  zehn: 10,
  elf: 11,
  zwoelf: 12,
  zwölf: 12,
  dreizehn: 13,
  vierzehn: 14,
  funfzehn: 15,
  fuenfzehn: 15,
  fünfzehn: 15,
  sechzehn: 16,
  siebzehn: 17,
  achtzehn: 18,
  neunzehn: 19,
};

const TENS_WORDS: Record<string, number> = {
  zwanzig: 20,
  dreissig: 30,
  dreißig: 30,
  vierzig: 40,
  funfzig: 50,
  fuenfzig: 50,
  fünfzig: 50,
  sechzig: 60,
  siebzig: 70,
  achtzig: 80,
  neunzig: 90,
};

const MONTH_WORDS: Record<string, number> = {
  januar: 1,
  jan: 1,
  februar: 2,
  feb: 2,
  maerz: 3,
  märz: 3,
  mrz: 3,
  april: 4,
  apr: 4,
  mai: 5,
  juni: 6,
  jun: 6,
  juli: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  oktober: 10,
  okt: 10,
  november: 11,
  nov: 11,
  dezember: 12,
  dez: 12,
};

const ORDINAL_MONTH_WORDS: Record<string, number> = {
  erste: 1,
  erster: 1,
  ersten: 1,
  erstem: 1,
  zweite: 2,
  zweiter: 2,
  zweiten: 2,
  zweitem: 2,
  dritte: 3,
  dritter: 3,
  dritten: 3,
  drittem: 3,
  vierte: 4,
  vierter: 4,
  vierten: 4,
  viertem: 4,
  funfte: 5,
  fuenfte: 5,
  fünfte: 5,
  funfter: 5,
  fuenfter: 5,
  fünfter: 5,
  funftem: 5,
  fuenftem: 5,
  sechste: 6,
  sechster: 6,
  sechsten: 6,
  siebte: 7,
  siebter: 7,
  siebten: 7,
  achte: 8,
  achter: 8,
  achten: 8,
  neunte: 9,
  neunter: 9,
  neunten: 9,
  zehnte: 10,
  zehnter: 10,
  zehnten: 10,
  elfte: 11,
  elfter: 11,
  elften: 11,
  zwoelfte: 12,
  zwoelfter: 12,
  zwoelften: 12,
  zwoelftem: 12,
};

const BIRTHDAY_STT_TOKEN_REPAIRS: Record<string, string> = {
  sechzen: 'sechzehn',
  sechszehn: 'sechzehn',
  sechzeen: 'sechzehn',
  siebsen: 'siebzehn',
  siebzeen: 'siebzehn',
  achtzeen: 'achtzehn',
  neunzeen: 'neunzehn',
};

const HOUSE_NUMBER_SUFFIX_WORDS = new Set(['a', 'b', 'c', 'd', 'alpha', 'beta']);
const YES_WORDS = ['ja', 'jawohl', 'stimmt', 'genau', 'korrekt', 'richtig', 'das stimmt'];
const FUNCTION_RESULT_LIKE_INPUTS = ['valid', 'true', 'false', 'found', 'not_found', 'kein kunde gefunden'];
const NEUKUNDE_PHRASES = ['ich bin neukunde', 'neukunde', 'neu kunde', 'bin neu bei', 'noch kein kunde', 'bin ein neukunde'];
const verificationSessions = new Map<string, VerificationSessionState>();

function emptyAttempts(): VerificationSessionAttempts {
  return {
    plz_attempts: 0,
    house_number_attempts: 0,
    birthday_collection_attempts: 0,
    address_lookup_attempts: 0,
    vnr_request_attempts: 0,
    vnr_lookup_attempts: 0,
    birthday_check_attempts: 0,
  };
}

function emptySessionState(): VerificationSessionState {
  return {
    active_verification_path: null,
    phone_lookup_found: null,
    plz: null,
    house_number: null,
    birthday_customer: null,
    vnr_candidate: null,
    vnr_digits_candidate: null,
    vnr_confirmed: null,
    check_birthday_result: null,
    check_birthday_error: null,
    get_customer_by_plz_geb_result: null,
    get_customer_by_insurance_number_result: null,
    check_insurance_number_format_result: null,
    pending_birthday_day: null,
    pending_birthday_month: null,
    awaiting_field: null,
    attempts: emptyAttempts(),
    birthday_collected_before_vnr_lookup: false,
    vnr_customer_birthday_collected: false,
    vnr_awaiting_check_birthday_result: false,
    vnr_awaiting_customer_birthday: false,
    vnr_awaiting_insurance_lookup_result: false,
    vnr_birthday_auth_succeeded: false,
  };
}

function getSessionState(sessionId: string | undefined): VerificationSessionState | null {
  if (!sessionId) return null;
  const existing = verificationSessions.get(sessionId);
  if (existing) return structuredClone(existing);
  const created = emptySessionState();
  verificationSessions.set(sessionId, created);
  return structuredClone(created);
}

/** Clone router + tests: load or create session state for a stable session_id. */
export function loadVerificationSessionState(
  sessionId: string | undefined
): VerificationSessionState | null {
  return getSessionState(sessionId);
}

function saveSessionState(sessionId: string | undefined, state: VerificationSessionState) {
  if (!sessionId) return;
  verificationSessions.set(sessionId, structuredClone(state));
}

/** Persist verification session after router or brain updates. */
export function storeVerificationSessionState(
  sessionId: string | undefined,
  state: VerificationSessionState
): void {
  saveSessionState(sessionId, state);
}

export type { VerificationSessionState };

function toNullableString(value: string | undefined): string | null {
  return value ?? null;
}

function stateSummary(state: VerificationSessionState): string {
  return [
    `path=${state.active_verification_path ?? 'unknown'}`,
    `phone_lookup_found=${state.phone_lookup_found === null ? 'unknown' : String(state.phone_lookup_found)}`,
    `plz=${state.plz ?? 'missing'}`,
    `house_number=${state.house_number ?? 'missing'}`,
    `birthday=${state.birthday_customer ?? 'missing'}`,
    `vnr=${state.vnr_candidate ?? 'missing'}`,
  ].join(' | ');
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/[.,/\\-]/g, '')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function tokenize(text: string): Token[] {
  return text
    .split(/[\s-]+/)
    .map((raw) => ({ raw, normalized: normalizeToken(raw) }))
    .filter((token) => token.normalized.length > 0);
}

function normalizeVnr(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.replace(/\s+/g, '').toUpperCase() || undefined;
}

function isYesLike(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return YES_WORDS.some((word) => normalized === word || normalized.includes(word));
}

function isMissingBirthdaySystem(error: string | undefined): boolean {
  return (error ?? '').includes('Missing field value: birthday_system');
}

function normalizeBooleanAlias(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === 'valid' || normalized === 'valid!') return true;
  if (normalized === 'false' || normalized === 'invalid') return false;
  return undefined;
}

function looksLikeFunctionResultInput(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.trim().toLowerCase();
  return FUNCTION_RESULT_LIKE_INPUTS.includes(normalized);
}

function getSpeechInput(latestCustomerInput: string | undefined, safetyFlags: string[]): string | undefined {
  if (!looksLikeFunctionResultInput(latestCustomerInput)) return latestCustomerInput;
  if (!safetyFlags.includes('latest_customer_input_looks_like_function_result')) {
    safetyFlags.push('latest_customer_input_looks_like_function_result');
  }
  return undefined;
}

function normalizeLookupResult(value: unknown): 'found' | 'not_found' | 'error' | 'not_called' | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'not_called') return 'not_called';
    if (normalized === 'found') return 'found';
    if (normalized === 'error') return 'error';
    if (normalized === 'not_found' || normalized.includes('kein kunde gefunden')) return 'not_found';
    return 'found';
  }
  if (typeof value === 'boolean') return value ? 'found' : 'not_found';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (record.found === true) return 'found';
    if (record.found === false) return 'not_found';
    const errorValue = asString(record.error) ?? asString(record.message);
    if (errorValue) {
      if (errorValue.toLowerCase().includes('kein kunde gefunden')) return 'not_found';
      return 'error';
    }
    if ('id' in record || 'customer_id' in record) return 'found';
    return undefined;
  }
  return undefined;
}

function lookupResultReceivedThisTurn(rawInput: VerificationVnrBrainInput): boolean {
  if (rawInput.get_customer_by_insurance_number_result !== undefined) return true;
  return leapingVnrLookupFieldsPresent(rawInput as Record<string, unknown>);
}

function getVnrAuthBirthdayCustomer(
  session: VerificationSessionState | null,
  rawInput: VerificationVnrBrainInput,
  birthdayMerge: ReturnType<typeof mergeBirthday>,
  lookupFound: boolean
): string | undefined {
  if (!lookupFound) return undefined;

  if (rawInput.latest_customer_input && birthdayMerge.value) {
    return birthdayMerge.value;
  }
  if (session?.vnr_customer_birthday_collected && session.birthday_customer) {
    return session.birthday_customer;
  }
  if (session?.birthday_collected_before_vnr_lookup && session.birthday_customer) {
    return session.birthday_customer;
  }
  return undefined;
}

function isVnrInsuranceLookupResolved(
  input: VerificationVnrBrainInput,
  session: VerificationSessionState | null,
  rawLookup: unknown
): boolean {
  return (
    isLookupFound(input.get_customer_by_insurance_number_result) ||
    isLookupFound(rawLookup) ||
    isLookupFound(session?.get_customer_by_insurance_number_result)
  );
}

function restoreVnrFromSessionForPostLookup(
  input: VerificationVnrBrainInput,
  session: VerificationSessionState | null
): VerificationVnrBrainInput {
  if (!session) return input;
  const restored = { ...input };
  if (session.vnr_candidate && /^[A-Z][0-9]{9}$/.test(session.vnr_candidate)) {
    restored.vnr_candidate = session.vnr_candidate;
  } else if (session.vnr_candidate) {
    restored.vnr_candidate = session.vnr_candidate;
  }
  if (session.vnr_confirmed === true) {
    restored.vnr_confirmed = true;
  }
  return restored;
}

interface VnrInsuranceLookupFoundContext {
  input: VerificationVnrBrainInput;
  session: VerificationSessionState | null;
  effectiveCheckBirthdayResult: 'success' | 'failed' | 'error' | 'not_called';
  vnrAuthBirthday: string | undefined;
  birthdayMerge: ReturnType<typeof mergeBirthday>;
  latestCustomerInput?: string;
  checkBirthdayArgs: ReturnType<typeof buildCheckBirthdayFunctionArgs> | null;
  finalize: (result: VerificationMethodBrainResult) => VerificationMethodBrainResult;
}

function shouldIgnorePrematureVnrCheckBirthdaySuccess(
  session: VerificationSessionState | null,
  options: {
    lookupCallbackTurn: boolean;
    lookupFound: boolean;
    checkBirthdayResultThisTurn: boolean;
    effectiveResult: 'success' | 'failed' | 'error' | 'not_called';
  }
): boolean {
  if (options.effectiveResult !== 'success') return false;
  if (options.checkBirthdayResultThisTurn) return false;
  if (session?.vnr_birthday_auth_succeeded || session?.check_birthday_result === 'success') {
    return false;
  }
  if (session?.vnr_awaiting_check_birthday_result) return false;
  if ((session?.attempts.birthday_check_attempts ?? 0) > 0) return false;
  if (options.lookupCallbackTurn && options.lookupFound) return true;
  return true;
}

function isVnrBirthdayAuthSucceeded(
  session: VerificationSessionState | null,
  effectiveCheckBirthdayResult: 'success' | 'failed' | 'error' | 'not_called'
): boolean {
  return (
    effectiveCheckBirthdayResult === 'success' ||
    session?.check_birthday_result === 'success' ||
    session?.vnr_birthday_auth_succeeded === true
  );
}

const VNR_BIRTHDAY_FIRST_ASK_SAY =
  'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.';

const VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY =
  'Das Geburtsdatum konnte ich leider nicht bestätigen. Bitte nennen Sie mir Ihr Geburtsdatum noch einmal vollständig mit Tag, Monat und Jahr.';

const VNR_BIRTHDAY_PARSE_RETRY_SAY =
  'Ich habe das Geburtsdatum leider akustisch nicht sicher verstanden. Bitte nennen Sie es im Format Tag, Monat und Jahr.';

function isVnrInBirthdayAuthPhase(
  session: VerificationSessionState | null,
  input: VerificationVnrBrainInput
): boolean {
  if (session?.vnr_birthday_auth_succeeded) return false;
  return (
    session?.vnr_awaiting_customer_birthday === true ||
    session?.vnr_awaiting_check_birthday_result === true ||
    session?.vnr_customer_birthday_collected === true ||
    (session?.attempts.birthday_check_attempts ?? 0) > 0 ||
    (input.birthday_check_attempts ?? 0) > 0
  );
}

function runVnrInsuranceLookupFoundStep(
  ctx: VnrInsuranceLookupFoundContext
): VerificationMethodBrainResult {
  const {
    input,
    session,
    effectiveCheckBirthdayResult,
    vnrAuthBirthday,
    birthdayMerge,
    latestCustomerInput,
    checkBirthdayArgs,
    finalize,
  } = ctx;

  if (isVnrBirthdayAuthSucceeded(session, effectiveCheckBirthdayResult)) {
    if (session) {
      session.vnr_birthday_auth_succeeded = true;
      session.vnr_awaiting_customer_birthday = false;
    }
    return finalize(makeResult('vnr', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after the customer was found by insurance number.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    }));
  }

  if (birthdayMerge.parse.status === 'incomplete_year' && latestCustomerInput) {
    return finalize(makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTH_YEAR',
      say: 'Bitte nennen Sie mir noch das Geburtsjahr vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was only partially provided.',
      missing_fields: ['birth_year'],
      safety_flags: [],
    }));
  }

  if (birthdayMerge.parse.status === 'impossible' && latestCustomerInput) {
    const say = isVnrInBirthdayAuthPhase(session, input)
      ? VNR_BIRTHDAY_PARSE_RETRY_SAY
      : 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.';
    if (session && isVnrInBirthdayAuthPhase(session, input)) {
      session.vnr_awaiting_customer_birthday = true;
    }
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say,
      reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_invalid'],
    }));
  }

  if (
    latestCustomerInput &&
    isVnrInBirthdayAuthPhase(session, input) &&
    !vnrAuthBirthday &&
    birthdayMerge.parse.status === 'missing'
  ) {
    if (session) session.vnr_awaiting_customer_birthday = true;
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say: VNR_BIRTHDAY_PARSE_RETRY_SAY,
      reason: 'Birthday speech could not be parsed during VNR birthday auth.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_parse_failed'],
    }));
  }

  if (
    effectiveCheckBirthdayResult === 'failed' &&
    isVnrInBirthdayAuthPhase(session, input)
  ) {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      if (session) session.vnr_awaiting_customer_birthday = false;
      return finalize(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    if (session) session.vnr_awaiting_customer_birthday = true;
    return finalize(makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY,
      reason: 'Birthday check failed and a smart retry is required.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_retry'],
    }));
  }

  if (!vnrAuthBirthday) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return finalize(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    if (session) session.vnr_awaiting_customer_birthday = true;
    return finalize(makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: VNR_BIRTHDAY_FIRST_ASK_SAY,
      reason: 'Customer lookup by insurance number found a customer, so birthday is the next safe verification step.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['vnr_found_requires_birthday_auth'],
    }));
  }

  if (input.birthday_system_available === false) {
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }));
  }

  const result = makeResult('vnr', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Customer lookup found a customer and birthday is available, so check_birthday is the next safe step.',
    missing_fields: [],
    safety_flags: ['vnr_found_requires_birthday_auth'],
    function_to_call: 'check_birthday',
    function_arguments: checkBirthdayArgs?.function_arguments,
    leaping_function_arguments: checkBirthdayArgs?.leaping_function_arguments,
  });
  if (session) {
    session.vnr_awaiting_check_birthday_result = true;
    session.vnr_awaiting_customer_birthday = false;
  }
  return finalize(result);
}

function mergeNormalizedLookupResult(
  rawInput: unknown,
  sessionValue: string | LookupResultStorage | null | undefined,
  defaultValue: 'found' | 'not_found' | 'error' | 'not_called' = 'not_called'
): 'found' | 'not_found' | 'error' | 'not_called' {
  if (rawInput !== undefined) {
    const normalized = normalizeLookupResult(rawInput);
    if (normalized !== undefined) return normalized;
  }
  if (sessionValue !== undefined && sessionValue !== null) {
    const normalized = normalizeLookupResult(sessionValue);
    if (normalized !== undefined) return normalized;
  }
  return defaultValue;
}

function storeLookupResult(value: unknown): LookupResultStorage {
  return toSafeLookupSummary(value) ?? 'not_called';
}

function mergeNormalizedCheckBirthdayResult(
  rawInput: unknown,
  sessionValue: string | null | undefined
): 'success' | 'failed' | 'error' | 'not_called' {
  if (rawInput !== undefined) {
    const normalized = normalizeCheckBirthdayResult(rawInput);
    if (normalized !== undefined) return normalized;
  }
  if (sessionValue !== undefined && sessionValue !== null) {
    const normalized = normalizeCheckBirthdayResult(sessionValue);
    if (normalized !== undefined) return normalized;
  }
  return 'not_called';
}

function mergeNormalizedFormatResult(
  rawInput: unknown,
  sessionValue: string | null | undefined
): 'valid' | 'invalid' | 'error' | 'not_called' {
  if (rawInput !== undefined) {
    const normalized = normalizeFormatResult(rawInput);
    if (normalized !== undefined) return normalized;
  }
  if (sessionValue !== undefined && sessionValue !== null) {
    const normalized = normalizeFormatResult(sessionValue);
    if (normalized !== undefined) return normalized;
  }
  return 'not_called';
}

function isNeukundeLike(text: string | undefined): boolean {
  if (!text) return false;
  const normalized = text.toLowerCase().trim();
  return NEUKUNDE_PHRASES.some((phrase) => normalized.includes(phrase));
}

function normalizeCheckBirthdayResult(value: unknown): 'success' | 'failed' | 'error' | 'not_called' | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'success' || value === 'failed' || value === 'error' || value === 'not_called') return value;
  const booleanAlias = normalizeBooleanAlias(value);
  if (booleanAlias === true) return 'success';
  if (booleanAlias === false) return 'failed';
  return undefined;
}

function normalizeFormatResult(value: unknown): 'valid' | 'invalid' | 'error' | 'not_called' | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'valid' || value === 'invalid' || value === 'error' || value === 'not_called') return value;
  const booleanAlias = normalizeBooleanAlias(value);
  if (booleanAlias === true) return 'valid';
  if (booleanAlias === false) return 'invalid';
  return undefined;
}

function parseGermanCardinalWord(input: string): number | null {
  const word = normalizeToken(input);
  if (!word) return null;
  if (/^\d+$/.test(word)) return Number(word);
  if (UNIT_WORDS[word] !== undefined) return UNIT_WORDS[word];
  if (TENS_WORDS[word] !== undefined) return TENS_WORDS[word];

  const tausendIndex = word.indexOf('tausend');
  if (tausendIndex >= 0) {
    const left = word.slice(0, tausendIndex);
    const right = word.slice(tausendIndex + 'tausend'.length);
    const leftValue = left ? parseGermanCardinalWord(left) : 1;
    const rightValue = right ? parseGermanCardinalWord(right) : 0;
    if (leftValue === null || rightValue === null) return null;
    return leftValue * 1000 + rightValue;
  }

  const hundertIndex = word.indexOf('hundert');
  if (hundertIndex >= 0) {
    const left = word.slice(0, hundertIndex);
    const right = word.slice(hundertIndex + 'hundert'.length);
    const leftValue = left ? parseGermanCardinalWord(left) : 1;
    const rightValue = right ? parseGermanCardinalWord(right) : 0;
    if (leftValue === null || rightValue === null) return null;
    return leftValue * 100 + rightValue;
  }

  for (const [tensWord, tensValue] of Object.entries(TENS_WORDS)) {
    if (word.endsWith(tensWord)) {
      const left = word.slice(0, -tensWord.length);
      if (!left.endsWith('und')) continue;
      const unitWord = left.slice(0, -3);
      const unitValue = parseGermanCardinalWord(unitWord);
      if (unitValue === null || unitValue > 9) return null;
      return tensValue + unitValue;
    }
  }

  return null;
}

function parseOrdinalToken(input: string): number | null {
  const word = normalizeToken(input);
  if (!word) return null;
  if (/^\d+$/.test(word)) return Number(word);

  const direct: Record<string, number> = {
    erste: 1,
    erster: 1,
    ersten: 1,
    zweiter: 2,
    zweite: 2,
    zweiten: 2,
    dritte: 3,
    dritter: 3,
    dritten: 3,
    vierte: 4,
    vierter: 4,
    vierten: 4,
    funfte: 5,
    fuenfte: 5,
    fünfte: 5,
    sechzehnte: 16,
    sechzehnter: 16,
    sechzehnten: 16,
    siebzehnte: 17,
    siebzehnter: 17,
    siebzehnten: 17,
  };
  if (direct[word] !== undefined) return direct[word];

  const stripped = word.replace(/(ste|ster|sten|stes|te|ter|ten|tes)$/u, '');
  const repaired =
    stripped === 'dritt'
      ? 'drei'
      : stripped === 'fuenft' || stripped === 'funft'
        ? 'fuenf'
        : stripped;
  return parseGermanCardinalWord(repaired);
}

function repairBirthdayToken(normalized: string): string {
  return BIRTHDAY_STT_TOKEN_REPAIRS[normalized] ?? normalized;
}

function parseMonthToken(normalized: string): number | undefined {
  const repaired = repairBirthdayToken(normalized);
  return MONTH_WORDS[repaired] ?? ORDINAL_MONTH_WORDS[repaired];
}

function parseDayToken(input: string): number | null {
  const repaired = repairBirthdayToken(normalizeToken(input));
  return parseOrdinalToken(repaired) ?? parseGermanCardinalWord(repaired);
}

function inferBirthdayYear(year: number, day: number, month: number): number | null {
  const nowYear = new Date().getUTCFullYear();
  if (year >= 100) {
    return year > nowYear ? null : year;
  }

  const candidate1900 = 1900 + year;
  const candidate2000 = 2000 + year;

  const isPlausibleAdultBirthYear = (fullYear: number): boolean => {
    if (fullYear > nowYear) return false;
    const age = nowYear - fullYear;
    return age >= 18 && age <= 120;
  };

  const valid1900 = isPlausibleAdultBirthYear(candidate1900);
  const valid2000 = isPlausibleAdultBirthYear(candidate2000);

  if (valid2000 && !valid1900) return candidate2000;
  if (valid1900 && !valid2000) return candidate1900;
  if (valid1900 && valid2000) return candidate1900;
  return candidate1900;
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const inferredYear = inferBirthdayYear(year, day, month);
  if (inferredYear === null) return null;
  const date = new Date(Date.UTC(inferredYear, month - 1, day));
  if (
    date.getUTCFullYear() !== inferredYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${inferredYear.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
}

function parseGermanYearTokens(tokens: Token[], start: number): { year: number | null; used: number } {
  for (let length = Math.min(4, tokens.length - start); length >= 1; length -= 1) {
    const joined = tokens
      .slice(start, start + length)
      .map((token) => repairBirthdayToken(token.normalized))
      .join('');
    const value = parseGermanCardinalWord(joined);
    if (value !== null) return { year: value, used: length };
  }
  return { year: null, used: 0 };
}

function parseBirthday(rawText: string | undefined): BirthdayParseResult {
  if (!rawText) return { status: 'missing', iso: null };

  const numericMatch = rawText.match(/\b(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*[./-]\s*(\d{2,4}))?\b/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    if (!numericMatch[3]) {
      return { status: 'incomplete_year', iso: null, reason: 'Day and month were provided but year is missing.', day, month };
    }
    const year = Number(numericMatch[3]);
    const iso = toIsoDate(day, month, year);
    return iso
      ? { status: 'complete', iso, day, month, year }
      : { status: 'impossible', iso: null, reason: 'Birthday looked numeric but was impossible or in the future.' };
  }

  const spaceNumericMatch = rawText.match(/\b(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})\b/);
  if (spaceNumericMatch) {
    const day = Number(spaceNumericMatch[1]);
    const month = Number(spaceNumericMatch[2]);
    const year = Number(spaceNumericMatch[3]);
    const iso = toIsoDate(day, month, year);
    return iso
      ? { status: 'complete', iso, day, month, year }
      : { status: 'impossible', iso: null, reason: 'Birthday looked numeric but was impossible or in the future.' };
  }

  const tokens = tokenize(rawText);
  for (let i = 0; i < tokens.length; i += 1) {
    const monthValue = parseMonthToken(tokens[i].normalized);
    if (monthValue === undefined || i === 0) continue;
    const dayValue = parseDayToken(tokens[i - 1].normalized);
    if (dayValue === null) continue;
    const { year, used } = parseGermanYearTokens(tokens, i + 1);
    if (year === null || used === 0) {
      return { status: 'incomplete_year', iso: null, reason: 'Day and month were provided but year is missing.', day: dayValue, month: monthValue };
    }
    const iso = toIsoDate(dayValue, monthValue, year);
    return iso
      ? { status: 'complete', iso, day: dayValue, month: monthValue, year }
      : { status: 'impossible', iso: null, reason: 'Birthday was impossible or in the future.' };
  }

  const tokensOnlyYear = tokenize(rawText);
  const yearOnly = parseGermanYearTokens(tokensOnlyYear, 0);
  if (yearOnly.year !== null && yearOnly.used === tokensOnlyYear.length) {
    return { status: 'missing', iso: null, year: yearOnly.year };
  }

  return { status: 'missing', iso: null };
}

/** Exported for unit tests covering spoken German birthday parsing. */
export function parseVerificationBirthday(rawText: string | undefined): BirthdayParseResult {
  return parseBirthday(rawText);
}

function extractDigitRuns(rawText: string): string[] {
  const tokens = tokenize(rawText);
  const runs: string[] = [];
  let current = '';

  for (const token of tokens) {
    const digit = DIGIT_WORDS[token.normalized];
    if (/^\d+$/.test(token.normalized)) {
      current += token.normalized;
      continue;
    }
    if (digit !== undefined) {
      current += digit;
      continue;
    }
    if (current) {
      runs.push(current);
      current = '';
    }
  }
  if (current) runs.push(current);
  return runs;
}

function parsePlz(rawText: string | undefined): string | undefined {
  if (!rawText) return undefined;
  const directMatches = rawText.match(/\b\d{5}\b/g);
  if (directMatches?.length) return directMatches[0];
  const digitRuns = extractDigitRuns(rawText).find((run) => run.length === 5);
  return digitRuns;
}

function stripHouseNumberSuffix(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const match = compact.match(/^(\d+)/);
  return match ? match[1] : '';
}

function isHouseNumberSuffixToken(token: Token): boolean {
  return HOUSE_NUMBER_SUFFIX_WORDS.has(token.normalized) || /^[a-z]$/i.test(token.normalized);
}

function parseNumberFromTokenWindow(tokens: Token[], start: number): { value: string | null; used: number; confidence: Confidence } {
  const maxLength = Math.min(4, tokens.length - start);

  for (let length = maxLength; length >= 1; length -= 1) {
    const window = tokens.slice(start, start + length).map((token) => token.normalized);
    const joined = window.join('');

    if (length === 1) {
      const digitPrefix = stripHouseNumberSuffix(window[0]);
      if (digitPrefix) return { value: digitPrefix, used: 1, confidence: 'high' };
    }

    const spokenDigits = window.map((token) => DIGIT_WORDS[token]);
    if (spokenDigits.every((digit) => digit !== undefined)) {
      return { value: spokenDigits.join(''), used: length, confidence: 'high' };
    }

    const cardinalValue = parseGermanCardinalWord(joined);
    if (cardinalValue !== null) {
      return { value: String(cardinalValue), used: length, confidence: 'high' };
    }
  }

  return { value: null, used: 0, confidence: 'low' };
}

function parseHouseNumber(rawText: string | undefined): string | undefined {
  if (!rawText) return undefined;
  const tokens = tokenize(rawText);
  const cueIndex = tokens.findIndex((token) =>
    ['hausnummer', 'hausnr', 'nummer', 'nr'].includes(token.normalized)
  );

  const tryParseAt = (start: number, explicitCue = false): string | undefined => {
    const parsed = parseNumberFromTokenWindow(tokens, start);
    if (!parsed.value) return undefined;
    if (explicitCue) return parsed.value;
    if (parsed.value.length === 5) return undefined;
    const trailing = tokens.slice(start + parsed.used);
    if (trailing.some((token) => !isHouseNumberSuffixToken(token))) return undefined;
    return parsed.value;
  };

  if (cueIndex !== -1) {
    for (let i = cueIndex + 1; i < tokens.length; i += 1) {
      const parsed = parseNumberFromTokenWindow(tokens, i);
      if (parsed.value) return parsed.value;
    }
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const value = tryParseAt(i);
    if (value) return value;
  }
  return undefined;
}

function utteranceContainsValidPlz(rawText: string | undefined): string | undefined {
  if (!rawText) return undefined;
  const plz = parsePlz(rawText);
  return plz && /^\d{5}$/.test(plz) ? plz : undefined;
}

function parseHouseNumberFromUtterance(rawText: string | undefined): string | undefined {
  if (!rawText) return undefined;
  if (utteranceContainsValidPlz(rawText)) return undefined;
  return parseHouseNumber(rawText);
}

function resolveAddressAwaitingField(args: {
  plz?: string;
  house_number?: string;
  birthday_customer?: string;
  get_customer_by_plz_geb_result?: VerificationAddressBrainInput['get_customer_by_plz_geb_result'];
  address_lookup_attempts?: number;
  sessionAwaiting?: AddressAwaitingField | null;
}): AddressAwaitingField {
  if (
    args.get_customer_by_plz_geb_result === 'not_found' &&
    (args.address_lookup_attempts ?? 0) >= 1 &&
    args.plz &&
    args.house_number &&
    args.birthday_customer
  ) {
    return 'confirm_address';
  }
  if (args.sessionAwaiting === 'confirm_address') return 'confirm_address';
  if (!args.plz) return 'plz';
  if (!args.house_number) return 'house_number';
  if (!args.birthday_customer) return 'birthday_customer';
  return 'confirm_address';
}

function parseAddressFieldFromUtterance(
  awaitingField: AddressAwaitingField,
  rawText: string | undefined,
  existingBirthday?: string,
  pendingDay?: number | null,
  pendingMonth?: number | null
): {
  plz?: string;
  house_number?: string;
  birthdayMerge?: ReturnType<typeof mergeBirthday>;
} {
  if (!rawText) return {};

  if (awaitingField === 'plz') {
    const plz = parsePlz(rawText);
    return plz && /^\d{5}$/.test(plz) ? { plz } : {};
  }

  if (awaitingField === 'house_number') {
    const house_number = parseHouseNumberFromUtterance(rawText);
    return house_number ? { house_number } : {};
  }

  if (awaitingField === 'birthday_customer') {
    if (rawText.toLowerCase().includes('nein')) {
      const house_number = parseHouseNumberFromUtterance(rawText);
      if (house_number) return { house_number };
    }
    return { birthdayMerge: mergeBirthday(existingBirthday, rawText, pendingDay, pendingMonth) };
  }

  if (awaitingField === 'confirm_address') {
    const parsed: {
      plz?: string;
      house_number?: string;
      birthdayMerge?: ReturnType<typeof mergeBirthday>;
    } = {};
    const plz = parsePlz(rawText);
    if (plz && /^\d{5}$/.test(plz)) parsed.plz = plz;
    const house_number = parseHouseNumberFromUtterance(rawText);
    if (house_number) parsed.house_number = house_number;
    const birthdayMerge = mergeBirthday(existingBirthday, rawText, pendingDay, pendingMonth);
    if (birthdayMerge.parse.status === 'complete' && birthdayMerge.value) {
      parsed.birthdayMerge = birthdayMerge;
    }
    return parsed;
  }

  return {};
}

function buildPlzGebFunctionArgs(plz: string, house_number: string, birthday_customer: string) {
  const hnr = house_number;
  const bday = birthday_customer;
  return {
    function_arguments: { plz, hnr, bday },
    leaping_function_arguments: { plz, hnr, bday, house_number, birthday: birthday_customer },
  };
}

function buildCheckBirthdayFunctionArgs(birthday_customer: string) {
  return {
    function_arguments: { birthday: birthday_customer },
    leaping_function_arguments: { birthday: birthday_customer, bday: birthday_customer },
  };
}

function buildInsuranceNumberFunctionArgs(insurance_number: string) {
  return {
    function_arguments: { insurance_number },
    leaping_function_arguments: { insurance_number },
  };
}

function computeActionType(nextAction: string, ok: boolean): VerificationActionType {
  if (nextAction.startsWith('CALL_')) return 'CALL_FUNCTION';
  if (nextAction.startsWith('TRANSITION_')) return 'TRANSITION';
  if (nextAction === 'TECHNICAL_ESCALATION' || nextAction === 'WRONG_METHOD') {
    return 'ERROR';
  }
  return 'SAY_ONLY';
}

function requiresFollowupMcpCall(nextAction: string, actionType: VerificationActionType): boolean {
  if (actionType === 'TRANSITION') return false;
  if (nextAction === 'TECHNICAL_ESCALATION' || nextAction === 'WRONG_METHOD' || nextAction === 'TRANSFER_HUMAN') {
    return false;
  }
  return true;
}

function buildKnownValuesRequiredNextCall(
  sessionId: string | undefined,
  values: {
    plz?: string;
    house_number?: string;
    birthday_customer?: string;
    get_customer_by_plz_geb_result?: string;
    address_lookup_attempts?: number;
    phone_lookup_found?: boolean;
  }
): Record<string, string> {
  if (sessionId) return {};
  const known: Record<string, string> = {};
  if (values.plz) known.plz = values.plz;
  if (values.house_number) known.house_number = values.house_number;
  if (values.birthday_customer) known.birthday_customer = values.birthday_customer;
  if (values.get_customer_by_plz_geb_result && values.get_customer_by_plz_geb_result !== 'not_called') {
    known.get_customer_by_plz_geb_result = values.get_customer_by_plz_geb_result;
  }
  if (values.address_lookup_attempts !== undefined && values.address_lookup_attempts > 0) {
    known.address_lookup_attempts = String(values.address_lookup_attempts);
  }
  if (values.phone_lookup_found !== undefined) {
    known.phone_lookup_found = String(values.phone_lookup_found);
  }
  return known;
}

function storedValuesFromAddressInput(input: VerificationAddressBrainInput): VerificationSessionStoredValues {
  return {
    active_verification_path: 'address',
    phone_lookup_found: input.phone_lookup_found ?? null,
    plz: input.plz ?? null,
    house_number: input.house_number ?? null,
    birthday_customer: input.birthday_customer ?? null,
    vnr_candidate: null,
    vnr_digits_candidate: null,
    vnr_confirmed: null,
    check_birthday_result: null,
    check_birthday_error: null,
    get_customer_by_plz_geb_result: input.get_customer_by_plz_geb_result ?? null,
    get_customer_by_insurance_number_result: null,
    check_insurance_number_format_result: null,
  };
}

function enrichBrainResult(
  result: VerificationMethodBrainResult,
  extras?: {
    awaiting_field?: AddressAwaitingField | null;
    known_values_required_next_call?: Record<string, string>;
    leaping_function_arguments?: Record<string, string>;
  }
): VerificationMethodBrainResult {
  const action_type = computeActionType(result.next_action, result.ok);
  return {
    ...result,
    action_type,
    active_brain: result.method,
    function_name: result.function_to_call,
    transition_name: result.transition_to,
    requires_followup_mcp_call: requiresFollowupMcpCall(result.next_action, action_type),
    awaiting_field: extras?.awaiting_field ?? result.awaiting_field ?? null,
    expected_field: extras?.awaiting_field ?? result.expected_field ?? result.awaiting_field ?? null,
    known_values_required_next_call: extras?.known_values_required_next_call ?? result.known_values_required_next_call,
    leaping_function_arguments: extras?.leaping_function_arguments ?? result.leaping_function_arguments,
  };
}

function mergeBirthday(
  existing: string | undefined,
  latestText: string | undefined,
  pendingDay?: number | null,
  pendingMonth?: number | null
) {
  if (!latestText) {
    return {
      value: existing,
      parse: existing
        ? ({ status: 'complete', iso: existing } as BirthdayParseResult)
        : ({ status: 'missing', iso: null } as BirthdayParseResult),
    };
  }
  const parsed = parseBirthday(latestText);
  if (!existing && parsed.year !== undefined && pendingDay && pendingMonth) {
    const iso = toIsoDate(pendingDay, pendingMonth, parsed.year);
    if (iso) {
      return {
        value: iso,
        parse: { status: 'complete', iso, day: pendingDay, month: pendingMonth, year: parsed.year } as BirthdayParseResult,
      };
    }
  }
  return {
    value: parsed.status === 'complete' ? parsed.iso ?? existing : existing,
    parse: parsed,
  };
}

function makeResult(
  method: 'phone' | 'address' | 'vnr',
  patch: Omit<VerificationMethodBrainResult, 'method' | 'allowed_to_call_function' | 'function_to_call' | 'allowed_to_transition' | 'transition_to'> & {
    function_to_call?: string | null;
    transition_to?: 'weiter' | 'nicht_identifiziert' | null;
    function_arguments?: Record<string, string>;
    leaping_function_arguments?: Record<string, string>;
    awaiting_field?: AddressAwaitingField | null;
    known_values_required_next_call?: Record<string, string>;
  }
): VerificationMethodBrainResult {
  const function_to_call = patch.function_to_call ?? null;
  const transition_to = patch.transition_to ?? null;
  return {
    ok: patch.ok,
    method,
    next_action: patch.next_action,
    allowed_to_call_function: Boolean(function_to_call),
    function_to_call,
    allowed_to_transition: transition_to !== null,
    transition_to,
    say: patch.say,
    reason: patch.reason,
    missing_fields: patch.missing_fields,
    safety_flags: patch.safety_flags,
    session_id: patch.session_id,
    session_mode: patch.session_mode,
    session_id_received: patch.session_id_received,
    state_summary: patch.state_summary,
    attempts: patch.attempts,
    stored_values: patch.stored_values,
    function_arguments: patch.function_arguments,
    leaping_function_arguments: patch.leaping_function_arguments,
    awaiting_field: patch.awaiting_field,
    expected_field: patch.awaiting_field,
    known_values_required_next_call: patch.known_values_required_next_call,
  };
}

interface AddressBrainFinalizeContext {
  sessionId?: string;
  state: VerificationSessionState | null;
  awaiting_field: AddressAwaitingField | null;
  addressInput: VerificationAddressBrainInput;
}

function finalizeAddressBrainResult(
  result: VerificationMethodBrainResult,
  context: AddressBrainFinalizeContext
): VerificationMethodBrainResult {
  if (context.state) {
    context.state.awaiting_field = context.awaiting_field;
  }
  const knownValues = buildKnownValuesRequiredNextCall(context.sessionId, {
    plz: context.addressInput.plz,
    house_number: context.addressInput.house_number,
    birthday_customer: context.addressInput.birthday_customer,
    get_customer_by_plz_geb_result: context.addressInput.get_customer_by_plz_geb_result,
    address_lookup_attempts: context.addressInput.address_lookup_attempts,
    phone_lookup_found: context.addressInput.phone_lookup_found,
  });
  const withSession = attachSessionDebug(
    {
      ...result,
      stored_values: result.stored_values ?? storedValuesFromAddressInput(context.addressInput),
      known_values_required_next_call: knownValues,
      awaiting_field: context.awaiting_field,
    },
    context.sessionId,
    context.state
  );
  return enrichBrainResult(withSession, {
    awaiting_field: context.awaiting_field,
    known_values_required_next_call: knownValues,
    leaping_function_arguments: result.leaping_function_arguments,
  });
}

function attachSessionDebug(
  result: VerificationMethodBrainResult,
  sessionId: string | undefined,
  state: VerificationSessionState | null
): VerificationMethodBrainResult {
  if (!sessionId || !state) {
    return attachStatelessDebug(result, result.method, result.stored_values ?? undefined);
  }
  saveSessionState(sessionId, state);
  return {
    ...result,
    session_id: sessionId,
    session_mode: 'session',
    session_id_received: true,
    state_summary: stateSummary(state),
    attempts: structuredClone(state.attempts),
    stored_values: {
      active_verification_path: state.active_verification_path,
      phone_lookup_found: state.phone_lookup_found,
      plz: state.plz,
      house_number: state.house_number,
      birthday_customer: state.birthday_customer,
      vnr_candidate: state.vnr_candidate,
      vnr_digits_candidate: state.vnr_digits_candidate,
      vnr_confirmed: state.vnr_confirmed,
      check_birthday_result: state.check_birthday_result,
      check_birthday_error: state.check_birthday_error,
      get_customer_by_plz_geb_result: state.get_customer_by_plz_geb_result,
      get_customer_by_insurance_number_result: state.get_customer_by_insurance_number_result,
      check_insurance_number_format_result: state.check_insurance_number_format_result,
    },
    awaiting_field: state.awaiting_field ?? result.awaiting_field ?? null,
    expected_field: state.awaiting_field ?? result.expected_field ?? null,
  };
}

function attachStatelessDebug(
  result: VerificationMethodBrainResult,
  method: 'phone' | 'address' | 'vnr',
  currentStoredValues?: VerificationSessionStoredValues
): VerificationMethodBrainResult {
  const safetyFlags = result.safety_flags.includes('missing_session_id')
    ? result.safety_flags
    : [...result.safety_flags, 'missing_session_id'];
  return {
    ...result,
    method,
    session_mode: 'stateless',
    session_id_received: false,
    state_summary: 'No session_id received, values will not persist across turns.',
    attempts: result.attempts ?? emptyAttempts(),
    stored_values:
      currentStoredValues ??
      result.stored_values ?? {
        active_verification_path: method,
        phone_lookup_found: null,
        plz: null,
        house_number: null,
        birthday_customer: null,
        vnr_candidate: null,
        vnr_digits_candidate: null,
        vnr_confirmed: null,
        check_birthday_result: null,
        check_birthday_error: null,
        get_customer_by_plz_geb_result: null,
        get_customer_by_insurance_number_result: null,
        check_insurance_number_format_result: null,
      },
    safety_flags: safetyFlags,
    reason: result.reason.includes('No session_id received')
      ? result.reason
      : `${result.reason} No session_id received, values will not persist across turns.`,
  };
}

function finalizeGenericBrainResult(
  result: VerificationMethodBrainResult,
  sessionId: string | undefined,
  state: VerificationSessionState | null
): VerificationMethodBrainResult {
  return enrichBrainResult(attachSessionDebug(result, sessionId, state));
}

function maybeTransferHuman(method: 'phone' | 'address' | 'vnr', requested?: boolean, officeHours?: boolean) {
  if (!requested || officeHours !== true) return null;
  return makeResult(method, {
    ok: true,
    next_action: 'TRANSFER_HUMAN',
    say: 'Ich verbinde Sie jetzt mit einer zuständigen Person weiter.',
    reason: 'Customer requested a human during office hours.',
    missing_fields: [],
    safety_flags: ['customer_requested_human'],
  });
}

export function coerceVerificationPhoneBrainInput(input: Record<string, unknown>): VerificationPhoneBrainInput {
  return {
    session_id: asString(input.session_id),
    phone_lookup_found: coercePhoneLookupFound(input.phone_lookup_found),
    latest_customer_input: asString(input.latest_customer_input),
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result: normalizeCheckBirthdayResult(input.check_birthday_result),
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available: asBoolean(input.birthday_system_available),
    birthday_request_count: asNumber(input.birthday_request_count),
    birthday_check_attempts: asNumber(input.birthday_check_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function coerceVerificationAddressBrainInput(input: Record<string, unknown>): VerificationAddressBrainInput {
  return {
    session_id: asString(input.session_id),
    phone_lookup_found: coercePhoneLookupFound(input.phone_lookup_found),
    latest_customer_input: asString(input.latest_customer_input),
    plz: asString(input.plz),
    house_number: asString(input.house_number),
    birthday_customer: asString(input.birthday_customer),
    get_customer_by_plz_geb_result: normalizeLookupResult(input.get_customer_by_plz_geb_result),
    address_lookup_attempts: asNumber(input.address_lookup_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function coerceVerificationVnrBrainInput(input: Record<string, unknown>): VerificationVnrBrainInput {
  return {
    session_id: asString(input.session_id),
    latest_customer_input: asString(input.latest_customer_input),
    vnr_raw: normalizeVnr(asString(input.vnr_raw)),
    vnr_candidate: normalizeVnr(asString(input.vnr_candidate)),
    vnr_confirmed: asBoolean(input.vnr_confirmed),
    check_insurance_number_format_result: normalizeFormatResult(input.check_insurance_number_format_result),
    get_customer_by_insurance_number_result: normalizeLeapingLookupInput(
      input.get_customer_by_insurance_number_result
    ),
    id: asString(input.id) ?? asString(input.customer_id),
    customer_id: asString(input.customer_id),
    birthday_system:
      typeof input.birthday_system === 'boolean'
        ? input.birthday_system
        : asString(input.birthday_system),
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result: normalizeCheckBirthdayResult(input.check_birthday_result),
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available:
      asBoolean(input.birthday_system_available) ??
      (hasBirthdaySystemSignal(input) ? true : undefined),
    vnr_request_count: asNumber(input.vnr_request_count),
    vnr_lookup_attempts: asNumber(input.vnr_lookup_attempts),
    birthday_request_count: asNumber(input.birthday_request_count),
    birthday_check_attempts: asNumber(input.birthday_check_attempts),
    customer_requested_human: asBoolean(input.customer_requested_human),
    office_hours: asBoolean(input.office_hours),
  };
}

export function runVerificationPhoneBrain(rawInput: VerificationPhoneBrainInput): VerificationMethodBrainResult {
  const session = getSessionState(rawInput.session_id);
  if (session) {
    session.active_verification_path = 'phone';
    if (rawInput.phone_lookup_found !== undefined) session.phone_lookup_found = rawInput.phone_lookup_found;
  }

  const phoneSafetyFlags: string[] = [];
  const latestText = getSpeechInput(rawInput.latest_customer_input, phoneSafetyFlags);

  const birthdayMerge = mergeBirthday(
    rawInput.birthday_customer ?? session?.birthday_customer ?? undefined,
    latestText,
    session?.pending_birthday_day,
    session?.pending_birthday_month
  );
  const input: VerificationPhoneBrainInput = {
    ...rawInput,
    phone_lookup_found: rawInput.phone_lookup_found ?? session?.phone_lookup_found ?? undefined,
    birthday_customer: birthdayMerge.value,
    check_birthday_result: mergeNormalizedCheckBirthdayResult(
      rawInput.check_birthday_result,
      session?.check_birthday_result
    ),
    check_birthday_error: rawInput.check_birthday_error ?? session?.check_birthday_error ?? undefined,
    birthday_system_available: rawInput.birthday_system_available ?? undefined,
    birthday_request_count: rawInput.birthday_request_count ?? session?.attempts.birthday_collection_attempts ?? 0,
    birthday_check_attempts: rawInput.birthday_check_attempts ?? session?.attempts.birthday_check_attempts ?? 0,
  };
  const checkBirthdayArgs = input.birthday_customer ? buildCheckBirthdayFunctionArgs(input.birthday_customer) : null;
  const finalizePhone = (result: VerificationMethodBrainResult) =>
    finalizeGenericBrainResult(
      { ...result, safety_flags: [...phoneSafetyFlags, ...result.safety_flags] },
      rawInput.session_id,
      session
    );

  if (session) {
    session.phone_lookup_found = input.phone_lookup_found ?? session.phone_lookup_found;
    if (birthdayMerge.value) session.birthday_customer = birthdayMerge.value;
    if (birthdayMerge.parse.status === 'complete') {
      session.pending_birthday_day = null;
      session.pending_birthday_month = null;
    } else if (birthdayMerge.parse.status === 'incomplete_year') {
      session.pending_birthday_day = birthdayMerge.parse.day ?? null;
      session.pending_birthday_month = birthdayMerge.parse.month ?? null;
    }
    if (rawInput.check_birthday_result !== undefined) {
      session.check_birthday_result = input.check_birthday_result ?? 'not_called';
      if (input.check_birthday_result !== 'not_called') {
        session.attempts.birthday_check_attempts += 1;
      }
    }
    if (rawInput.check_birthday_error) session.check_birthday_error = rawInput.check_birthday_error;
    if (rawInput.latest_customer_input && !birthdayMerge.value) {
      session.attempts.birthday_collection_attempts += 1;
    }
  }

  if (
    rawInput.latest_customer_input &&
    input.birthday_customer &&
    input.check_birthday_result === 'failed' &&
    (input.birthday_check_attempts ?? 0) < 2
  ) {
    input.check_birthday_result = 'not_called';
    if (session) session.check_birthday_result = 'not_called';
  }

  const transfer = maybeTransferHuman('phone', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return finalizePhone(transfer);
  }

  if (input.phone_lookup_found !== true) {
    return finalizePhone(makeResult('phone', {
      ok: false,
      next_action: 'WRONG_METHOD',
      say: '',
      reason: 'Phone verification brain can only be used after get_customer_by_phone found a customer.',
      missing_fields: [],
      safety_flags: ['wrong_method_phone_lookup_not_found'],
    }));
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return finalizePhone(makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }));
  }

  if (birthdayMerge.parse.status === 'incomplete_year') {
    const result = makeResult('phone', {
      ok: true,
      next_action: 'ASK_BIRTH_YEAR',
      say: 'Bitte nennen Sie mir noch das Geburtsjahr vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was only partially provided.',
      missing_fields: ['birth_year'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return finalizePhone(result);
  }

  if (birthdayMerge.parse.status === 'impossible') {
    return finalizePhone(makeResult('phone', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say: 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_invalid'],
    }));
  }

  if (!input.birthday_customer) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return finalizePhone(makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    const result = makeResult('phone', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say:
        (input.birthday_request_count ?? 0) >= 1
          ? 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal vollständig zur Verifizierung.'
          : 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Customer was found by phone but birthday has not been provided yet.',
      missing_fields: ['birthday_customer'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return finalizePhone(result);
  }

  if (input.check_birthday_result === 'success') {
    return finalizePhone(makeResult('phone', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after phone lookup.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    }));
  }

  if (input.check_birthday_result === 'failed') {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      return finalizePhone(makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    const result = makeResult('phone', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal zur Verifizierung.',
      reason: 'Birthday check failed once and one retry is still allowed.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_retry'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return finalizePhone(result);
  }

  if (input.birthday_system_available === false) {
    return finalizePhone(makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }));
  }
  const result = makeResult('phone', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Birthday is available and it is safe to call check_birthday.',
    missing_fields: [],
    safety_flags: [],
    function_to_call: 'check_birthday',
    function_arguments: checkBirthdayArgs?.function_arguments,
    leaping_function_arguments: checkBirthdayArgs?.leaping_function_arguments,
  });
  saveSessionState(rawInput.session_id, session ?? emptySessionState());
  return finalizePhone(result);
}

export function runVerificationAddressBrain(rawInput: VerificationAddressBrainInput): VerificationMethodBrainResult {
  const session = getSessionState(rawInput.session_id);
  if (session) {
    session.active_verification_path = 'address';
    if (rawInput.phone_lookup_found !== undefined) session.phone_lookup_found = rawInput.phone_lookup_found;
  }

  const addressSafetyFlags: string[] = [];
  const latestText = getSpeechInput(rawInput.latest_customer_input, addressSafetyFlags);

  if (isNeukundeLike(rawInput.latest_customer_input)) {
    return finalizeAddressBrainResult(
      makeResult('address', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Für Neukunden gelten andere Abläufe. Ich kann Sie in diesem Verifizierungsschritt leider nicht identifizieren.',
        reason: 'Customer stated they are a new customer, so address verification cannot continue.',
        missing_fields: [],
        safety_flags: [...addressSafetyFlags, 'customer_is_neukunde'],
        transition_to: 'nicht_identifiziert',
        awaiting_field: null,
      }),
      {
        sessionId: rawInput.session_id,
        state: session,
        awaiting_field: null,
        addressInput: rawInput,
      }
    );
  }

  const basePlz = rawInput.plz ?? session?.plz ?? undefined;
  const baseHouseNumber = rawInput.house_number ?? session?.house_number ?? undefined;
  const baseBirthday = rawInput.birthday_customer ?? session?.birthday_customer ?? undefined;
  const mergedLookupResult = mergeNormalizedLookupResult(
    rawInput.get_customer_by_plz_geb_result,
    session?.get_customer_by_plz_geb_result
  );
  const baseLookupAttempts = rawInput.address_lookup_attempts ?? session?.attempts.address_lookup_attempts ?? 0;

  const awaitingField = resolveAddressAwaitingField({
    plz: basePlz,
    house_number: baseHouseNumber,
    birthday_customer: baseBirthday,
    get_customer_by_plz_geb_result: mergedLookupResult,
    address_lookup_attempts: baseLookupAttempts,
    sessionAwaiting: session?.awaiting_field,
  });

  const parsedFromLatest = parseAddressFieldFromUtterance(
    awaitingField,
    latestText,
    baseBirthday,
    session?.pending_birthday_day,
    session?.pending_birthday_month
  );

  const correctedOnConfirm =
    awaitingField === 'confirm_address' &&
    Boolean(rawInput.latest_customer_input) &&
    !isYesLike(latestText) &&
    Boolean(parsedFromLatest.plz || parsedFromLatest.house_number || parsedFromLatest.birthdayMerge?.value);

  const baseLookupResult = correctedOnConfirm ? 'not_called' : mergedLookupResult;

  const birthdayMerge =
    parsedFromLatest.birthdayMerge ??
    mergeBirthday(baseBirthday, undefined, session?.pending_birthday_day, session?.pending_birthday_month);

  const input: VerificationAddressBrainInput = {
    ...rawInput,
    phone_lookup_found: rawInput.phone_lookup_found ?? session?.phone_lookup_found ?? undefined,
    plz: parsedFromLatest.plz ?? basePlz,
    house_number: parsedFromLatest.house_number ?? baseHouseNumber,
    birthday_customer: birthdayMerge.value,
    get_customer_by_plz_geb_result: baseLookupResult,
    address_lookup_attempts: baseLookupAttempts,
  };

  const plzGebArgs =
    input.plz && input.house_number && input.birthday_customer
      ? buildPlzGebFunctionArgs(input.plz, input.house_number, input.birthday_customer)
      : null;

  const finalize = (
    result: VerificationMethodBrainResult,
    nextAwaiting: AddressAwaitingField | null
  ): VerificationMethodBrainResult =>
    finalizeAddressBrainResult(
      { ...result, safety_flags: [...addressSafetyFlags, ...result.safety_flags] },
      {
        sessionId: rawInput.session_id,
        state: session,
        awaiting_field: nextAwaiting,
        addressInput: input,
      }
    );

  if (session) {
    session.phone_lookup_found = input.phone_lookup_found ?? session.phone_lookup_found;
    if (input.plz) session.plz = input.plz;
    else if (rawInput.latest_customer_input && awaitingField === 'plz') session.attempts.plz_attempts += 1;
    if (input.house_number) session.house_number = input.house_number;
    else if (rawInput.latest_customer_input && awaitingField === 'house_number') {
      session.attempts.house_number_attempts += 1;
    }
    if (input.birthday_customer) session.birthday_customer = input.birthday_customer;
    if (birthdayMerge.parse.status === 'complete') {
      session.pending_birthday_day = null;
      session.pending_birthday_month = null;
    } else if (birthdayMerge.parse.status === 'incomplete_year') {
      session.pending_birthday_day = birthdayMerge.parse.day ?? null;
      session.pending_birthday_month = birthdayMerge.parse.month ?? null;
    } else if (rawInput.latest_customer_input && awaitingField === 'birthday_customer' && !birthdayMerge.value) {
      session.attempts.birthday_collection_attempts += 1;
    }
    if (rawInput.get_customer_by_plz_geb_result !== undefined) {
      session.get_customer_by_plz_geb_result = storeLookupResult(rawInput.get_customer_by_plz_geb_result);
      if (input.get_customer_by_plz_geb_result !== 'not_called') {
        session.attempts.address_lookup_attempts += 1;
      }
    } else if (correctedOnConfirm) {
      session.get_customer_by_plz_geb_result = 'not_called';
    }
  }

  const transfer = maybeTransferHuman('address', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return finalize(transfer, awaitingField);
  }

  if (!input.plz) {
    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'ASK_PLZ',
        say:
          (input.address_lookup_attempts ?? 0) >= 1
            ? 'Ich habe bisher noch keine vollständige Postleitzahl. Bitte nennen oder bestätigen Sie die Postleitzahl.'
            : 'Bitte nennen Sie mir Ihre Postleitzahl.',
        reason: 'PLZ is required before the address lookup can run.',
        missing_fields: ['plz'],
        safety_flags: [],
        awaiting_field: 'plz',
      }),
      'plz'
    );
  }

  if (!input.house_number) {
    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'ASK_HOUSE_NUMBER',
        say:
          (input.address_lookup_attempts ?? 0) >= 1
            ? `Ich habe bisher Postleitzahl ${input.plz} verstanden. Bitte nennen oder bestätigen Sie jetzt noch die Hausnummer.`
            : 'Bitte nennen Sie mir Ihre Hausnummer.',
        reason: 'House number is required before the address lookup can run.',
        missing_fields: ['house_number'],
        safety_flags: [],
        awaiting_field: 'house_number',
      }),
      'house_number'
    );
  }

  if (birthdayMerge.parse.status === 'incomplete_year') {
    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'ASK_BIRTH_YEAR',
        say: 'Bitte nennen Sie mir noch das Geburtsjahr vollständig.',
        reason: birthdayMerge.parse.reason ?? 'Birthday was only partially provided.',
        missing_fields: ['birth_year'],
        safety_flags: ['never_call_check_birthday_in_address_path'],
        awaiting_field: 'birthday_customer',
      }),
      'birthday_customer'
    );
  }

  if (birthdayMerge.parse.status === 'impossible') {
    return finalize(
      makeResult('address', {
        ok: false,
        next_action: 'ASK_BIRTHDAY',
        say: 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.',
        reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_invalid', 'never_call_check_birthday_in_address_path'],
        awaiting_field: 'birthday_customer',
      }),
      'birthday_customer'
    );
  }

  if (!input.birthday_customer) {
    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'ASK_BIRTHDAY',
        say:
          (input.address_lookup_attempts ?? 0) >= 1
            ? `Ich habe bisher Postleitzahl ${input.plz} und Hausnummer ${input.house_number} verstanden. Bitte nennen oder bestätigen Sie jetzt noch Ihr Geburtsdatum.`
            : 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
        reason: 'Birthday is required together with PLZ and house number for the address lookup.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['never_call_check_birthday_in_address_path'],
        awaiting_field: 'birthday_customer',
      }),
      'birthday_customer'
    );
  }

  if (input.get_customer_by_plz_geb_result === 'found' || isLookupFound(input.get_customer_by_plz_geb_result)) {
    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'TRANSITION_WEITER',
        say: 'Danke, die Verifizierung ist abgeschlossen.',
        reason: 'Address lookup found the customer using PLZ, house number, and birthday.',
        missing_fields: [],
        safety_flags: ['never_call_check_birthday_in_address_path'],
        transition_to: 'weiter',
        awaiting_field: null,
      }),
      null
    );
  }

  if (input.get_customer_by_plz_geb_result === 'not_found' || isLookupNotFound(input.get_customer_by_plz_geb_result)) {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return finalize(
        makeResult('address', {
          ok: false,
          next_action: 'FALLBACK_TO_VNR',
          say: 'Ich konnte Sie über diese Angaben nicht eindeutig finden. Bitte nennen Sie mir stattdessen Ihre Versicherungsnummer.',
          reason: 'Address lookup failed twice, so the next safe fallback is VNR verification.',
          missing_fields: [],
          safety_flags: ['fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
          awaiting_field: null,
        }),
        null
      );
    }

    if (isYesLike(latestText)) {
      return finalize(
        makeResult('address', {
          ok: true,
          next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
          say: '',
          reason: 'Customer confirmed the previously understood address values, so a retry lookup is allowed.',
          missing_fields: [],
          safety_flags: ['address_retry', 'never_call_check_birthday_in_address_path'],
          function_to_call: 'get_customer_by_plz_geb',
          function_arguments: plzGebArgs?.function_arguments,
          leaping_function_arguments: plzGebArgs?.leaping_function_arguments,
          awaiting_field: 'confirm_address',
        }),
        'confirm_address'
      );
    }

    return finalize(
      makeResult('address', {
        ok: true,
        next_action: 'CONFIRM_ADDRESS_VALUES',
        say: `Ich habe bisher Postleitzahl ${input.plz}, Hausnummer ${input.house_number} und Ihr Geburtsdatum verstanden. Bitte bestätigen oder korrigieren Sie diese Angaben kurz.`,
        reason: 'Address lookup failed once and the next safe step is targeted confirmation of the stored values.',
        missing_fields: [],
        safety_flags: ['address_retry', 'never_call_check_birthday_in_address_path'],
        awaiting_field: 'confirm_address',
      }),
      'confirm_address'
    );
  }

  if (input.get_customer_by_plz_geb_result === 'error') {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return finalize(
        makeResult('address', {
          ok: false,
          next_action: 'FALLBACK_TO_VNR',
          say: 'Ich wechsle zur Verifizierung über Ihre Versicherungsnummer.',
          reason: 'Address lookup produced repeated errors, so the safe fallback is VNR verification.',
          missing_fields: [],
          safety_flags: ['address_lookup_error', 'fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
          awaiting_field: null,
        }),
        null
      );
    }

    return finalize(
      makeResult('address', {
        ok: false,
        next_action: 'TECHNICAL_ESCALATION',
        say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
        reason: 'Address lookup returned an error before a safe retry decision could be made.',
        missing_fields: [],
        safety_flags: ['address_lookup_error', 'never_call_check_birthday_in_address_path'],
        awaiting_field: 'confirm_address',
      }),
      'confirm_address'
    );
  }

  return finalize(
    makeResult('address', {
      ok: true,
      next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
      say: '',
      reason: 'PLZ, house number, and birthday are complete.',
      missing_fields: [],
      safety_flags: ['never_call_check_birthday_in_address_path'],
      function_to_call: 'get_customer_by_plz_geb',
      function_arguments: plzGebArgs?.function_arguments,
      leaping_function_arguments: plzGebArgs?.leaping_function_arguments,
      awaiting_field: null,
    }),
    null
  );
}

export function runVerificationVnrBrain(rawInput: VerificationVnrBrainInput): VerificationMethodBrainResult {
  const session = getSessionState(rawInput.session_id);
  if (session) {
    session.active_verification_path = 'vnr';
  }

  const inferredLookup = inferVnrInsuranceLookupResult(rawInput as Record<string, unknown>, {
    vnr_confirmed: rawInput.vnr_confirmed ?? session?.vnr_confirmed ?? undefined,
    vnr_awaiting_insurance_lookup_result: session?.vnr_awaiting_insurance_lookup_result,
    existing_lookup_result: session?.get_customer_by_insurance_number_result,
  });
  const leapingInput = rawInput as Record<string, unknown>;
  const normalizedLookupInput = normalizeLeapingLookupInput(rawInput.get_customer_by_insurance_number_result);
  const normalizedRawInput: VerificationVnrBrainInput = {
    ...rawInput,
    get_customer_by_insurance_number_result: normalizedLookupInput ?? inferredLookup,
    birthday_system_available:
      rawInput.birthday_system_available ??
      (hasBirthdaySystemSignal(leapingInput) ? true : undefined),
  };
  if (
    !rawInput.latest_customer_input &&
    leapingVnrLookupFieldsPresent(leapingInput) &&
    normalizedRawInput.birthday_customer &&
    hasBirthdaySystemSignal(leapingInput)
  ) {
    normalizedRawInput.birthday_customer = undefined;
  }

  const extraSafetyFlags: string[] = [];
  const latestText = getSpeechInput(normalizedRawInput.latest_customer_input, extraSafetyFlags);

  if (isNeukundeLike(normalizedRawInput.latest_customer_input)) {
    return finalizeGenericBrainResult(
      makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Für Neukunden gelten andere Abläufe. Ich kann Sie in diesem Verifizierungsschritt leider nicht identifizieren.',
        reason: 'Customer stated they are a new customer, so VNR verification cannot continue.',
        missing_fields: [],
        safety_flags: [...extraSafetyFlags, 'customer_is_neukunde'],
        transition_to: 'nicht_identifiziert',
      }),
      normalizedRawInput.session_id,
      session
    );
  }

  const mergedLookupResult = mergeNormalizedLookupResult(
    normalizedRawInput.get_customer_by_insurance_number_result,
    session?.get_customer_by_insurance_number_result
  );
  const lookupFound = isLookupFound(mergedLookupResult);
  const lookupCallbackTurn = lookupResultReceivedThisTurn(normalizedRawInput);
  const storedVnrCandidate = session?.vnr_candidate ?? undefined;
  const hasValidConfirmedVnr =
    (normalizedRawInput.vnr_confirmed === true || session?.vnr_confirmed === true) &&
    Boolean(storedVnrCandidate && /^[A-Z][0-9]{9}$/.test(storedVnrCandidate));
  const awaitingLetterOnly =
    Boolean(session?.vnr_digits_candidate && /^\d{9}$/.test(session.vnr_digits_candidate)) &&
    !hasValidConfirmedVnr;
  const shouldParseVnrFromSpeech =
    !lookupFound &&
    Boolean(latestText) &&
    (awaitingLetterOnly ||
      !hasValidConfirmedVnr ||
      !/^[A-Z][0-9]{9}$/.test(normalizeVnr(normalizedRawInput.vnr_candidate ?? storedVnrCandidate) ?? ''));
  const parsedVnr = shouldParseVnrFromSpeech
    ? parseVnrUtterance(latestText, session?.vnr_digits_candidate ?? null)
    : {
        candidate: null,
        digits_only: null,
        leading_letter: null,
        awaiting_letter: false,
        valid_shape: false,
      };
  const explicitCandidate = normalizeVnr(normalizedRawInput.vnr_candidate ?? normalizedRawInput.vnr_raw);
  const resolvedCandidate = normalizeVnr(
    explicitCandidate ??
      (shouldParseVnrFromSpeech ? parsedVnr.candidate : null) ??
      storedVnrCandidate ??
      undefined
  );
  const birthdayMerge = mergeBirthday(
    normalizedRawInput.birthday_customer ?? session?.birthday_customer ?? undefined,
    latestText,
    session?.pending_birthday_day,
    session?.pending_birthday_month
  );
  const input: VerificationVnrBrainInput = {
    ...normalizedRawInput,
    vnr_raw: normalizeVnr(normalizedRawInput.vnr_raw ?? resolvedCandidate),
    vnr_candidate: resolvedCandidate,
    vnr_confirmed:
      normalizedRawInput.vnr_confirmed === true ||
      (resolvedCandidate !== undefined && isYesLike(latestText))
        ? true
        : normalizedRawInput.vnr_confirmed ?? session?.vnr_confirmed ?? undefined,
    birthday_customer: birthdayMerge.value,
    check_insurance_number_format_result: mergeNormalizedFormatResult(
      normalizedRawInput.check_insurance_number_format_result,
      session?.check_insurance_number_format_result
    ),
    get_customer_by_insurance_number_result: mergeNormalizedLookupResult(
      normalizedRawInput.get_customer_by_insurance_number_result,
      session?.get_customer_by_insurance_number_result
    ),
    check_birthday_result: mergeNormalizedCheckBirthdayResult(
      normalizedRawInput.check_birthday_result,
      session?.check_birthday_result
    ),
    check_birthday_error: normalizedRawInput.check_birthday_error ?? session?.check_birthday_error ?? undefined,
    birthday_system_available: normalizedRawInput.birthday_system_available,
    vnr_request_count: normalizedRawInput.vnr_request_count ?? session?.attempts.vnr_request_attempts ?? 0,
    vnr_lookup_attempts: normalizedRawInput.vnr_lookup_attempts ?? session?.attempts.vnr_lookup_attempts ?? 0,
    birthday_request_count: normalizedRawInput.birthday_request_count ?? session?.attempts.birthday_collection_attempts ?? 0,
    birthday_check_attempts: normalizedRawInput.birthday_check_attempts ?? session?.attempts.birthday_check_attempts ?? 0,
  };
  if (session?.birthday_customer && !isLookupFound(session.get_customer_by_insurance_number_result)) {
    session.birthday_collected_before_vnr_lookup = true;
  }
  const vnrAuthBirthday = getVnrAuthBirthdayCustomer(session, normalizedRawInput, birthdayMerge, lookupFound);
  const checkBirthdayResultThisTurn = normalizedRawInput.check_birthday_result !== undefined;
  let effectiveCheckBirthdayResult = input.check_birthday_result;
  if (lookupCallbackTurn && lookupFound) {
    effectiveCheckBirthdayResult = 'not_called';
  } else if (
    shouldIgnorePrematureVnrCheckBirthdaySuccess(session, {
      lookupCallbackTurn,
      lookupFound,
      checkBirthdayResultThisTurn,
      effectiveResult: effectiveCheckBirthdayResult ?? 'not_called',
    })
  ) {
    effectiveCheckBirthdayResult = 'not_called';
  }
  input.check_birthday_result = effectiveCheckBirthdayResult;
  const insuranceNumberArgs = input.vnr_candidate ? buildInsuranceNumberFunctionArgs(input.vnr_candidate) : null;
  const checkBirthdayArgs = vnrAuthBirthday ? buildCheckBirthdayFunctionArgs(vnrAuthBirthday) : null;
  const finalize = (result: VerificationMethodBrainResult) =>
    finalizeGenericBrainResult(
      { ...result, safety_flags: [...extraSafetyFlags, ...result.safety_flags] },
      normalizedRawInput.session_id,
      session
    );

  if (session) {
    if (shouldParseVnrFromSpeech && parsedVnr.awaiting_letter && parsedVnr.digits_only) {
      session.vnr_digits_candidate = parsedVnr.digits_only;
      session.vnr_candidate = parsedVnr.digits_only;
      session.vnr_confirmed = false;
    } else if (input.vnr_candidate && /^[A-Z][0-9]{9}$/.test(input.vnr_candidate)) {
      session.vnr_candidate = input.vnr_candidate;
      session.vnr_digits_candidate = null;
    } else if (input.vnr_candidate) {
      session.vnr_candidate = input.vnr_candidate;
    }
    if (input.vnr_confirmed !== undefined) session.vnr_confirmed = input.vnr_confirmed;
    const lookupAlreadyFound = isLookupFound(session.get_customer_by_insurance_number_result);
    if (birthdayMerge.value) {
      if (!lookupAlreadyFound && !lookupCallbackTurn) {
        session.birthday_collected_before_vnr_lookup = true;
        session.birthday_customer = birthdayMerge.value;
      } else if (normalizedRawInput.latest_customer_input && lookupFound) {
        session.vnr_customer_birthday_collected = true;
        session.birthday_customer = birthdayMerge.value;
      } else if (!lookupCallbackTurn) {
        session.birthday_customer = birthdayMerge.value;
      }
    }
    if (birthdayMerge.parse.status === 'complete') {
      session.pending_birthday_day = null;
      session.pending_birthday_month = null;
    } else if (birthdayMerge.parse.status === 'incomplete_year') {
      session.pending_birthday_day = birthdayMerge.parse.day ?? null;
      session.pending_birthday_month = birthdayMerge.parse.month ?? null;
    }
    if (normalizedRawInput.check_insurance_number_format_result !== undefined) {
      session.check_insurance_number_format_result = input.check_insurance_number_format_result ?? 'not_called';
    }
    if (normalizedRawInput.get_customer_by_insurance_number_result !== undefined) {
      session.get_customer_by_insurance_number_result = storeLookupResult(
        normalizedRawInput.get_customer_by_insurance_number_result
      );
      session.vnr_awaiting_insurance_lookup_result = false;
      if (input.get_customer_by_insurance_number_result !== 'not_called') {
        session.attempts.vnr_lookup_attempts += 1;
      }
    }
    if (normalizedRawInput.check_birthday_result !== undefined) {
      session.check_birthday_result = effectiveCheckBirthdayResult ?? 'not_called';
      if (effectiveCheckBirthdayResult !== 'not_called') {
        session.attempts.birthday_check_attempts += 1;
        if (effectiveCheckBirthdayResult === 'success' || effectiveCheckBirthdayResult === 'failed') {
          session.vnr_awaiting_check_birthday_result = false;
          if (effectiveCheckBirthdayResult === 'success') {
            session.vnr_birthday_auth_succeeded = true;
          }
        }
      }
    }
    if (normalizedRawInput.check_birthday_error) session.check_birthday_error = normalizedRawInput.check_birthday_error;
    if (normalizedRawInput.latest_customer_input && !input.vnr_candidate && !parsedVnr.awaiting_letter) {
      session.attempts.vnr_request_attempts += 1;
    }
    if (normalizedRawInput.latest_customer_input && isLookupFound(input.get_customer_by_insurance_number_result) && !vnrAuthBirthday) {
      session.attempts.birthday_collection_attempts += 1;
    }
  }

  if (
    normalizedRawInput.latest_customer_input &&
    vnrAuthBirthday &&
    effectiveCheckBirthdayResult === 'failed' &&
    (input.birthday_check_attempts ?? 0) < 2
  ) {
    input.check_birthday_result = 'not_called';
    effectiveCheckBirthdayResult = 'not_called';
    if (session) session.check_birthday_result = 'not_called';
  }

  const transfer = maybeTransferHuman('vnr', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(normalizedRawInput.session_id, session ?? emptySessionState());
    return finalize(transfer);
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }));
  }

  if (isVnrInsuranceLookupResolved(input, session, normalizedRawInput.get_customer_by_insurance_number_result)) {
    const postLookupInput = restoreVnrFromSessionForPostLookup(input, session);
    const postLookupAuthBirthday = getVnrAuthBirthdayCustomer(
      session,
      normalizedRawInput,
      birthdayMerge,
      true
    );
    const postLookupCheckBirthdayArgs = postLookupAuthBirthday
      ? buildCheckBirthdayFunctionArgs(postLookupAuthBirthday)
      : null;
    return runVnrInsuranceLookupFoundStep({
      input: postLookupInput,
      session,
      effectiveCheckBirthdayResult: effectiveCheckBirthdayResult ?? 'not_called',
      vnrAuthBirthday: postLookupAuthBirthday,
      birthdayMerge,
      latestCustomerInput: normalizedRawInput.latest_customer_input,
      checkBirthdayArgs: postLookupCheckBirthdayArgs,
      finalize,
    });
  }

  if (!input.vnr_candidate) {
    if ((input.vnr_request_count ?? 0) >= 2) {
      return finalize(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'VNR was not provided after the allowed number of requests.',
        missing_fields: ['vnr'],
        safety_flags: ['vnr_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versicherungsnummer.',
      reason: 'VNR is required to continue the VNR verification path.',
      missing_fields: ['vnr'],
      safety_flags: [],
    });
    return finalize(result);
  }

  if (!/^[A-Z][0-9]{9}$/.test(input.vnr_candidate)) {
    const awaitingLetter =
      parsedVnr.awaiting_letter ||
      /^\d{9}$/.test(input.vnr_candidate) ||
      Boolean(session?.vnr_digits_candidate && /^\d{9}$/.test(session.vnr_digits_candidate));
    const nextAction = awaitingLetter ? 'ASK_VNR_LETTER' : 'ASK_VNR';
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: nextAction,
      say:
        nextAction === 'ASK_VNR_LETTER'
          ? 'Bitte nennen Sie mir auch den Anfangsbuchstaben Ihrer Versicherungsnummer.'
          : 'Bitte nennen Sie mir Ihre Versicherungsnummer noch einmal vollständig.',
      reason: 'VNR must contain exactly one leading letter and nine digits before confirmation or lookup.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_missing_leading_letter'],
    }));
  }

  if (input.vnr_confirmed !== true) {
    const result = makeResult('vnr', {
      ok: true,
      next_action: 'CONFIRM_VNR',
      say: `Ich habe ${input.vnr_candidate} verstanden. Ist das korrekt?`,
      reason: 'VNR must be confirmed before customer lookup.',
      missing_fields: [],
      safety_flags: [],
    });
    return finalize(result);
  }

  // Internal format validation after confirmation — no native check_insurance_number_format call.
  if (session) {
    session.check_insurance_number_format_result = 'valid';
  }

  if (input.get_customer_by_insurance_number_result === 'not_called') {
    const result = makeResult('vnr', {
      ok: true,
      next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER',
      say: '',
      reason:
        'Confirmed VNR passed internal format validation. Customer lookup is the next safe step before birthday authentication.',
      missing_fields: [],
      safety_flags: ['internal_vnr_format_valid', 'blocked_check_birthday_before_customer_lookup'],
      function_to_call: 'get_customer_by_insurance_number',
      function_arguments: insuranceNumberArgs?.function_arguments,
      leaping_function_arguments: insuranceNumberArgs?.leaping_function_arguments,
    });
    if (session) session.vnr_awaiting_insurance_lookup_result = true;
    return finalize(result);
  }

  if (isLookupNotFound(input.get_customer_by_insurance_number_result)) {
    if ((input.vnr_lookup_attempts ?? 0) >= 2) {
      return finalize(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'Customer lookup by insurance number failed twice.',
        missing_fields: [],
        safety_flags: ['vnr_lookup_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }));
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Ich konnte Sie damit noch nicht finden. Bitte nennen oder bestätigen Sie Ihre Versicherungsnummer noch einmal.',
      reason: 'Customer lookup by insurance number failed once and one retry is still allowed.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_lookup_retry'],
    });
    return finalize(result);
  }

  if (input.get_customer_by_insurance_number_result === 'error') {
    return finalize(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Customer lookup by insurance number returned an error.',
      missing_fields: [],
      safety_flags: ['vnr_lookup_error'],
    }));
  }

  return finalize(makeResult('vnr', {
    ok: false,
    next_action: 'TECHNICAL_ESCALATION',
    say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
    reason: 'VNR verification reached an unexpected state after customer lookup.',
    missing_fields: [],
    safety_flags: ['unexpected_vnr_state'],
  }));
}
