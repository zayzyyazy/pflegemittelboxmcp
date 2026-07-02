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
  return trimmed;
}

/** 32-char hex — often leaping_conversation_id_hex or call id wrongly bound as id_phone. */
export function looksLikeLeapingConversationHex(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

/**
 * id_phone is only a reliable customer id when numeric (e.g. 107484).
 * Leaping field extractions sometimes bind id_phone → $.id from the call object (same as session).
 */
export function isReliablePhoneCustomerId(value: string, sessionId?: string): boolean {
  if (sessionId && value === sessionId) return false;
  if (looksLikeLeapingConversationHex(value)) return false;
  return /^\d{1,12}$/.test(value);
}

function phoneLookupResultIndicatesFound(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (isLeapingNotFoundText(value)) return false;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('id' in record || 'customer_id' in record) return true;
    return false;
  }
  const coerced = coercePhoneLookupFound(value);
  if (coerced === true) return true;
  const text = String(value).trim().toLowerCase();
  if (text === 'found' || text === 'true') return true;
  const asId = asCustomerId(value);
  return Boolean(asId && isReliablePhoneCustomerId(asId));
}

/**
 * Infer phone lookup success from fields Leaping binds after get_customer_by_phone.
 *
 * Prefer explicit phone_lookup_found or get_customer_by_phone_result.
 * Do NOT treat id_phone alone as phone-found when it looks like a call/conversation id.
 */
export function inferPhoneLookupFoundFromLeapingInput(
  input: Record<string, unknown>
): boolean | undefined {
  if (isLeapingNotFoundText(input.get_customer_by_phone_result)) return false;
  if (isLeapingNotFoundText(input.phone_lookup_found)) return false;

  const fromFlag = coercePhoneLookupFound(input.phone_lookup_found);
  if (fromFlag === true) return true;
  if (fromFlag === false) return false;

  if (phoneLookupResultIndicatesFound(input.get_customer_by_phone_result)) {
    return true;
  }

  const sessionId = asString(input.session_id);
  const idPhone = asCustomerId(input.id_phone);
  if (idPhone && isReliablePhoneCustomerId(idPhone, sessionId)) {
    return true;
  }

  const id = asCustomerId(input.id);
  if (
    id &&
    isReliablePhoneCustomerId(id, sessionId) &&
    input.get_customer_by_phone_result !== undefined &&
    phoneLookupResultIndicatesFound(input.get_customer_by_phone_result)
  ) {
    return true;
  }

  return undefined;
}
