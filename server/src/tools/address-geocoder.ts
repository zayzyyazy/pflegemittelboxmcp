import { normalizePlaceToken } from './german-plz-ort.js';

export type AddressGeocoderProvider = 'nominatim' | 'google';

export interface StreetGeocodeInput {
  plz: string;
  ort: string;
  street: string;
}

export interface StreetGeocodeResult {
  found: boolean;
  confident: boolean;
  reason: string | null;
  provider: AddressGeocoderProvider;
  matched_display_name: string | null;
}

export interface AddressGeocoderConfig {
  provider?: AddressGeocoderProvider;
  googleApiKey?: string;
  userAgent?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

function splitStreetAndHouseNumber(street: string): { road: string; houseNumber: string | null } {
  const trimmed = street.trim();
  const match = trimmed.match(/^(.+?)\s+(\d+\s*[a-zA-Z]?)$/);
  if (!match) return { road: trimmed, houseNumber: null };
  return { road: match[1].trim(), houseNumber: match[2].trim() };
}

function tokenizeRoad(value: string): string {
  return normalizePlaceToken(
    value
      .replace(/\bstr\.?\b/gi, 'strasse')
      .replace(/\bstrasse\b/gi, 'strasse')
  );
}

function addressFieldsMatch(
  input: StreetGeocodeInput,
  address: Record<string, string | undefined>
): boolean {
  const resultPlz = (address.postcode ?? '').replace(/\D/g, '');
  if (resultPlz && resultPlz !== input.plz) return false;

  const ortTokens = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.hamlet,
  ]
    .filter(Boolean)
    .map((value) => normalizePlaceToken(value as string));

  const targetOrt = normalizePlaceToken(input.ort);
  if (targetOrt && ortTokens.length > 0 && !ortTokens.some((token) => token.includes(targetOrt) || targetOrt.includes(token))) {
    return false;
  }

  const { road } = splitStreetAndHouseNumber(input.street);
  const targetRoad = tokenizeRoad(road);
  const resultRoad = tokenizeRoad(address.road ?? address.pedestrian ?? address.footway ?? '');
  if (targetRoad && resultRoad && !resultRoad.includes(targetRoad) && !targetRoad.includes(resultRoad)) {
    return false;
  }

  return true;
}

function isConfidentNominatimHit(payload: Record<string, unknown>): boolean {
  const placeRank = typeof payload.place_rank === 'number' ? payload.place_rank : 0;
  const addressType = typeof payload.addresstype === 'string' ? payload.addresstype : '';
  const type = typeof payload.type === 'string' ? payload.type : '';
  const cls = typeof payload.class === 'string' ? payload.class : '';

  if (cls === 'building' || type === 'house' || addressType === 'building' || addressType === 'house') {
    return placeRank >= 28;
  }
  if (cls === 'highway' && (type === 'residential' || type === 'living_street')) {
    return false;
  }
  if (placeRank >= 26 && (addressType === 'road' || type === 'residential')) {
    return false;
  }
  return placeRank >= 28;
}

async function geocodeWithNominatim(
  input: StreetGeocodeInput,
  config: AddressGeocoderConfig
): Promise<StreetGeocodeResult> {
  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? 12_000;
  const userAgent = config.userAgent ?? 'PflegemittelboxMCP/0.1 (ticket-address-verify)';
  const { road, houseNumber } = splitStreetAndHouseNumber(input.street);

  const attempts: Array<Record<string, string>> = [
    {
      street: input.street,
      postalcode: input.plz,
      city: input.ort,
      country: 'Germany',
      format: 'json',
      addressdetails: '1',
      limit: '1',
    },
    {
      q: `${input.street}, ${input.plz} ${input.ort}, Germany`,
      format: 'json',
      addressdetails: '1',
      limit: '1',
    },
    {
      street: houseNumber ? `${road} ${houseNumber}` : road,
      postalcode: input.plz,
      city: input.ort,
      country: 'Germany',
      format: 'json',
      addressdetails: '1',
      limit: '1',
    },
  ];

  for (const params of attempts) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchFn(url.toString(), {
        method: 'GET',
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const rows = (await response.json()) as Array<Record<string, unknown>>;
      const hit = rows[0];
      if (!hit) continue;

      const address = (hit.address ?? {}) as Record<string, string | undefined>;
      if (!addressFieldsMatch(input, address)) {
        return {
          found: true,
          confident: false,
          reason: `Street '${input.street}' not found in PLZ ${input.plz}`,
          provider: 'nominatim',
          matched_display_name: typeof hit.display_name === 'string' ? hit.display_name : null,
        };
      }

      const confident = isConfidentNominatimHit(hit);
      return {
        found: true,
        confident,
        reason: confident ? null : `Street '${input.street}' could not be confirmed with high confidence`,
        provider: 'nominatim',
        matched_display_name: typeof hit.display_name === 'string' ? hit.display_name : null,
      };
    } catch {
      // try next query shape
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    found: false,
    confident: false,
    reason: `Street '${input.street}' not found in PLZ ${input.plz}`,
    provider: 'nominatim',
    matched_display_name: null,
  };
}

async function geocodeWithGoogle(
  input: StreetGeocodeInput,
  config: AddressGeocoderConfig
): Promise<StreetGeocodeResult> {
  const apiKey = config.googleApiKey?.trim();
  if (!apiKey) {
    return {
      found: false,
      confident: false,
      reason: 'Google geocoder is not configured',
      provider: 'google',
      matched_display_name: null,
    };
  }

  const fetchFn = config.fetchFn ?? fetch;
  const timeoutMs = config.timeoutMs ?? 12_000;
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', `${input.street}, ${input.plz} ${input.ort}, Germany`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('region', 'de');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url.toString(), { signal: controller.signal });
    if (!response.ok) {
      return {
        found: false,
        confident: false,
        reason: 'Google geocoder request failed',
        provider: 'google',
        matched_display_name: null,
      };
    }
    const payload = (await response.json()) as {
      status?: string;
      results?: Array<{
        formatted_address?: string;
        partial_match?: boolean;
        types?: string[];
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      }>;
    };

    if (payload.status !== 'OK' || !payload.results?.length) {
      return {
        found: false,
        confident: false,
        reason: `Street '${input.street}' not found in PLZ ${input.plz}`,
        provider: 'google',
        matched_display_name: null,
      };
    }

    const hit = payload.results[0];
    if (hit.partial_match) {
      return {
        found: true,
        confident: false,
        reason: `Street '${input.street}' only partially matched by Google geocoder`,
        provider: 'google',
        matched_display_name: hit.formatted_address ?? null,
      };
    }

    const types = hit.types ?? [];
    const streetLevel = types.includes('street_address') || types.includes('premise') || types.includes('subpremise');
    if (!streetLevel) {
      return {
        found: true,
        confident: false,
        reason: `Street '${input.street}' could not be confirmed with high confidence`,
        provider: 'google',
        matched_display_name: hit.formatted_address ?? null,
      };
    }

    return {
      found: true,
      confident: true,
      reason: null,
      provider: 'google',
      matched_display_name: hit.formatted_address ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeStreetAddress(
  input: StreetGeocodeInput,
  config?: AddressGeocoderConfig
): Promise<StreetGeocodeResult> {
  const provider = config?.provider ?? 'nominatim';
  if (provider === 'google') {
    return geocodeWithGoogle(input, config ?? {});
  }
  return geocodeWithNominatim(input, config ?? {});
}
