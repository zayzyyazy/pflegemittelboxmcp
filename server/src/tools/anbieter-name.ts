const LEGAL_SUFFIXES =
  /\b(gmbh|gbr|ag|kg|ohg|ug|e\.?\s*k\.?|mbh|inc|ltd|co\.?\s*kg)\b/gi;

/** Normalize Anbieter name for cache lookup (trim, lowercase, strip legal forms). */
export function normalizeAnbieterName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[.,/\\()'"&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i += 1) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/** Trigram similarity in [0, 1]. */
export function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const gram of ta) {
    if (tb.has(gram)) intersection += 1;
  }
  return (2 * intersection) / (ta.size + tb.size);
}

export const FUZZY_MATCH_THRESHOLD = 0.55;
