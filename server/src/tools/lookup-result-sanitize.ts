export interface CustomerLookupSafeFound {
  found: true;
  id: string;
  birthday_present: boolean;
}

export interface CustomerLookupSafeNotFound {
  found: false;
}

export type CustomerLookupSafeSummary = CustomerLookupSafeFound | CustomerLookupSafeNotFound;
export type LookupResultStorage =
  | 'not_found'
  | 'error'
  | 'not_called'
  | CustomerLookupSafeFound
  | CustomerLookupSafeNotFound;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function extractCustomerIdFromRecord(record: Record<string, unknown>): string | undefined {
  const direct =
    asString(record.id) ??
    asString(record.customer_id) ??
    asString(record.customerId) ??
    asString(record.Kundennummer) ??
    asString(record.kundennummer);
  if (direct) return direct;

  for (const nestedKey of ['data', 'result', 'customer', 'payload']) {
    const nested = record[nestedKey];
    if (isRecord(nested)) {
      const nestedId =
        asString(nested.id) ?? asString(nested.customer_id) ?? asString(nested.customerId);
      if (nestedId) return nestedId;
    }
  }

  return undefined;
}

/** Parse Leaping lookup payloads that may arrive as JSON strings or CRM objects. */
export function normalizeLeapingLookupInput(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return value;
}

export function coercePhoneLookupFound(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'false') return false;
    if (normalized === 'true') return true;
    if (normalized === 'not_found' || normalized.includes('kein kunde gefunden')) return false;
    return true;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return true;
  if (isRecord(value)) {
    const id = value.id ?? value.customer_id;
    if (id !== undefined && id !== null && String(id).trim()) return true;
    return Object.keys(value).length > 0;
  }
  return undefined;
}

export function summarizeLookupStatus(value: unknown): 'found' | 'not_found' | 'error' | 'not_called' | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return undefined;
    if (normalized === 'not_called') return 'not_called';
    if (normalized === 'found') return 'found';
    if (normalized === 'error') return 'error';
    if (normalized === 'not_found' || normalized.includes('kein kunde gefunden')) return 'not_found';
    return 'found';
  }
  if (typeof value === 'boolean') return value ? 'found' : 'not_found';
  if (isRecord(value)) {
    if (value.found === true) return 'found';
    if (value.found === false) return 'not_found';
    const errorValue = asString(value.error) ?? asString(value.message);
    if (errorValue) {
      if (errorValue.toLowerCase().includes('kein kunde gefunden')) return 'not_found';
      return 'error';
    }
    if (extractCustomerIdFromRecord(value)) return 'found';
    return undefined;
  }
  return undefined;
}

export function isLookupFound(value: unknown): boolean {
  return summarizeLookupStatus(value) === 'found';
}

export function isLookupNotFound(value: unknown): boolean {
  return summarizeLookupStatus(value) === 'not_found';
}

function birthdayPresentInRecord(record: Record<string, unknown>): boolean {
  return Boolean(
    asString(record.birthday) ||
      asString(record.birthday_customer) ||
      asString(record.geburtsdatum) ||
      record.birthday_present === true
  );
}

export function toSafeLookupSummary(value: unknown): LookupResultStorage | undefined {
  const status = summarizeLookupStatus(value);
  if (!status || status === 'not_called') return status ?? 'not_called';
  if (status === 'error') return 'error';
  if (status === 'not_found') return 'not_found';

  if (isRecord(value) && value.found === true) {
    return {
      found: true,
      id: asString(value.id) ?? asString(value.customer_id) ?? '',
      birthday_present: birthdayPresentInRecord(value),
    };
  }

  if (isRecord(value)) {
    return {
      found: true,
      id: extractCustomerIdFromRecord(value) ?? '',
      birthday_present: birthdayPresentInRecord(value),
    };
  }

  return { found: true, id: '', birthday_present: false };
}

export function toSafeLookupSummaryForDisplay(value: unknown): CustomerLookupSafeSummary | string {
  const stored = toSafeLookupSummary(value);
  if (stored === 'not_found' || stored === 'error' || stored === 'not_called') return stored;
  if (stored && typeof stored === 'object') return stored;
  return 'not_called';
}
