/** German NATO / police alphabet word → letter (for standalone "die Emil" etc.). */
const PHONETIC_WORD_TO_LETTER: Record<string, string> = {
  anton: 'A',
  berta: 'B',
  caesar: 'C',
  dora: 'D',
  emil: 'E',
  email: 'E',
  friedrich: 'F',
  gustav: 'G',
  heinrich: 'H',
  ida: 'I',
  julius: 'J',
  kaufmann: 'K',
  ludwig: 'L',
  martha: 'M',
  nordpol: 'N',
  otto: 'O',
  paula: 'P',
  quelle: 'Q',
  richard: 'R',
  samuel: 'S',
  theodor: 'T',
  ulrich: 'U',
  viktor: 'V',
  wilhelm: 'W',
  xanthippe: 'X',
  ypsilon: 'Y',
  zeppelin: 'Z',
};

const WORD_TO_DIGIT: Record<string, string> = {
  null: '0',
  nul: '0',
  eins: '1',
  ein: '1',
  eine: '1',
  zwei: '2',
  zwo: '2',
  drei: '3',
  vier: '4',
  fünf: '5',
  fuenf: '5',
  funf: '5',
  sechs: '6',
  sieben: '7',
  acht: '8',
  neun: '9',
};

function normalizePhoneticToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

/**
 * Extract only the leading insurance letter from spoken text (no digits required).
 * Handles "e wie Emil", "die Emil", "Das ist genau e wie E-Mail", and lone "e".
 */
export function extractVnrLeadingLetter(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLowerCase();

  const phoneticMatch = lower.match(/\b([a-z])[,\s]+wie\s+[\w-]+/);
  if (phoneticMatch) {
    return phoneticMatch[1].toUpperCase();
  }

  const tokens = lower.split(/[\s,.\-/]+/).filter(Boolean);
  const firstToken = tokens[0];
  if (firstToken && /^[a-z]$/.test(firstToken)) {
    return firstToken.toUpperCase();
  }

  for (const rawToken of tokens) {
    const token = normalizePhoneticToken(rawToken);
    const letter = PHONETIC_WORD_TO_LETTER[token];
    if (letter) return letter;
  }

  if (tokens.length === 1 && /^[a-z]$/.test(tokens[0])) {
    return tokens[0].toUpperCase();
  }

  if (!hasSpokenVnrDigits(lower)) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (/^[a-z]$/.test(tokens[i])) {
        return tokens[i].toUpperCase();
      }
    }
  }

  if (/^[A-Za-z]$/.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return undefined;
}

function hasSpokenVnrDigits(text: string): boolean {
  const tokens = text.toLowerCase().split(/[\s,.\-/]+/).filter(Boolean);
  return tokens.some((token) => WORD_TO_DIGIT[token] !== undefined || /^\d+$/.test(token));
}

function stripLeadingLetterForDigits(text: string): string {
  const lower = text.toLowerCase();
  if (/\b[a-z][,\s]+wie\s+[\w-]+/.test(lower)) {
    return lower.replace(/\b[a-z][,\s]+wie\s+[\w-]+/, ' ');
  }
  const letter = extractVnrLeadingLetter(text);
  if (!letter) return lower;
  for (const rawToken of lower.split(/[\s,.\-/]+/).filter(Boolean)) {
    const token = normalizePhoneticToken(rawToken);
    if (PHONETIC_WORD_TO_LETTER[token] === letter) {
      return lower.replace(new RegExp(`\\b${rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ' ');
    }
  }
  return lower.replace(new RegExp(`\\b${letter.toLowerCase()}\\b`), ' ');
}

/** Extract only the digit run from spoken VNR text (no leading letter). */
export function extractVnrDigits(text: string): string {
  const tokens = stripLeadingLetterForDigits(text).split(/[\s,.\-/]+/).filter(Boolean);
  let digits = '';
  for (const token of tokens) {
    if (WORD_TO_DIGIT[token] !== undefined) {
      digits += WORD_TO_DIGIT[token];
    } else if (/^\d+$/.test(token)) {
      digits += token;
    }
  }
  return digits;
}

const VNR_CORRECTION_PHRASES = [
  'am anfang',
  'vorne',
  'zu beginn',
  'anfang',
  'korrigier',
  'nicht ',
  'sondern',
  'falsch',
  'eigentlich',
  'gemeint',
  'also am',
  'doch ',
];

export function isVnrCorrectionLike(text: string | undefined): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return VNR_CORRECTION_PHRASES.some((phrase) => lower.includes(phrase)) && extractVnrDigits(text).length > 0;
}

/** Patch an existing full VNR using a spoken correction fragment. */
export function applyVnrCorrection(existingVnr: string, correctionText: string): string | undefined {
  const compact = existingVnr.replace(/\s+/g, '').toUpperCase();
  const match = compact.match(/^([A-Z])(\d{9})$/);
  if (!match) return undefined;
  const letter = match[1];
  const digits = match[2];
  const patch = extractVnrDigits(correctionText);
  if (!patch) return undefined;
  const lower = correctionText.toLowerCase();

  let newDigits = digits;
  if (/\b(am anfang|vorne|zu beginn|anfang)\b/.test(lower)) {
    newDigits = patch.length >= 9 ? patch.slice(0, 9) : patch + digits.slice(patch.length);
  } else if (/\b(am ende|hinten)\b/.test(lower)) {
    newDigits = patch.length >= 9 ? patch.slice(0, 9) : digits.slice(0, 9 - patch.length) + patch;
  } else if (patch.length === 9) {
    newDigits = patch;
  } else if (patch.length > 0) {
    newDigits = patch + digits.slice(patch.length);
  } else {
    return undefined;
  }

  if (!/^\d{9}$/.test(newDigits)) return undefined;
  const corrected = letter + newDigits;
  return corrected === compact ? undefined : corrected;
}

export function mergePendingVnrParts(
  letter: string,
  existingDigits: string,
  newDigitText: string
): { digits: string; complete: boolean; candidate?: string } {
  const combined = (existingDigits + extractVnrDigits(newDigitText)).slice(0, 9);
  const complete = combined.length === 9;
  return {
    digits: combined,
    complete,
    candidate: complete ? letter.toUpperCase() + combined : undefined,
  };
}

/** Merge a spoken letter with nine session digits into a full VNR candidate. */
export function mergeVnrLetterWithDigits(
  digitsCandidate: string | undefined,
  letterText: string | undefined
): string | undefined {
  if (!digitsCandidate || !letterText) return undefined;
  const digits = digitsCandidate.replace(/\s+/g, '');
  if (!/^[0-9]{9}$/.test(digits)) return undefined;
  const letter = extractVnrLeadingLetter(letterText);
  if (!letter) return undefined;
  return letter + digits;
}

export interface NormalizeVnrResult {
  candidate: string;
  valid_shape: boolean;
  confidence?: 'high' | 'medium' | 'low';
  notes?: string;
  partial?: boolean;
  missing_digits?: number;
}

/**
 * Normalize messy spoken German VNR (Versicherungsnummer) text.
 * VNR format: exactly 1 Latin letter + 9 digits, e.g. L039359923
 *
 * Handles:
 * - Phonetic: "L wie Ludwig" → L  (high confidence)
 * - Bare capital: "L" → L         (medium confidence)
 * - German number words: null/eins/zwei/drei/vier/fünf/sechs/sieben/acht/neun
 * - Mixed digit characters and number words
 * - Partial results when digits are missing
 */
export function normalizeVnr(text: string): NormalizeVnrResult {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const notes: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'high';
  let letter: string | null = null;

  // Compact typed/spoken: E207064360 or e207064360
  const compact = trimmed.replace(/\s+/g, '');
  const compactMatch = compact.match(/^([A-Za-z])(\d{9})$/);
  if (compactMatch) {
    return {
      candidate: compactMatch[1].toUpperCase() + compactMatch[2],
      valid_shape: true,
      confidence: 'high',
      notes: 'Parsed compact letter + nine digit VNR.',
    };
  }

  // ── Step 1: Extract the starting letter ──────────────────────────────
  const extractedLetter = extractVnrLeadingLetter(trimmed);
  if (extractedLetter) {
    letter = extractedLetter;
    notes.push(`Extracted ${letter} from spoken letter cues.`);
    if (!/\b[a-z][,\s]+wie\s+/i.test(lower) && !/^[a-z]$/i.test(trimmed.split(/[\s,.\-/]+/).filter(Boolean)[0] ?? '')) {
      confidence = 'medium';
    }
  }

  // ── Step 2: Remove only the matched letter/phonetic block ─────────────
  // Do NOT use a blanket single-letter strip: ü in "fünf" creates a false \b
  // boundary before the leading f, which would get silently removed.
  let remaining = lower;
  if (/\b[a-z][,\s]+wie\s+[\w-]+/.test(lower)) {
    remaining = lower.replace(/\b[a-z][,\s]+wie\s+[\w-]+/, ' ');
  } else if (letter) {
    for (const rawToken of lower.split(/[\s,.\-/]+/).filter(Boolean)) {
      const token = normalizePhoneticToken(rawToken);
      if (PHONETIC_WORD_TO_LETTER[token] === letter) {
        remaining = lower.replace(new RegExp(`\\b${rawToken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`), ' ');
        break;
      }
    }
    if (remaining === lower) {
      remaining = lower.replace(new RegExp(`\\b${letter.toLowerCase()}\\b`), ' ');
    }
  }

  const tokens = remaining.split(/[\s,.\-/]+/).filter(Boolean);
  let digits = '';

  for (const token of tokens) {
    if (WORD_TO_DIGIT[token] !== undefined) {
      digits += WORD_TO_DIGIT[token];
    } else if (/^\d+$/.test(token)) {
      // Accept digit characters directly (e.g. someone typed "3" not "drei")
      digits += token;
    }
    // Unrecognised tokens are silently skipped
  }

  // ── Step 3: Assemble candidate and validate shape ─────────────────────
  if (!letter) {
    return {
      candidate: digits,
      valid_shape: false,
      partial: true,
      missing_digits: Math.max(0, 9 - digits.length),
      confidence: 'low',
      notes: 'Could not identify a starting letter. VNR must be 1 letter + 9 digits.',
    };
  }

  const candidate = letter + digits;

  if (digits.length === 9) {
    return {
      candidate,
      valid_shape: true,
      confidence,
      notes: notes.join(' ') + ' Converted German number words to digits.',
    };
  }

  return {
    candidate,
    valid_shape: false,
    partial: true,
    missing_digits: 9 - digits.length,
    confidence: 'low',
    notes: notes.join(' ') + ` Only found ${digits.length}/9 required digits.`,
  };
}
