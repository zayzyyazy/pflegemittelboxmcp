function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse Leaping phone_lookup_found when bound as boolean, id string, or CRM object. */
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
