import {
  getCustomerByInsuranceNumber,
  getCustomerByPlzGeb,
  resolveMarieCrmClientConfig,
  type CrmFetchFn,
  type MarieCrmClientConfig,
} from '../crm-client.js';
import {
  toSafeLookupSummary,
  type CustomerLookupSafeSummary,
} from './lookup-result-sanitize.js';

export const PMB_SAFE_GET_CUSTOMER_BY_PLZ_GEB = 'pmb_safe_get_customer_by_plz_geb';
export const PMB_SAFE_GET_CUSTOMER_BY_INSURANCE_NUMBER = 'pmb_safe_get_customer_by_insurance_number';

export interface SafePlzGebLookupInput {
  plz: string;
  hnr?: string;
  house_number?: string;
  bday?: string;
  birthday?: string;
}

export interface SafeInsuranceLookupInput {
  insurance_number: string;
}

/** Leaping-visible lookup response: only found/id/birthday_present or found:false. */
export function toPublicSafeLookupResponse(value: unknown): CustomerLookupSafeSummary {
  const stored = toSafeLookupSummary(value);
  if (stored === 'not_found' || stored === 'error' || stored === 'not_called') {
    return { found: false };
  }
  if (stored && typeof stored === 'object' && stored.found === true) {
    return {
      found: true,
      id: stored.id,
      birthday_present: stored.birthday_present,
    };
  }
  if (stored && typeof stored === 'object' && stored.found === false) {
    return { found: false };
  }
  return { found: false };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new Error(`"${field}" (string) is required`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`"${field}" (non-empty string) is required`);
  }
  return trimmed;
}

export function coerceSafePlzGebLookupInput(input: Record<string, unknown>): SafePlzGebLookupInput {
  const plz = requireString(input.plz, 'plz');
  const house_number = requireString(input.house_number ?? input.hnr, 'house_number');
  const birthday = requireString(input.birthday ?? input.bday, 'birthday');
  return { plz, house_number, birthday };
}

export function coerceSafeInsuranceLookupInput(input: Record<string, unknown>): SafeInsuranceLookupInput {
  return { insurance_number: requireString(input.insurance_number, 'insurance_number') };
}

function requireMarieCrmConfig(configOverride?: MarieCrmClientConfig): MarieCrmClientConfig {
  const config = configOverride ?? resolveMarieCrmClientConfig();
  if (!config) {
    throw new Error(
      'Marie CRM proxy is not configured. Set LEAPING_FUNC_BASE and LEAPING_FUNC_TOKEN on the MCP server.'
    );
  }
  return config;
}

export async function runSafeGetCustomerByPlzGeb(
  input: SafePlzGebLookupInput,
  fetchFn?: CrmFetchFn,
  configOverride?: MarieCrmClientConfig
): Promise<CustomerLookupSafeSummary> {
  const config = requireMarieCrmConfig(configOverride);
  const raw = await getCustomerByPlzGeb(
    {
      plz: input.plz,
      house_number: input.house_number ?? input.hnr ?? '',
      birthday: input.birthday ?? input.bday ?? '',
    },
    config,
    fetchFn
  );
  return toPublicSafeLookupResponse(raw);
}

export async function runSafeGetCustomerByInsuranceNumber(
  input: SafeInsuranceLookupInput,
  fetchFn?: CrmFetchFn,
  configOverride?: MarieCrmClientConfig
): Promise<CustomerLookupSafeSummary> {
  const config = requireMarieCrmConfig(configOverride);
  const raw = await getCustomerByInsuranceNumber(input.insurance_number, config, fetchFn);
  return toPublicSafeLookupResponse(raw);
}
