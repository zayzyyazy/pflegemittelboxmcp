import type { VerificationPath } from './verification-method-router.js';

export type SpeechMatchConfidence = 'high' | 'medium' | 'low';

export interface MethodChoiceClassification {
  path: VerificationPath | null;
  confidence: SpeechMatchConfidence;
  reason: string;
}

function normalizeSpeech(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      matrix[i][j] =
        a[i - 1] === b[j - 1]
          ? matrix[i - 1][j - 1]
          : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyIncludes(normalized: string, anchor: string, maxDistance = 2): boolean {
  if (normalized.includes(anchor)) return true;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.some((word) => {
    if (word.length < 3) return false;
    return levenshtein(word, anchor) <= maxDistance;
  });
}

const ADDRESS_HIGH = [
  'postleitzahl',
  'postleizahl',
  'postleizal',
  'plz',
  'adresse',
  'post code',
  'postcode',
];

const ADDRESS_MEDIUM = ['post', 'zip', 'postal', 'wohnort', 'adress'];

const VNR_HIGH = [
  'versichertennummer',
  'versicherungsnummer',
  'versichernnummer',
  'krankenversicherungsnummer',
  'krankenkassennummer',
  'vnr',
  'versichern',
  'verischern',
];

const VNR_MEDIUM = [
  'versicher',
  'versichert',
  'versicherte',
  'nummer',
  'krankenkasse',
  'krankenversicherung',
  'gesundheitskarte',
  'gesundheitsnummer',
];

/**
 * STT-tolerant method choice classifier for phone transcripts.
 */
export function classifyVerificationMethodChoice(text: string | undefined): MethodChoiceClassification {
  if (!text?.trim()) {
    return { path: null, confidence: 'low', reason: 'Empty method choice input.' };
  }

  const normalized = normalizeSpeech(text);
  if (!normalized) {
    return { path: null, confidence: 'low', reason: 'No usable tokens in method choice input.' };
  }

  const addressHigh = ADDRESS_HIGH.some((keyword) => normalized.includes(keyword.replace(/\s+/g, '')));
  const vnrHigh = VNR_HIGH.some((keyword) => normalized.includes(keyword));
  const addressMedium =
    ADDRESS_MEDIUM.some((keyword) => normalized === keyword || normalized.startsWith(`${keyword} `)) ||
    fuzzyIncludes(normalized, 'postleitzahl', 3) ||
    /^post(?:leit|leiz|leitz)?/.test(normalized);
  const vnrMedium =
    VNR_MEDIUM.some((keyword) => normalized === keyword || normalized.includes(keyword)) ||
    /ver?sich/.test(normalized) ||
    fuzzyIncludes(normalized, 'versichern', 2);

  if (addressHigh && !vnrHigh) {
    return { path: 'address', confidence: 'high', reason: 'Strong PLZ/address signal in transcript.' };
  }
  if (vnrHigh && !addressHigh) {
    return { path: 'vnr', confidence: 'high', reason: 'Strong VNR/insurance signal in transcript.' };
  }
  if (addressMedium && !vnrMedium) {
    return { path: 'address', confidence: 'medium', reason: 'Short or partial PLZ/address signal (e.g. Post, PLZ).' };
  }
  if (vnrMedium && !addressMedium) {
    return { path: 'vnr', confidence: 'medium', reason: 'Partial insurance/VNR signal in transcript.' };
  }

  return { path: null, confidence: 'low', reason: 'Method choice transcript was ambiguous.' };
}

export function methodChoiceClarificationSay(attemptCount: number): string {
  if (attemptCount >= 3) {
    return 'Bitte sagen Sie klar Versichertennummer oder Postleitzahl.';
  }
  if (attemptCount >= 2) {
    return 'Meinten Sie die Versichertennummer oder die Postleitzahl?';
  }
  return 'Meinten Sie die Versichertennummer oder die Postleitzahl? Bitte antworten Sie mit Versichertennummer oder Postleitzahl.';
}
