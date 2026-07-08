export interface PlzLocality {
  postalCode: string;
  name: string;
  municipalityName: string | null;
  districtName: string | null;
  federalStateName: string | null;
}

export interface PlzOrtLookupConfig {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = 'https://openplzapi.org';

export function normalizePlaceToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeGermanPlz(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 5) return null;
  return digits;
}

export function ortMatchesPlzLocalities(ort: string, localities: PlzLocality[]): boolean {
  const target = normalizePlaceToken(ort);
  if (!target) return false;
  return localities.some((entry) => {
    const candidates = [entry.name, entry.municipalityName, entry.districtName].filter(Boolean) as string[];
    return candidates.some((candidate) => {
      const normalized = normalizePlaceToken(candidate);
      return normalized === target || normalized.includes(target) || target.includes(normalized);
    });
  });
}

export async function lookupPlzLocalities(
  plz: string,
  config?: PlzOrtLookupConfig
): Promise<PlzLocality[]> {
  const fetchFn = config?.fetchFn ?? fetch;
  const timeoutMs = config?.timeoutMs ?? 10_000;
  const baseUrl = (config?.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}/de/Localities?postalCode=${encodeURIComponent(plz)}`;
    const response = await fetchFn(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as Array<{
      postalCode?: string;
      name?: string;
      municipality?: { name?: string };
      district?: { name?: string };
      federalState?: { name?: string };
    }>;
    return payload.map((row) => ({
      postalCode: row.postalCode ?? plz,
      name: row.name ?? '',
      municipalityName: row.municipality?.name ?? null,
      districtName: row.district?.name ?? null,
      federalStateName: row.federalState?.name ?? null,
    }));
  } finally {
    clearTimeout(timer);
  }
}

export function formatPlzOrtMismatchReason(plz: string, ort: string, localities: PlzLocality[]): string {
  const names = [...new Set(localities.map((entry) => entry.name).filter(Boolean))];
  if (names.length === 0) {
    return `PLZ ${plz} is not a known German postal code`;
  }
  return `PLZ ${plz} does not match '${ort}' (expected e.g. ${names.slice(0, 3).join(', ')})`;
}
