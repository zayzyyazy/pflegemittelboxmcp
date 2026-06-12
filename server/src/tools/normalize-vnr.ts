// Mapping of German spoken number words → single digit character
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
  const lower = text.toLowerCase().trim();
  const notes: string[] = [];
  let confidence: 'high' | 'medium' | 'low' = 'high';
  let letter: string | null = null;

  // ── Step 1: Extract the starting letter ──────────────────────────────
  // Primary: phonetic form "X wie Word" or "X, wie Word"
  const phoneticMatch = lower.match(/\b([a-z])[,\s]+wie\s+\w+/);
  if (phoneticMatch) {
    letter = phoneticMatch[1].toUpperCase();
    notes.push(`Extracted ${letter} from phonetic "wie" pattern.`);
  } else {
    // Fallback: bare capital letter at a word boundary in the original text
    const bareMatch = text.match(/\b([A-Z])\b/);
    if (bareMatch) {
      letter = bareMatch[1];
      notes.push(`Extracted bare letter ${letter} (no phonetic context).`);
      confidence = 'medium';
    }
  }

  // ── Step 2: Remove only the matched letter/phonetic block ─────────────
  // Do NOT use a blanket single-letter strip: ü in "fünf" creates a false \b
  // boundary before the leading f, which would get silently removed.
  let remaining = lower;
  if (phoneticMatch) {
    // Remove the entire "X wie Word" block
    remaining = lower.replace(/\b[a-z][,\s]+wie\s+\w+/, ' ');
  } else if (letter) {
    // Remove only the first standalone occurrence of this specific letter
    remaining = lower.replace(new RegExp(`\\b${letter.toLowerCase()}\\b`), ' ');
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
