import {
  coercePhoneLookupFound,
  isLookupFound,
  summarizeLookupStatus,
} from './lookup-result-sanitize.js';

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

export function hasBirthdaySystemSignal(input: Record<string, unknown>): boolean {
  if (input.birthday_system_available === true) return true;
  const birthdaySystem = input.birthday_system;
  if (birthdaySystem === undefined || birthdaySystem === null) return false;
  if (typeof birthdaySystem === 'boolean') return birthdaySystem;
  if (typeof birthdaySystem === 'string') {
    const trimmed = birthdaySystem.trim();
    return trimmed.length > 0 && !isLeapingNotFoundText(trimmed);
  }
  return true;
}

/**
 * Infer phone lookup success from fields Leaping actually binds after get_customer_by_phone.
 */
export function inferPhoneLookupFoundFromLeapingInput(
  input: Record<string, unknown>
): boolean | undefined {
  if (isLeapingNotFoundText(input.get_customer_by_phone_result)) return false;
  if (isLeapingNotFoundText(input.phone_lookup_found)) return false;

  const phoneResultStatus = summarizeLookupStatus(input.get_customer_by_phone_result);
  if (phoneResultStatus === 'not_found') return false;
  if (phoneResultStatus === 'found') return true;

  const fromFlag = coercePhoneLookupFound(input.phone_lookup_found);
  if (fromFlag === true) return true;
  if (fromFlag === false) return false;

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

  // At router time, a populated customer id without VNR lookup context means phone lookup succeeded.
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

export interface VnrLookupInferenceContext {
  vnr_confirmed?: boolean | null;
  vnr_awaiting_insurance_lookup_result?: boolean;
  existing_lookup_result?: unknown;
}

/**
 * Infer VNR insurance lookup result when Leaping binds id / birthday_system instead of the native result field.
 */
export function inferVnrInsuranceLookupResult(
  input: Record<string, unknown>,
  context: VnrLookupInferenceContext
): unknown | undefined {
  if (input.get_customer_by_insurance_number_result !== undefined) {
    return input.get_customer_by_insurance_number_result;
  }

  const awaiting = context.vnr_awaiting_insurance_lookup_result === true;
  const alreadyFound = isLookupFound(context.existing_lookup_result);

  if (!awaiting && !alreadyFound) {
    return undefined;
  }

  const id = asCustomerId(input.id) ?? asCustomerId(input.customer_id);
  const hasBirthdaySystem = hasBirthdaySystemSignal(input);

  if (id) {
    return {
      found: true,
      id,
      birthday_present: hasBirthdaySystem,
    };
  }

  if (hasBirthdaySystem) {
    return {
      found: true,
      id: '',
      birthday_present: true,
    };
  }

  return undefined;
}

export function leapingVnrLookupFieldsPresent(input: Record<string, unknown>): boolean {
  return (
    input.get_customer_by_insurance_number_result !== undefined ||
    asCustomerId(input.id) !== undefined ||
    asCustomerId(input.customer_id) !== undefined ||
    hasBirthdaySystemSignal(input)
  );
}
