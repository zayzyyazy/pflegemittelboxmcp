import { normalizeVnr as normalizeVnrLoose } from './normalize-vnr.js';

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
  get_customer_by_insurance_number_result?: 'found' | 'not_found' | 'error' | 'not_called';
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
  state_summary?: string;
  attempts?: VerificationSessionAttempts;
  stored_values?: VerificationSessionStoredValues;
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
  vnr_confirmed: boolean | null;
  check_birthday_result: string | null;
  check_birthday_error: string | null;
  get_customer_by_plz_geb_result: string | null;
  get_customer_by_insurance_number_result: string | null;
  check_insurance_number_format_result: string | null;
}

interface VerificationSessionState extends VerificationSessionStoredValues {
  pending_birthday_day: number | null;
  pending_birthday_month: number | null;
  attempts: VerificationSessionAttempts;
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

const HOUSE_NUMBER_SUFFIX_WORDS = new Set(['a', 'b', 'c', 'd', 'alpha', 'beta']);
const YES_WORDS = ['ja', 'jawohl', 'stimmt', 'genau', 'korrekt', 'richtig', 'das stimmt'];
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
    vnr_confirmed: null,
    check_birthday_result: null,
    check_birthday_error: null,
    get_customer_by_plz_geb_result: null,
    get_customer_by_insurance_number_result: null,
    check_insurance_number_format_result: null,
    pending_birthday_day: null,
    pending_birthday_month: null,
    attempts: emptyAttempts(),
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

function saveSessionState(sessionId: string | undefined, state: VerificationSessionState) {
  if (!sessionId) return;
  verificationSessions.set(sessionId, structuredClone(state));
}

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

function inferYear(year: number): number {
  if (year >= 100) return year;
  return 1900 + year;
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const inferredYear = inferYear(year);
  const nowYear = new Date().getUTCFullYear();
  if (inferredYear <= 0 || inferredYear > nowYear) return null;
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
      .map((token) => token.normalized)
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

  const tokens = tokenize(rawText);
  for (let i = 0; i < tokens.length; i += 1) {
    const monthValue = MONTH_WORDS[tokens[i].normalized];
    if (monthValue === undefined || i === 0) continue;
    const dayValue = parseOrdinalToken(tokens[i - 1].normalized);
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
    return tryParseAt(cueIndex + 1, true);
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const value = tryParseAt(i);
    if (value) return value;
  }
  return undefined;
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
    state_summary: patch.state_summary,
    attempts: patch.attempts,
    stored_values: patch.stored_values,
  };
}

function attachSessionDebug(
  result: VerificationMethodBrainResult,
  sessionId: string | undefined,
  state: VerificationSessionState | null
): VerificationMethodBrainResult {
  if (!sessionId || !state) return result;
  saveSessionState(sessionId, state);
  return {
    ...result,
    session_id: sessionId,
    state_summary: stateSummary(state),
    attempts: structuredClone(state.attempts),
    stored_values: {
      active_verification_path: state.active_verification_path,
      phone_lookup_found: state.phone_lookup_found,
      plz: state.plz,
      house_number: state.house_number,
      birthday_customer: state.birthday_customer,
      vnr_candidate: state.vnr_candidate,
      vnr_confirmed: state.vnr_confirmed,
      check_birthday_result: state.check_birthday_result,
      check_birthday_error: state.check_birthday_error,
      get_customer_by_plz_geb_result: state.get_customer_by_plz_geb_result,
      get_customer_by_insurance_number_result: state.get_customer_by_insurance_number_result,
      check_insurance_number_format_result: state.check_insurance_number_format_result,
    },
  };
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
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    latest_customer_input: asString(input.latest_customer_input),
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result:
      input.check_birthday_result === 'success' ||
      input.check_birthday_result === 'failed' ||
      input.check_birthday_result === 'error' ||
      input.check_birthday_result === 'not_called'
        ? input.check_birthday_result
        : undefined,
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
    phone_lookup_found: asBoolean(input.phone_lookup_found),
    latest_customer_input: asString(input.latest_customer_input),
    plz: asString(input.plz),
    house_number: asString(input.house_number),
    birthday_customer: asString(input.birthday_customer),
    get_customer_by_plz_geb_result:
      input.get_customer_by_plz_geb_result === 'found' ||
      input.get_customer_by_plz_geb_result === 'not_found' ||
      input.get_customer_by_plz_geb_result === 'error' ||
      input.get_customer_by_plz_geb_result === 'not_called'
        ? input.get_customer_by_plz_geb_result
        : undefined,
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
    check_insurance_number_format_result:
      input.check_insurance_number_format_result === 'valid' ||
      input.check_insurance_number_format_result === 'invalid' ||
      input.check_insurance_number_format_result === 'error' ||
      input.check_insurance_number_format_result === 'not_called'
        ? input.check_insurance_number_format_result
        : undefined,
    get_customer_by_insurance_number_result:
      input.get_customer_by_insurance_number_result === 'found' ||
      input.get_customer_by_insurance_number_result === 'not_found' ||
      input.get_customer_by_insurance_number_result === 'error' ||
      input.get_customer_by_insurance_number_result === 'not_called'
        ? input.get_customer_by_insurance_number_result
        : undefined,
    birthday_customer: asString(input.birthday_customer),
    check_birthday_result:
      input.check_birthday_result === 'success' ||
      input.check_birthday_result === 'failed' ||
      input.check_birthday_result === 'error' ||
      input.check_birthday_result === 'not_called'
        ? input.check_birthday_result
        : undefined,
    check_birthday_error: asString(input.check_birthday_error),
    birthday_system_available: asBoolean(input.birthday_system_available),
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

  const latestText = rawInput.latest_customer_input;
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
    check_birthday_result:
      rawInput.check_birthday_result ??
      (session?.check_birthday_result as VerificationPhoneBrainInput['check_birthday_result'] | null) ??
      'not_called',
    check_birthday_error: rawInput.check_birthday_error ?? session?.check_birthday_error ?? undefined,
    birthday_system_available: rawInput.birthday_system_available ?? undefined,
    birthday_request_count: rawInput.birthday_request_count ?? session?.attempts.birthday_collection_attempts ?? 0,
    birthday_check_attempts: rawInput.birthday_check_attempts ?? session?.attempts.birthday_check_attempts ?? 0,
  };

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
    if (rawInput.check_birthday_result) session.check_birthday_result = rawInput.check_birthday_result;
    if (rawInput.check_birthday_error) session.check_birthday_error = rawInput.check_birthday_error;
    if (rawInput.latest_customer_input && !birthdayMerge.value) {
      session.attempts.birthday_collection_attempts += 1;
    }
    if (rawInput.check_birthday_result && rawInput.check_birthday_result !== 'not_called') {
      session.attempts.birthday_check_attempts += 1;
    }
  }

  const transfer = maybeTransferHuman('phone', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(transfer, rawInput.session_id, session);
  }

  if (input.phone_lookup_found !== true) {
    return attachSessionDebug(makeResult('phone', {
      ok: false,
      next_action: 'WRONG_METHOD',
      say: '',
      reason: 'Phone verification brain can only be used after get_customer_by_phone found a customer.',
      missing_fields: [],
      safety_flags: ['wrong_method_phone_lookup_not_found'],
    }), rawInput.session_id, session);
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return attachSessionDebug(makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }), rawInput.session_id, session);
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
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (birthdayMerge.parse.status === 'impossible') {
    return attachSessionDebug(makeResult('phone', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say: 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_invalid'],
    }), rawInput.session_id, session);
  }

  if (!input.birthday_customer) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
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
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.check_birthday_result === 'success') {
    return attachSessionDebug(makeResult('phone', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after phone lookup.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    }), rawInput.session_id, session);
  }

  if (input.check_birthday_result === 'failed') {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('phone', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
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
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.birthday_system_available === false) {
    return attachSessionDebug(makeResult('phone', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }), rawInput.session_id, session);
  }
  const result = makeResult('phone', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Birthday is available and it is safe to call check_birthday.',
    missing_fields: [],
    safety_flags: [],
    function_to_call: 'check_birthday',
  });
  saveSessionState(rawInput.session_id, session ?? emptySessionState());
  return attachSessionDebug(result, rawInput.session_id, session);
}

export function runVerificationAddressBrain(rawInput: VerificationAddressBrainInput): VerificationMethodBrainResult {
  const session = getSessionState(rawInput.session_id);
  if (session) {
    session.active_verification_path = 'address';
    if (rawInput.phone_lookup_found !== undefined) session.phone_lookup_found = rawInput.phone_lookup_found;
  }
  const latestText = rawInput.latest_customer_input;
  const birthdayMerge = mergeBirthday(
    rawInput.birthday_customer ?? session?.birthday_customer ?? undefined,
    latestText,
    session?.pending_birthday_day,
    session?.pending_birthday_month
  );
  const input: VerificationAddressBrainInput = {
    ...rawInput,
    phone_lookup_found: rawInput.phone_lookup_found ?? session?.phone_lookup_found ?? undefined,
    plz: rawInput.plz ?? session?.plz ?? parsePlz(latestText),
    house_number: rawInput.house_number ?? session?.house_number ?? parseHouseNumber(latestText),
    birthday_customer: birthdayMerge.value,
    get_customer_by_plz_geb_result:
      rawInput.get_customer_by_plz_geb_result ??
      (session?.get_customer_by_plz_geb_result as VerificationAddressBrainInput['get_customer_by_plz_geb_result'] | null) ??
      'not_called',
    address_lookup_attempts: rawInput.address_lookup_attempts ?? session?.attempts.address_lookup_attempts ?? 0,
  };

  if (session) {
    session.phone_lookup_found = input.phone_lookup_found ?? session.phone_lookup_found;
    if (input.plz) session.plz = input.plz;
    else if (rawInput.latest_customer_input) session.attempts.plz_attempts += 1;
    if (input.house_number) session.house_number = input.house_number;
    else if (rawInput.latest_customer_input && input.plz) session.attempts.house_number_attempts += 1;
    if (birthdayMerge.value) session.birthday_customer = birthdayMerge.value;
    if (birthdayMerge.parse.status === 'complete') {
      session.pending_birthday_day = null;
      session.pending_birthday_month = null;
    } else if (birthdayMerge.parse.status === 'incomplete_year') {
      session.pending_birthday_day = birthdayMerge.parse.day ?? null;
      session.pending_birthday_month = birthdayMerge.parse.month ?? null;
    }
    else if (rawInput.latest_customer_input && input.plz && input.house_number) {
      session.attempts.birthday_collection_attempts += 1;
    }
    if (rawInput.get_customer_by_plz_geb_result) {
      session.get_customer_by_plz_geb_result = rawInput.get_customer_by_plz_geb_result;
      if (rawInput.get_customer_by_plz_geb_result !== 'not_called') {
        session.attempts.address_lookup_attempts += 1;
      }
    }
  }

  const transfer = maybeTransferHuman('address', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(transfer, rawInput.session_id, session);
  }

  if (!input.plz) {
    const result = makeResult('address', {
      ok: true,
      next_action: 'ASK_PLZ',
      say:
        (input.address_lookup_attempts ?? 0) >= 1
          ? 'Ich habe bisher noch keine vollständige Postleitzahl. Bitte nennen oder bestätigen Sie die Postleitzahl.'
          : 'Bitte nennen Sie mir Ihre Postleitzahl.',
      reason: 'PLZ is required before the address lookup can run.',
      missing_fields: ['plz'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (!input.house_number) {
    const result = makeResult('address', {
      ok: true,
      next_action: 'ASK_HOUSE_NUMBER',
      say:
        (input.address_lookup_attempts ?? 0) >= 1
          ? `Ich habe bisher Postleitzahl ${input.plz} verstanden. Bitte nennen oder bestätigen Sie jetzt noch die Hausnummer.`
          : 'Bitte nennen Sie mir Ihre Hausnummer.',
      reason: 'House number is required before the address lookup can run.',
      missing_fields: ['house_number'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (birthdayMerge.parse.status === 'incomplete_year') {
    const result = makeResult('address', {
      ok: true,
      next_action: 'ASK_BIRTH_YEAR',
      say: 'Bitte nennen Sie mir noch das Geburtsjahr vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was only partially provided.',
      missing_fields: ['birth_year'],
      safety_flags: ['never_call_check_birthday_in_address_path'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (birthdayMerge.parse.status === 'impossible') {
    return attachSessionDebug(makeResult('address', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say: 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_invalid', 'never_call_check_birthday_in_address_path'],
    }), rawInput.session_id, session);
  }

  if (!input.birthday_customer) {
    const result = makeResult('address', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say:
        (input.address_lookup_attempts ?? 0) >= 1
          ? `Ich habe bisher Postleitzahl ${input.plz} und Hausnummer ${input.house_number} verstanden. Bitte nennen oder bestätigen Sie jetzt noch Ihr Geburtsdatum.`
          : 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Birthday is required together with PLZ and house number for the address lookup.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['never_call_check_birthday_in_address_path'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.get_customer_by_plz_geb_result === 'found') {
    return attachSessionDebug(makeResult('address', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Address lookup found the customer using PLZ, house number, and birthday.',
      missing_fields: [],
      safety_flags: ['never_call_check_birthday_in_address_path'],
      transition_to: 'weiter',
    }), rawInput.session_id, session);
  }

  if (input.get_customer_by_plz_geb_result === 'not_found') {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return attachSessionDebug(makeResult('address', {
        ok: false,
        next_action: 'FALLBACK_TO_VNR',
        say: 'Ich konnte Sie über diese Angaben nicht eindeutig finden. Bitte nennen Sie mir stattdessen Ihre Versicherungsnummer.',
        reason: 'Address lookup failed twice, so the next safe fallback is VNR verification.',
        missing_fields: [],
        safety_flags: ['fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
      }), rawInput.session_id, session);
    }

    if (isYesLike(latestText)) {
      const result = makeResult('address', {
        ok: true,
        next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
        say: '',
        reason: 'Customer confirmed the previously understood address values, so a retry lookup is allowed.',
        missing_fields: [],
        safety_flags: ['address_retry', 'never_call_check_birthday_in_address_path'],
        function_to_call: 'get_customer_by_plz_geb',
      });
      saveSessionState(rawInput.session_id, session ?? emptySessionState());
      return attachSessionDebug(result, rawInput.session_id, session);
    }

    const result = makeResult('address', {
      ok: true,
      next_action: 'CONFIRM_ADDRESS_VALUES',
      say: `Ich habe bisher Postleitzahl ${input.plz}, Hausnummer ${input.house_number} und Ihr Geburtsdatum verstanden. Bitte bestätigen oder korrigieren Sie diese Angaben kurz.`,
      reason: 'Address lookup failed once and the next safe step is targeted confirmation of the stored values.',
      missing_fields: [],
      safety_flags: ['address_retry', 'never_call_check_birthday_in_address_path'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.get_customer_by_plz_geb_result === 'error') {
    if ((input.address_lookup_attempts ?? 0) >= 2) {
      return attachSessionDebug(makeResult('address', {
        ok: false,
        next_action: 'FALLBACK_TO_VNR',
        say: 'Ich wechsle zur Verifizierung über Ihre Versicherungsnummer.',
        reason: 'Address lookup produced repeated errors, so the safe fallback is VNR verification.',
        missing_fields: [],
        safety_flags: ['address_lookup_error', 'fallback_to_vnr', 'never_call_check_birthday_in_address_path'],
      }), rawInput.session_id, session);
    }

    return attachSessionDebug(makeResult('address', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Address lookup returned an error before a safe retry decision could be made.',
      missing_fields: [],
      safety_flags: ['address_lookup_error', 'never_call_check_birthday_in_address_path'],
    }), rawInput.session_id, session);
  }
  const result = makeResult('address', {
    ok: true,
    next_action: 'CALL_GET_CUSTOMER_BY_PLZ_GEB',
    say: '',
    reason: 'PLZ, house number, and birthday are complete.',
    missing_fields: [],
    safety_flags: ['never_call_check_birthday_in_address_path'],
    function_to_call: 'get_customer_by_plz_geb',
  });
  saveSessionState(rawInput.session_id, session ?? emptySessionState());
  return attachSessionDebug(result, rawInput.session_id, session);
}

export function runVerificationVnrBrain(rawInput: VerificationVnrBrainInput): VerificationMethodBrainResult {
  const session = getSessionState(rawInput.session_id);
  if (session) {
    session.active_verification_path = 'vnr';
  }
  const latestText = rawInput.latest_customer_input;
  const latestCandidate = latestText ? normalizeVnrLoose(latestText).candidate : undefined;
  const birthdayMerge = mergeBirthday(
    rawInput.birthday_customer ?? session?.birthday_customer ?? undefined,
    latestText,
    session?.pending_birthday_day,
    session?.pending_birthday_month
  );
  const input: VerificationVnrBrainInput = {
    ...rawInput,
    vnr_raw: normalizeVnr(rawInput.vnr_raw ?? session?.vnr_candidate ?? latestCandidate),
    vnr_candidate: normalizeVnr(rawInput.vnr_candidate ?? session?.vnr_candidate ?? latestCandidate),
    vnr_confirmed:
      rawInput.vnr_confirmed === true ||
      ((rawInput.vnr_candidate !== undefined || session?.vnr_candidate !== null) && isYesLike(latestText))
        ? true
        : rawInput.vnr_confirmed ?? session?.vnr_confirmed ?? undefined,
    birthday_customer: birthdayMerge.value,
    check_insurance_number_format_result:
      rawInput.check_insurance_number_format_result ??
      (session?.check_insurance_number_format_result as VerificationVnrBrainInput['check_insurance_number_format_result'] | null) ??
      'not_called',
    get_customer_by_insurance_number_result:
      rawInput.get_customer_by_insurance_number_result ??
      (session?.get_customer_by_insurance_number_result as VerificationVnrBrainInput['get_customer_by_insurance_number_result'] | null) ??
      'not_called',
    check_birthday_result:
      rawInput.check_birthday_result ??
      (session?.check_birthday_result as VerificationVnrBrainInput['check_birthday_result'] | null) ??
      'not_called',
    check_birthday_error: rawInput.check_birthday_error ?? session?.check_birthday_error ?? undefined,
    vnr_request_count: rawInput.vnr_request_count ?? session?.attempts.vnr_request_attempts ?? 0,
    vnr_lookup_attempts: rawInput.vnr_lookup_attempts ?? session?.attempts.vnr_lookup_attempts ?? 0,
    birthday_request_count: rawInput.birthday_request_count ?? session?.attempts.birthday_collection_attempts ?? 0,
    birthday_check_attempts: rawInput.birthday_check_attempts ?? session?.attempts.birthday_check_attempts ?? 0,
  };

  if (session) {
    if (input.vnr_candidate) session.vnr_candidate = input.vnr_candidate;
    if (input.vnr_confirmed !== undefined) session.vnr_confirmed = input.vnr_confirmed;
    if (birthdayMerge.value) session.birthday_customer = birthdayMerge.value;
    if (birthdayMerge.parse.status === 'complete') {
      session.pending_birthday_day = null;
      session.pending_birthday_month = null;
    } else if (birthdayMerge.parse.status === 'incomplete_year') {
      session.pending_birthday_day = birthdayMerge.parse.day ?? null;
      session.pending_birthday_month = birthdayMerge.parse.month ?? null;
    }
    if (rawInput.check_insurance_number_format_result) {
      session.check_insurance_number_format_result = rawInput.check_insurance_number_format_result;
    }
    if (rawInput.get_customer_by_insurance_number_result) {
      session.get_customer_by_insurance_number_result = rawInput.get_customer_by_insurance_number_result;
      if (rawInput.get_customer_by_insurance_number_result !== 'not_called') {
        session.attempts.vnr_lookup_attempts += 1;
      }
    }
    if (rawInput.check_birthday_result) {
      session.check_birthday_result = rawInput.check_birthday_result;
      if (rawInput.check_birthday_result !== 'not_called') {
        session.attempts.birthday_check_attempts += 1;
      }
    }
    if (rawInput.check_birthday_error) session.check_birthday_error = rawInput.check_birthday_error;
    if (rawInput.latest_customer_input && !input.vnr_candidate) {
      session.attempts.vnr_request_attempts += 1;
    }
    if (rawInput.latest_customer_input && input.get_customer_by_insurance_number_result === 'found' && !birthdayMerge.value) {
      session.attempts.birthday_collection_attempts += 1;
    }
  }

  const transfer = maybeTransferHuman('vnr', input.customer_requested_human, input.office_hours);
  if (transfer) {
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(transfer, rawInput.session_id, session);
  }

  if (isMissingBirthdaySystem(input.check_birthday_error)) {
    return attachSessionDebug(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday verification cannot run because birthday_system is missing.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }), rawInput.session_id, session);
  }

  if (!input.vnr_candidate) {
    if ((input.vnr_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'VNR was not provided after the allowed number of requests.',
        missing_fields: ['vnr'],
        safety_flags: ['vnr_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versicherungsnummer.',
      reason: 'VNR is required to continue the VNR verification path.',
      missing_fields: ['vnr'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.vnr_confirmed !== true) {
    const result = makeResult('vnr', {
      ok: true,
      next_action: 'CONFIRM_VNR',
      say: `Ich habe ${input.vnr_candidate} verstanden. Ist das korrekt?`,
      reason: 'VNR must be confirmed before format validation or lookup.',
      missing_fields: [],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.check_insurance_number_format_result === 'not_called') {
    const result = makeResult('vnr', {
      ok: true,
      next_action: 'CALL_CHECK_INSURANCE_NUMBER_FORMAT',
      say: '',
      reason: 'Confirmed VNR must be format-checked before any customer lookup.',
      missing_fields: [],
      safety_flags: [],
      function_to_call: 'check_insurance_number_format',
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.check_insurance_number_format_result === 'invalid') {
    if ((input.vnr_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte die Versicherungsnummer leider nicht eindeutig verarbeiten.',
        reason: 'VNR format was invalid after the allowed retry limit.',
        missing_fields: ['vnr'],
        safety_flags: ['vnr_format_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Bitte nennen Sie mir Ihre Versicherungsnummer noch einmal.',
      reason: 'VNR format is invalid and one more request is allowed.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_format_retry'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.check_insurance_number_format_result === 'error') {
    return attachSessionDebug(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'VNR format check returned an error.',
      missing_fields: [],
      safety_flags: ['vnr_format_error'],
    }), rawInput.session_id, session);
  }

  if (input.get_customer_by_insurance_number_result === 'not_called') {
    const result = makeResult('vnr', {
      ok: false,
      next_action: 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER',
      say: '',
      reason:
        'VNR format is valid, but customer lookup has not been called yet. Birthday check is not allowed before customer lookup.',
      missing_fields: [],
      safety_flags: ['blocked_check_birthday_before_customer_lookup'],
      function_to_call: 'get_customer_by_insurance_number',
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.get_customer_by_insurance_number_result === 'not_found') {
    if ((input.vnr_lookup_attempts ?? 0) >= 2) {
      return attachSessionDebug(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig identifizieren.',
        reason: 'Customer lookup by insurance number failed twice.',
        missing_fields: [],
        safety_flags: ['vnr_lookup_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_VNR',
      say: 'Ich konnte Sie damit noch nicht finden. Bitte nennen oder bestätigen Sie Ihre Versicherungsnummer noch einmal.',
      reason: 'Customer lookup by insurance number failed once and one retry is still allowed.',
      missing_fields: ['vnr'],
      safety_flags: ['vnr_lookup_retry'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.get_customer_by_insurance_number_result === 'error') {
    return attachSessionDebug(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Customer lookup by insurance number returned an error.',
      missing_fields: [],
      safety_flags: ['vnr_lookup_error'],
    }), rawInput.session_id, session);
  }

  if (birthdayMerge.parse.status === 'incomplete_year') {
    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTH_YEAR',
      say: 'Bitte nennen Sie mir noch das Geburtsjahr vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was only partially provided.',
      missing_fields: ['birth_year'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (birthdayMerge.parse.status === 'impossible') {
    return attachSessionDebug(makeResult('vnr', {
      ok: false,
      next_action: 'ASK_BIRTHDAY',
      say: 'Das Geburtsdatum konnte ich so nicht verarbeiten. Bitte nennen Sie es noch einmal vollständig.',
      reason: birthdayMerge.parse.reason ?? 'Birthday was impossible or ambiguous.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_invalid'],
    }), rawInput.session_id, session);
  }

  if (!input.birthday_customer) {
    if ((input.birthday_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday was not provided after the allowed number of requests.',
        missing_fields: ['birthday_customer'],
        safety_flags: ['birthday_request_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.',
      reason: 'Customer lookup by insurance number found a customer, so birthday is the next safe verification step.',
      missing_fields: ['birthday_customer'],
      safety_flags: [],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.check_birthday_result === 'success') {
    return attachSessionDebug(makeResult('vnr', {
      ok: true,
      next_action: 'TRANSITION_WEITER',
      say: 'Danke, die Verifizierung ist abgeschlossen.',
      reason: 'Birthday check succeeded after the customer was found by insurance number.',
      missing_fields: [],
      safety_flags: [],
      transition_to: 'weiter',
    }), rawInput.session_id, session);
  }

  if (input.check_birthday_result === 'failed') {
    if ((input.birthday_check_attempts ?? 0) >= 2 || (input.birthday_request_count ?? 0) >= 2) {
      return attachSessionDebug(makeResult('vnr', {
        ok: false,
        next_action: 'TRANSITION_NICHT_IDENTIFIZIERT',
        say: 'Ich konnte Sie leider nicht eindeutig verifizieren.',
        reason: 'Birthday check failed after the allowed retry limit.',
        missing_fields: [],
        safety_flags: ['birthday_check_limit_reached'],
        transition_to: 'nicht_identifiziert',
      }), rawInput.session_id, session);
    }

    const result = makeResult('vnr', {
      ok: true,
      next_action: 'ASK_BIRTHDAY',
      say: 'Bitte nennen Sie mir Ihr Geburtsdatum noch einmal zur Verifizierung.',
      reason: 'Birthday check failed once and one retry is still allowed.',
      missing_fields: ['birthday_customer'],
      safety_flags: ['birthday_retry'],
    });
    saveSessionState(rawInput.session_id, session ?? emptySessionState());
    return attachSessionDebug(result, rawInput.session_id, session);
  }

  if (input.birthday_system_available === false) {
    return attachSessionDebug(makeResult('vnr', {
      ok: false,
      next_action: 'TECHNICAL_ESCALATION',
      say: 'Es gibt gerade ein technisches Problem bei der Verifizierung. Ich gebe das intern weiter.',
      reason: 'Birthday system is unavailable, so check_birthday is not safe to call.',
      missing_fields: ['birthday_system'],
      safety_flags: ['missing_birthday_system', 'block_birthday_loop'],
    }), rawInput.session_id, session);
  }
  const result = makeResult('vnr', {
    ok: true,
    next_action: 'CALL_CHECK_BIRTHDAY',
    say: '',
    reason: 'Customer lookup found a customer and birthday is available, so check_birthday is the next safe step.',
    missing_fields: [],
    safety_flags: [],
    function_to_call: 'check_birthday',
  });
  saveSessionState(rawInput.session_id, session ?? emptySessionState());
  return attachSessionDebug(result, rawInput.session_id, session);
}
