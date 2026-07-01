import type { VerificationBrainSplitResponse } from './verification-brain-response.js';

const INPUT_RESULT_FIELDS = [
  'get_customer_by_plz_geb_result',
  'get_customer_by_insurance_number_result',
  'check_birthday_result',
  'check_insurance_number_format_result',
] as const;

const STORED_LOOKUP_FIELDS = [
  'get_customer_by_plz_geb_result',
  'get_customer_by_insurance_number_result',
  'check_insurance_number_format_result',
  'check_birthday_result',
] as const;

const CRM_OBJECT_KEYS = new Set([
  'id',
  'customer_id',
  'mail',
  'email',
  'phone',
  'phone_number',
  'name',
  'first_name',
  'last_name',
  'address',
  'street',
  'stadt',
  'city',
  'vorname',
  'nachname',
]);

export type LookupSummary = 'found' | 'not_found' | 'error' | 'not_called';
export type BirthdayCheckSummary = 'success' | 'failed' | 'error' | 'not_called';
export type FormatCheckSummary = 'valid' | 'invalid' | 'error' | 'not_called';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVerificationBrainSplitResponse(value: unknown): value is VerificationBrainSplitResponse {
  if (!isRecord(value)) return false;
  const controller = value.controller;
  const debug = value.debug;
  if (!isRecord(controller) || !isRecord(debug)) return false;

  return (
    typeof controller.ok === 'boolean' &&
    typeof controller.action_type === 'string' &&
    typeof controller.say === 'string' &&
    typeof controller.requires_followup_mcp_call === 'boolean' &&
    typeof controller.active_brain === 'string' &&
    typeof debug.method === 'string' &&
    typeof debug.next_action === 'string' &&
    typeof debug.reason === 'string' &&
    Array.isArray(debug.missing_fields) &&
    Array.isArray(debug.safety_flags)
  );
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function summarizeLookupResult(value: unknown): LookupSummary | undefined {
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
    const errorValue = asString(value.error) ?? asString(value.message);
    if (errorValue) {
      if (errorValue.toLowerCase().includes('kein kunde gefunden')) return 'not_found';
      return 'error';
    }
    if ('id' in value || 'customer_id' in value) return 'found';
    return 'error';
  }
  return undefined;
}

export function summarizeCheckBirthdayResult(value: unknown): BirthdayCheckSummary | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'success' || value === 'failed' || value === 'error' || value === 'not_called') return value;
  if (typeof value === 'boolean') return value ? 'success' : 'failed';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return 'success';
    if (normalized === 'false') return 'failed';
  }
  return undefined;
}

export function summarizeFormatResult(value: unknown): FormatCheckSummary | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'valid' || value === 'invalid' || value === 'error' || value === 'not_called') return value;
  if (typeof value === 'boolean') return value ? 'valid' : 'invalid';
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'valid' || normalized === 'valid!') return 'valid';
    if (normalized === 'false' || normalized === 'invalid') return 'invalid';
  }
  return undefined;
}

function summarizeInputResultField(key: string, value: unknown): unknown {
  if (key === 'get_customer_by_plz_geb_result' || key === 'get_customer_by_insurance_number_result') {
    return summarizeLookupResult(value) ?? value;
  }
  if (key === 'check_birthday_result') {
    return summarizeCheckBirthdayResult(value) ?? value;
  }
  if (key === 'check_insurance_number_format_result') {
    return summarizeFormatResult(value) ?? value;
  }
  return value;
}

function containsCrmPayload(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.keys(value).some((key) => CRM_OBJECT_KEYS.has(key));
}

export function sanitizeVerificationBrainInput(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (INPUT_RESULT_FIELDS.includes(key as (typeof INPUT_RESULT_FIELDS)[number])) {
      sanitized[key] = summarizeInputResultField(key, value);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

function sanitizeStoredValues(storedValues: unknown): unknown {
  if (!isRecord(storedValues)) return storedValues;
  const sanitized: Record<string, unknown> = { ...storedValues };
  for (const key of STORED_LOOKUP_FIELDS) {
    if (key in sanitized) {
      if (key === 'check_birthday_result') {
        sanitized[key] = summarizeCheckBirthdayResult(sanitized[key]) ?? sanitized[key];
      } else if (key === 'check_insurance_number_format_result') {
        sanitized[key] = summarizeFormatResult(sanitized[key]) ?? sanitized[key];
      } else {
        sanitized[key] = summarizeLookupResult(sanitized[key]) ?? sanitized[key];
      }
    }
  }
  return sanitized;
}

export function sanitizeVerificationBrainSplitResponse(
  response: VerificationBrainSplitResponse
): VerificationBrainSplitResponse {
  return {
    controller: { ...response.controller },
    debug: {
      ...response.debug,
      stored_values: response.debug.stored_values
        ? (sanitizeStoredValues(response.debug.stored_values) as VerificationBrainSplitResponse['debug']['stored_values'])
        : response.debug.stored_values,
    },
  };
}

export function sanitizeMcpToolInput(toolName: string, input: unknown): unknown {
  if (
    toolName === 'pmb_verification_phone_brain' ||
    toolName === 'pmb_verification_address_brain' ||
    toolName === 'pmb_verification_vnr_brain'
  ) {
    return sanitizeVerificationBrainInput(input);
  }
  return input;
}

export function sanitizeMcpToolOutput(toolName: string, output: unknown): unknown {
  if (output === null || output === undefined) return output;

  if (
    toolName === 'pmb_verification_phone_brain' ||
    toolName === 'pmb_verification_address_brain' ||
    toolName === 'pmb_verification_vnr_brain'
  ) {
    if (isVerificationBrainSplitResponse(output)) {
      return sanitizeVerificationBrainSplitResponse(output);
    }
    return output;
  }

  if (containsCrmPayload(output)) {
    return '[redacted: customer record payload]';
  }

  return output;
}

export interface McpCallLogMeta {
  session_id: string | null;
  active_brain: string | null;
  action_type: string | null;
  function_name: string | null;
  transition_name: string | null;
  status: 'ok' | 'error';
}

function readController(output: unknown): Record<string, unknown> | null {
  if (!isRecord(output)) return null;
  if ('controller' in output && isRecord(output.controller)) return output.controller;
  if ('action_type' in output) return output;
  return null;
}

export function extractMcpCallLogMeta(
  toolName: string,
  input: unknown,
  output: unknown,
  error: string | null
): McpCallLogMeta {
  const meta: McpCallLogMeta = {
    session_id: null,
    active_brain: null,
    action_type: null,
    function_name: null,
    transition_name: null,
    status: error ? 'error' : 'ok',
  };

  if (isRecord(input) && typeof input.session_id === 'string' && input.session_id.trim()) {
    meta.session_id = input.session_id.trim();
  }

  const controller = readController(output);
  if (controller) {
    if (typeof controller.active_brain === 'string') meta.active_brain = controller.active_brain;
    if (typeof controller.action_type === 'string') meta.action_type = controller.action_type;
    if (typeof controller.function_name === 'string') meta.function_name = controller.function_name;
    if (controller.function_name === null) meta.function_name = null;
    if (typeof controller.transition_name === 'string') meta.transition_name = controller.transition_name;
    if (controller.transition_name === null) meta.transition_name = null;
  }

  if (
    !meta.session_id &&
    isRecord(output) &&
    isRecord(output.debug) &&
    typeof output.debug.session_id === 'string'
  ) {
    meta.session_id = output.debug.session_id;
  }

  return meta;
}

export function outputContainsRawCustomerRecord(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => outputContainsRawCustomerRecord(entry, depth + 1));
  }
  if (!isRecord(value)) return false;

  const hasCrmId = ('id' in value || 'customer_id' in value) && ('mail' in value || 'birthday' in value || 'phone' in value);
  if (hasCrmId) return true;

  return Object.values(value).some((nested) => outputContainsRawCustomerRecord(nested, depth + 1));
}
