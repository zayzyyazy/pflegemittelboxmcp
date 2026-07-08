import { appConfig } from '../config.js';
import { geocodeStreetAddress } from './address-geocoder.js';
import type { AddressGeocoderConfig } from './address-geocoder.js';
import {
  formatPlzOrtMismatchReason,
  lookupPlzLocalities,
  normalizeGermanPlz,
  ortMatchesPlzLocalities,
} from './german-plz-ort.js';
import type { PlzOrtLookupConfig } from './german-plz-ort.js';

export type TicketAddressStatus = 'SAFE' | 'NOT_SAFE';

export interface TicketAddressVerifyInput {
  plz: string;
  ort: string;
  street: string;
}

export interface TicketAddressVerifyResult {
  ok: boolean;
  status: TicketAddressStatus;
  reason: string | null;
  checks: {
    plz_ort: 'pass' | 'fail' | 'error';
    street: 'pass' | 'fail' | 'skipped' | 'error';
  };
  geocoder_provider?: string;
}

export interface TicketAddressVerifyDeps {
  plzLookupConfig?: PlzOrtLookupConfig;
  geocoderConfig?: AddressGeocoderConfig;
  lookupPlz?: typeof lookupPlzLocalities;
  geocodeStreet?: typeof geocodeStreetAddress;
}

function trimField(value: string): string {
  return value.trim();
}

export function coerceTicketAddressVerifyInput(input: Record<string, unknown>): TicketAddressVerifyInput {
  const plz = typeof input.plz === 'string' ? trimField(input.plz) : '';
  const ort = typeof input.ort === 'string' ? trimField(input.ort) : '';
  const street = typeof input.street === 'string' ? trimField(input.street) : '';
  if (!plz) throw new Error('"plz" (string) is required');
  if (!ort) throw new Error('"ort" (string) is required');
  if (!street) throw new Error('"street" (string) is required');
  return { plz, ort, street };
}

function resolveDeps(deps?: TicketAddressVerifyDeps) {
  const provider = appConfig.ADDRESS_GEOCODER_PROVIDER ?? 'nominatim';
  return {
    lookupPlz: deps?.lookupPlz ?? lookupPlzLocalities,
    geocodeStreet: deps?.geocodeStreet ?? geocodeStreetAddress,
    plzLookupConfig: deps?.plzLookupConfig ?? { baseUrl: appConfig.OPENPLZ_API_BASE },
    geocoderConfig:
      deps?.geocoderConfig ??
      ({
        provider,
        googleApiKey: appConfig.GOOGLE_GEOCODING_API_KEY,
        userAgent: appConfig.NOMINATIM_USER_AGENT,
      } satisfies AddressGeocoderConfig),
  };
}

export async function runTicketAddressVerify(
  input: TicketAddressVerifyInput,
  deps?: TicketAddressVerifyDeps
): Promise<TicketAddressVerifyResult> {
  const resolved = resolveDeps(deps);
  const plz = normalizeGermanPlz(input.plz);
  const ort = trimField(input.ort);
  const street = trimField(input.street);

  if (!plz) {
    return {
      ok: true,
      status: 'NOT_SAFE',
      reason: `PLZ '${input.plz}' is not a valid 5-digit German postal code`,
      checks: { plz_ort: 'fail', street: 'skipped' },
    };
  }

  let localities;
  try {
    localities = await resolved.lookupPlz(plz, resolved.plzLookupConfig);
  } catch {
    return {
      ok: false,
      status: 'NOT_SAFE',
      reason: 'PLZ/Ort reference lookup failed',
      checks: { plz_ort: 'error', street: 'skipped' },
    };
  }

  if (!localities.length || !ortMatchesPlzLocalities(ort, localities)) {
    return {
      ok: true,
      status: 'NOT_SAFE',
      reason: formatPlzOrtMismatchReason(plz, ort, localities),
      checks: { plz_ort: 'fail', street: 'skipped' },
    };
  }

  let geocoded;
  try {
    geocoded = await resolved.geocodeStreet(
      { plz, ort, street },
      resolved.geocoderConfig
    );
  } catch {
    return {
      ok: false,
      status: 'NOT_SAFE',
      reason: 'Street validation lookup failed',
      checks: { plz_ort: 'pass', street: 'error' },
      geocoder_provider: resolved.geocoderConfig.provider,
    };
  }

  if (!geocoded.found || !geocoded.confident) {
    return {
      ok: true,
      status: 'NOT_SAFE',
      reason: geocoded.reason ?? `Street '${street}' not found in PLZ ${plz}`,
      checks: { plz_ort: 'pass', street: 'fail' },
      geocoder_provider: geocoded.provider,
    };
  }

  return {
    ok: true,
    status: 'SAFE',
    reason: null,
    checks: { plz_ort: 'pass', street: 'pass' },
    geocoder_provider: geocoded.provider,
  };
}
