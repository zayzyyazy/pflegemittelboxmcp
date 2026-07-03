import { coercePhoneLookupFound } from './lookup-result-sanitize.js';

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function isLeapingNotFoundText(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'boolean') return value === false;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return text === 'not_found' || text === 'false' || text.includes('kein kunde gefunden');
}

export function asCustomerId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || isLeapingNotFoundText(trimmed)) return undefined;
  if (looksLikeCallerPhoneNumber(trimmed)) return undefined;
  return trimmed;
}

/** Dialed caller numbers must not count as CRM customer IDs after a failed lookup. */
export function looksLikeCallerPhoneNumber(value: string): boolean {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = value.trim();
  }
  const compact = decoded.replace(/[\s\-()./]/g, '');
  if (!compact) return false;
  if (/%2b/i.test(value) || compact.startsWith('+') || compact.startsWith('00')) return true;
  if (/^\d{10,15}$/.test(compact)) return true;
  return false;
}

function phoneLookupResultSucceeded(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (isLeapingNotFoundText(value)) return false;
  if (coercePhoneLookupFound(value) === true) return true;
  const text = String(value).trim().toLowerCase();
  return text === 'found' || text === 'success' || text === 'true';
}

/**
 * Infer phone lookup success from fields Leaping binds after get_customer_by_phone.
 */
export function inferPhoneLookupFoundFromLeapingInput(
  input: Record<string, unknown>
): boolean | undefined {
  if (isLeapingNotFoundText(input.get_customer_by_phone_result)) return false;
  if (isLeapingNotFoundText(input.phone_lookup_found)) return false;

  const fromFlag = coercePhoneLookupFound(input.phone_lookup_found);
  if (fromFlag === true) return true;
  if (fromFlag === false) return false;

  if (phoneLookupResultSucceeded(input.get_customer_by_phone_result)) return true;

  const idPhone = asCustomerId(input.id_phone);
  if (idPhone) return true;

  const id = asCustomerId(input.id);
  if (
    id &&
    (input.id_phone !== undefined ||
      input.get_customer_by_phone_result !== undefined ||
      input.phone_lookup_found !== undefined)
  ) {
    return true;
  }

  if (
    id &&
    input.get_customer_by_insurance_number_result === undefined &&
    input.vnr_candidate === undefined &&
    input.vnr_confirmed === undefined
  ) {
    return true;
  }

  return undefined;
}
