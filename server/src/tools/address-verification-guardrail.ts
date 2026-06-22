type Confidence = 'high' | 'medium' | 'low';
type MissingField = 'plz' | 'house_number' | 'birthday';
type NextAction =
  | 'ask_plz'
  | 'ask_house_number'
  | 'ask_birthday'
  | 'confirm_values'
  | 'lookup'
  | 'fallback_to_vnr';

export interface AddressVerificationGuardrailInput {
  raw_text: string;
  known_plz: string | null;
  known_house_number: string | null;
  known_birthday: string | null;
  attempt: number;
}

export interface AddressVerificationGuardrailResult {
  plz: string | null;
  house_number: string | null;
  birthday: string | null;
  missing_fields: MissingField[];
  confidence: Confidence;
  safe_to_lookup: boolean;
  next_action: NextAction;
  say_hint: string;
  reason: string;
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
  februar_: 2,
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

interface ParsedValue<T> {
  value: T | null;
  explicit: boolean;
  confidence: Confidence;
  reason?: string;
}

interface Token {
  raw: string;
  normalized: string;
  index: number;
}

const HOUSE_NUMBER_SUFFIX_WORDS = new Set([
  'a',
  'b',
  'c',
  'd',
  'alpha',
  'beta',
]);

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
    .map((raw, index) => ({ raw, normalized: normalizeToken(raw), index }))
    .filter((token) => token.normalized.length > 0);
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
    erstes: 1,
    zweite: 2,
    zweiter: 2,
    zweiten: 2,
    zweites: 2,
    dritte: 3,
    dritter: 3,
    dritten: 3,
    drittes: 3,
    vierte: 4,
    vierter: 4,
    vierten: 4,
    viertes: 4,
    funfte: 5,
    funfter: 5,
    funften: 5,
    funftes: 5,
    fuenfte: 5,
    fuenfter: 5,
    fuenften: 5,
    fuenftes: 5,
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

function parseNumericBirthday(rawText: string): ParsedValue<string> {
  const match = rawText.match(/\b(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})\b/);
  if (!match) return { value: null, explicit: false, confidence: 'low' };

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const iso = toIsoDate(day, month, year);
  if (!iso) {
    return {
      value: null,
      explicit: true,
      confidence: 'low',
      reason: 'Birthday looked numeric but could not be validated.',
    };
  }

  return {
    value: iso,
    explicit: true,
    confidence: String(match[3]).length === 4 ? 'high' : 'medium',
  };
}

function parseGermanYearTokens(tokens: Token[], start: number): { year: number | null; used: number } {
  for (let length = Math.min(4, tokens.length - start); length >= 1; length -= 1) {
    const joined = tokens
      .slice(start, start + length)
      .map((token) => token.normalized)
      .join('');
    const value = parseGermanCardinalWord(joined);
    if (value !== null) {
      return { year: value, used: length };
    }
  }
  return { year: null, used: 0 };
}

function parseSpokenBirthday(rawText: string): ParsedValue<string> {
  const tokens = tokenize(rawText);
  if (tokens.length === 0) return { value: null, explicit: false, confidence: 'low' };

  for (let i = 0; i < tokens.length; i += 1) {
    const monthValue = MONTH_WORDS[tokens[i].normalized];
    if (monthValue === undefined || i === 0) continue;
    const dayValue = parseOrdinalToken(tokens[i - 1].normalized);
    if (dayValue === null) continue;
    const { year, used } = parseGermanYearTokens(tokens, i + 1);
    if (year === null || used === 0) continue;
    const iso = toIsoDate(dayValue, monthValue, year);
    if (iso) {
      return {
        value: iso,
        explicit: true,
        confidence: 'high',
      };
    }
  }

  for (let i = 0; i < tokens.length - 2; i += 1) {
    const dayValue = parseOrdinalToken(tokens[i].normalized);
    const monthValue = parseOrdinalToken(tokens[i + 1].normalized);
    if (dayValue === null || monthValue === null) continue;
    const { year, used } = parseGermanYearTokens(tokens, i + 2);
    if (year === null || used === 0) continue;
    const iso = toIsoDate(dayValue, monthValue, year);
    if (iso) {
      return {
        value: iso,
        explicit: true,
        confidence: 'high',
      };
    }
  }

  return { value: null, explicit: false, confidence: 'low' };
}

function sanitizeKnownPlz(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits.length === 5 ? digits : null;
}

function sanitizeKnownHouseNumber(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  return digits ? digits : null;
}

function sanitizeKnownBirthday(value: string | null): string | null {
  if (typeof value !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
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

function parsePlz(rawText: string): ParsedValue<string> {
  const explicitMatch = rawText.match(
    /\b(?:plz|postleitzahl)\b[:\s,-]*(\d{5}|\d(?:[\s,.-]*\d){4})/i
  );
  if (explicitMatch) {
    const digits = explicitMatch[1].replace(/\D/g, '');
    if (digits.length === 5) return { value: digits, explicit: true, confidence: 'high' };
  }

  const directMatches = rawText.match(/\b\d{5}\b/g);
  if (directMatches?.length) {
    return { value: directMatches[0], explicit: true, confidence: 'high' };
  }

  const digitRuns = extractDigitRuns(rawText).filter((run) => run.length === 5);
  if (digitRuns.length > 0) {
    return { value: digitRuns[0], explicit: true, confidence: 'medium' };
  }

  const hasPlzCue = /\b(plz|postleitzahl)\b/i.test(rawText);
  if (hasPlzCue) {
    return {
      value: null,
      explicit: true,
      confidence: 'low',
      reason: 'PLZ was mentioned but not as a complete 5-digit value.',
    };
  }

  return { value: null, explicit: false, confidence: 'low' };
}

function stripHouseNumberSuffix(value: string): string {
  const compact = value.replace(/\s+/g, '');
  const match = compact.match(/^(\d+)/);
  return match ? match[1] : '';
}

function isHouseNumberSuffixToken(token: Token): boolean {
  return HOUSE_NUMBER_SUFFIX_WORDS.has(token.normalized) || /^[a-z]$/i.test(token.normalized);
}

function hasBirthdayLikeShape(rawText: string): boolean {
  return /\d{1,2}\s*[./-]\s*\d{1,2}(?:\s*[./-]\s*\d{2,4})?/.test(rawText);
}

function parseNumberFromTokenWindow(tokens: Token[], start: number): { value: string | null; used: number; confidence: Confidence } {
  const maxLength = Math.min(4, tokens.length - start);

  for (let length = maxLength; length >= 1; length -= 1) {
    const window = tokens.slice(start, start + length).map((token) => token.normalized);
    const joined = window.join('');

    if (length === 1) {
      const digitPrefix = stripHouseNumberSuffix(window[0]);
      if (digitPrefix) {
        return { value: digitPrefix, used: 1, confidence: 'high' };
      }
    }

    const spokenDigits = window.map((token) => DIGIT_WORDS[token]);
    if (spokenDigits.every((digit) => digit !== undefined)) {
      return { value: spokenDigits.join(''), used: length, confidence: 'high' };
    }

    const cardinalValue = parseGermanCardinalWord(joined);
    if (cardinalValue !== null) {
      return {
        value: String(cardinalValue),
        used: length,
        confidence: 'high',
      };
    }
  }

  return { value: null, used: 0, confidence: 'low' };
}

function parseHouseNumber(rawText: string): ParsedValue<string> {
  const tokens = tokenize(rawText);
  const cueIndex = tokens.findIndex((token) =>
    ['hausnummer', 'hausnr', 'nummer', 'nr'].includes(token.normalized)
  );

  const tryParseAt = (start: number, explicit: boolean): ParsedValue<string> => {
    const parsed = parseNumberFromTokenWindow(tokens, start);
    if (!parsed.value) {
      return explicit
        ? {
            value: null,
            explicit: true,
            confidence: 'low',
            reason: 'House number was mentioned but could not be parsed.',
          }
        : { value: null, explicit: false, confidence: 'low' };
    }

    const trailing = tokens.slice(start + parsed.used);
    if (trailing.some((token) => !isHouseNumberSuffixToken(token))) {
      return explicit
        ? {
            value: null,
            explicit: true,
            confidence: 'low',
            reason: 'House number was mentioned but could not be parsed.',
          }
        : { value: null, explicit: false, confidence: 'low' };
    }

    return {
      value: parsed.value,
      explicit,
      confidence: parsed.confidence,
    };
  };

  if (cueIndex !== -1) {
    return tryParseAt(cueIndex + 1, true);
  }

  if (hasBirthdayLikeShape(rawText) || tokens.length === 0 || tokens.length > 4) {
    return { value: null, explicit: false, confidence: 'low' };
  }

  return tryParseAt(0, true);
}

function parseBirthday(rawText: string): ParsedValue<string> {
  const numeric = parseNumericBirthday(rawText);
  if (numeric.value) return numeric;
  const spoken = parseSpokenBirthday(rawText);
  if (spoken.value) return spoken;

  const hasCue = /\b(geboren|geburtsdatum|geburtstag)\b/i.test(rawText);
  if (numeric.explicit || spoken.explicit || hasCue) {
    return {
      value: null,
      explicit: true,
      confidence: 'low',
      reason: 'Birthday was mentioned but could not be parsed safely.',
    };
  }

  return { value: null, explicit: false, confidence: 'low' };
}

function nextMissingField(missing: MissingField[]): MissingField | null {
  if (missing.includes('plz')) return 'plz';
  if (missing.includes('house_number')) return 'house_number';
  if (missing.includes('birthday')) return 'birthday';
  return null;
}

function askActionForField(field: MissingField): NextAction {
  if (field === 'plz') return 'ask_plz';
  if (field === 'house_number') return 'ask_house_number';
  return 'ask_birthday';
}

function askHintForField(field: MissingField, onlyOneMissing: boolean): string {
  if (field === 'plz') {
    return onlyOneMissing
      ? 'Danke, mir fehlt nur noch die Postleitzahl.'
      : 'Danke, ich brauche zuerst die Postleitzahl.';
  }
  if (field === 'house_number') {
    return onlyOneMissing
      ? 'Danke, mir fehlt nur noch die Hausnummer.'
      : 'Danke, mir fehlt als Nächstes die Hausnummer.';
  }
  return onlyOneMissing
    ? 'Danke, mir fehlt nur noch das Geburtsdatum.'
    : 'Danke, ich brauche als Nächstes das Geburtsdatum.';
}

function combineConfidence(values: Confidence[]): Confidence {
  if (values.includes('low')) return 'low';
  if (values.includes('medium')) return 'medium';
  return 'high';
}

export function parseAddressVerificationGuardrail(
  input: AddressVerificationGuardrailInput
): AddressVerificationGuardrailResult {
  const rawText = typeof input.raw_text === 'string' ? input.raw_text.trim() : '';
  const knownPlz = sanitizeKnownPlz(input.known_plz);
  const knownHouseNumber = sanitizeKnownHouseNumber(input.known_house_number);
  const knownBirthday = sanitizeKnownBirthday(input.known_birthday);
  const attempt = Number.isFinite(input.attempt) ? Math.max(1, Math.trunc(input.attempt)) : 1;

  const parsedPlz = parsePlz(rawText);
  const parsedHouseNumber = parseHouseNumber(rawText);
  const parsedBirthday = parseBirthday(rawText);

  const plz = parsedPlz.value ?? knownPlz;
  const house_number = parsedHouseNumber.value ?? knownHouseNumber;
  const birthday = parsedBirthday.value ?? knownBirthday;

  const missing_fields: MissingField[] = [];
  if (!plz || !/^\d{5}$/.test(plz)) missing_fields.push('plz');
  if (!house_number || !/^\d+$/.test(house_number)) missing_fields.push('house_number');
  if (!birthday || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) missing_fields.push('birthday');

  const confidenceSignals: Confidence[] = [];
  if (plz) confidenceSignals.push(parsedPlz.value ? parsedPlz.confidence : 'high');
  if (house_number) confidenceSignals.push(parsedHouseNumber.value ? parsedHouseNumber.confidence : 'high');
  if (birthday) confidenceSignals.push(parsedBirthday.value ? parsedBirthday.confidence : 'high');
  if (missing_fields.length > 0) {
    confidenceSignals.push('medium');
    if (
      (parsedPlz.explicit && !parsedPlz.value) ||
      (parsedHouseNumber.explicit && !parsedHouseNumber.value) ||
      (parsedBirthday.explicit && !parsedBirthday.value)
    ) {
      confidenceSignals.push('low');
    }
  }
  const confidence = confidenceSignals.length > 0 ? combineConfidence(confidenceSignals) : 'low';

  const safe_to_lookup =
    missing_fields.length === 0 &&
    confidence !== 'low' &&
    /^\d{5}$/.test(plz ?? '') &&
    /^\d+$/.test(house_number ?? '') &&
    /^\d{4}-\d{2}-\d{2}$/.test(birthday ?? '');

  if (safe_to_lookup) {
    const usedKnownValues =
      (knownPlz && !parsedPlz.value) || (knownHouseNumber && !parsedHouseNumber.value) || (knownBirthday && !parsedBirthday.value);
    return {
      plz,
      house_number,
      birthday,
      missing_fields,
      confidence,
      safe_to_lookup: true,
      next_action: 'lookup',
      say_hint: 'Danke, ich prüfe das jetzt.',
      reason: usedKnownValues
        ? 'Missing field was provided and known fields were preserved.'
        : 'All required fields were parsed with high confidence.',
    };
  }

  if (attempt >= 2) {
    return {
      plz,
      house_number,
      birthday,
      missing_fields,
      confidence,
      safe_to_lookup: false,
      next_action: 'fallback_to_vnr',
      say_hint:
        'Das klappt so leider nicht eindeutig. Ich frage Sie stattdessen nach Ihrer Versichertennummer.',
      reason: 'Second address verification attempt is still incomplete or ambiguous.',
    };
  }

  const firstMissing = nextMissingField(missing_fields);
  if (firstMissing) {
    const missingSummary =
      missing_fields.length === 1
        ? `mir fehlt nur noch ${firstMissing === 'plz' ? 'die PLZ' : firstMissing === 'house_number' ? 'die Hausnummer' : 'das Geburtsdatum'}`
        : `${missing_fields.filter((field) => field !== firstMissing).length + 1} required fields are still incomplete`;
    const reason =
      missing_fields.length === 1
        ? `${
            firstMissing === 'plz'
              ? 'PLZ'
              : firstMissing === 'house_number'
                ? 'House number'
                : 'Birthday'
          } missing.`
        : `Need ${firstMissing.replace('_', ' ')} first before continuing.`;

    return {
      plz,
      house_number,
      birthday,
      missing_fields,
      confidence,
      safe_to_lookup: false,
      next_action: askActionForField(firstMissing),
      say_hint: askHintForField(firstMissing, missing_fields.length === 1),
      reason:
        missing_fields.length === 1
          ? `${
              firstMissing === 'plz'
                ? 'House number and birthday found, PLZ missing.'
                : firstMissing === 'house_number'
                  ? 'PLZ and birthday found, house number missing.'
                  : 'PLZ and house number found, birthday missing.'
            }`
          : `Address data is not complete yet; ${missingSummary}.`,
    };
  }

  return {
    plz,
    house_number,
    birthday,
    missing_fields,
    confidence,
    safe_to_lookup: false,
    next_action: 'confirm_values',
    say_hint: 'Ich möchte die Angaben kurz bestätigen, bevor ich prüfe.',
    reason: 'All fields are present, but the parse confidence is too low for a safe lookup.',
  };
}
