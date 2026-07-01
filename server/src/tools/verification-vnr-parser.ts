import { normalizeVnr as normalizeVnrLoose } from './normalize-vnr.js';

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

/** German spelling alphabet / common spoken letter names → letter */
const SPELLING_WORD_TO_LETTER: Record<string, string> = {
  anton: 'A',
  berta: 'B',
  caesar: 'C',
  cäsar: 'C',
  casar: 'C',
  dora: 'D',
  emil: 'E',
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
  zacharias: 'Z',
};

export interface VnrParseResult {
  candidate: string | null;
  digits_only: string | null;
  leading_letter: string | null;
  awaiting_letter: boolean;
  valid_shape: boolean;
}

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function extractDigitsFromText(text: string, stripLeadingLetter = true): string {
  let remaining = text.toLowerCase();
  if (stripLeadingLetter) {
    const phoneticMatch = remaining.match(/\b([a-z])[,\s]+wie\s+\w+/);
    if (phoneticMatch) {
      remaining = remaining.replace(/\b[a-z][,\s]+wie\s+\w+/, ' ');
    } else {
      const tokens = text.toLowerCase().split(/[\s,.\-/]+/).filter(Boolean);
      const bareLetterToken = tokens.find((token) => /^[a-z]$/.test(token));
      if (bareLetterToken) {
        remaining = remaining.replace(new RegExp(`\\b${bareLetterToken}\\b`), ' ');
      }
    }
  }

  const tokens = remaining.split(/[\s,.\-/]+/).filter(Boolean);
  let digits = '';
  for (const token of tokens) {
    const normalized = normalizeToken(token);
    if (DIGIT_WORDS[normalized] !== undefined) {
      digits += DIGIT_WORDS[normalized];
    } else if (/^\d+$/.test(token)) {
      digits += token;
    }
  }
  return digits;
}

function extractLeadingLetter(text: string): string | null {
  const lower = text.toLowerCase().trim();
  const phoneticMatch = lower.match(/\b([a-z])[,\s]+wie\s+(\w+)/);
  if (phoneticMatch) {
    return phoneticMatch[1].toUpperCase();
  }

  const tokens = lower.split(/[\s,.\-/]+/).filter(Boolean);
  for (const token of tokens) {
    if (/^[a-z]$/.test(token)) {
      return token.toUpperCase();
    }
    const normalized = normalizeToken(token);
    const fromSpelling = SPELLING_WORD_TO_LETTER[normalized];
    if (fromSpelling) return fromSpelling;
  }

  return null;
}

function isValidVnrShape(candidate: string): boolean {
  return /^[A-Z][0-9]{9}$/.test(candidate);
}

/**
 * Parse spoken/typed VNR fragments, optionally merging with digits collected earlier.
 */
export function parseVnrUtterance(
  text: string | undefined,
  storedDigits: string | null | undefined
): VnrParseResult {
  if (!text?.trim()) {
    if (storedDigits && /^\d{9}$/.test(storedDigits)) {
      return {
        candidate: null,
        digits_only: storedDigits,
        leading_letter: null,
        awaiting_letter: true,
        valid_shape: false,
      };
    }
    return {
      candidate: null,
      digits_only: null,
      leading_letter: null,
      awaiting_letter: false,
      valid_shape: false,
    };
  }

  const loose = normalizeVnrLoose(text);
  if (loose.valid_shape && isValidVnrShape(loose.candidate)) {
    return {
      candidate: loose.candidate,
      digits_only: loose.candidate.slice(1),
      leading_letter: loose.candidate[0],
      awaiting_letter: false,
      valid_shape: true,
    };
  }

  const leadingLetter = extractLeadingLetter(text);
  const digits = extractDigitsFromText(text, Boolean(leadingLetter));

  if (storedDigits && /^\d{9}$/.test(storedDigits) && leadingLetter && !digits) {
    const merged = `${leadingLetter}${storedDigits}`;
    return {
      candidate: merged,
      digits_only: storedDigits,
      leading_letter: leadingLetter,
      awaiting_letter: false,
      valid_shape: isValidVnrShape(merged),
    };
  }

  if (digits.length === 9 && leadingLetter) {
    const candidate = `${leadingLetter}${digits}`;
    return {
      candidate,
      digits_only: digits,
      leading_letter: leadingLetter,
      awaiting_letter: false,
      valid_shape: isValidVnrShape(candidate),
    };
  }

  if (digits.length === 9 && !leadingLetter) {
    return {
      candidate: digits,
      digits_only: digits,
      leading_letter: null,
      awaiting_letter: true,
      valid_shape: false,
    };
  }

  if (leadingLetter && digits.length > 0 && digits.length < 9) {
    const candidate = `${leadingLetter}${digits}`;
    return {
      candidate,
      digits_only: digits,
      leading_letter: leadingLetter,
      awaiting_letter: false,
      valid_shape: isValidVnrShape(candidate),
    };
  }

  if (leadingLetter && !digits && !storedDigits) {
    return {
      candidate: leadingLetter,
      digits_only: null,
      leading_letter: leadingLetter,
      awaiting_letter: false,
      valid_shape: false,
    };
  }

  if (loose.candidate) {
    const candidate = loose.candidate.toUpperCase();
    if (isValidVnrShape(candidate)) {
      return {
        candidate,
        digits_only: candidate.slice(1),
        leading_letter: candidate[0],
        awaiting_letter: false,
        valid_shape: true,
      };
    }
    if (/^\d{9}$/.test(candidate)) {
      return {
        candidate,
        digits_only: candidate,
        leading_letter: null,
        awaiting_letter: true,
        valid_shape: false,
      };
    }
  }

  return {
    candidate: null,
    digits_only: digits || null,
    leading_letter: leadingLetter,
    awaiting_letter: false,
    valid_shape: false,
  };
}
