import { inferPhoneLookupFoundFromLeapingInput } from './leaping-field-bindings.js';
import { loadVerificationSessionState } from './verification-method-brains.js';

export interface DebugEchoSessionInput {
  session_id?: string;
  latest_customer_input?: string;
  plz?: string;
  hnr?: string;
  bday?: string;
  id_phone?: string;
  phone_lookup_found?: string | boolean;
}

export interface DebugEchoSessionResult {
  ok: true;
  received_session_id: string | null;
  session_id_received: boolean;
  session_mode: 'session' | 'stateless';
  latest_customer_input: string | null;
  inferred_phone_lookup_found: boolean | null;
  received_fields: Record<string, string | null>;
}

export interface DebugEchoSessionOnlyInput {
  session_id?: string;
  id_phone?: string;
  phone_lookup_found?: string | boolean;
}

export interface DebugEchoSessionOnlyResult {
  ok: true;
  received_session_id: string | null;
  session_id_received: boolean;
  session_mode: 'session' | 'stateless';
  inferred_phone_lookup_found: boolean | null;
  received_fields: Record<string, string | null>;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalFieldString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const trimmed = String(value).trim();
  return trimmed || null;
}

export function coerceDebugEchoSessionInput(input: Record<string, unknown>): DebugEchoSessionInput {
  return {
    session_id: optionalString(input.session_id),
    latest_customer_input: optionalString(input.latest_customer_input),
    plz: optionalString(input.plz),
    hnr: optionalString(input.hnr),
    bday: optionalString(input.bday),
    id_phone: optionalString(input.id_phone),
    phone_lookup_found:
      typeof input.phone_lookup_found === 'boolean'
        ? input.phone_lookup_found
        : optionalString(input.phone_lookup_found),
  };
}

export function coerceDebugEchoSessionOnlyInput(
  input: Record<string, unknown>
): DebugEchoSessionOnlyInput {
  return {
    session_id: optionalString(input.session_id),
    id_phone: optionalString(input.id_phone),
    phone_lookup_found:
      typeof input.phone_lookup_found === 'boolean'
        ? input.phone_lookup_found
        : optionalString(input.phone_lookup_found),
  };
}

function buildEchoResult(
  input: Record<string, unknown>,
  session_id: string | undefined
): {
  session_mode: 'session' | 'stateless';
  inferred_phone_lookup_found: boolean | null;
  received_fields: Record<string, string | null>;
} {
  const session = loadVerificationSessionState(session_id);
  const inferred = inferPhoneLookupFoundFromLeapingInput(input);
  return {
    session_mode: session_id && session ? 'session' : 'stateless',
    inferred_phone_lookup_found: inferred ?? null,
    received_fields: {
      session_id: session_id ?? null,
      id_phone: optionalFieldString(input.id_phone),
      phone_lookup_found: optionalFieldString(input.phone_lookup_found),
      latest_customer_input: optionalFieldString(input.latest_customer_input),
      plz: optionalFieldString(input.plz),
      hnr: optionalFieldString(input.hnr),
      bday: optionalFieldString(input.bday),
    },
  };
}

export function runDebugEchoSessionOnly(
  input: DebugEchoSessionOnlyInput
): DebugEchoSessionOnlyResult {
  const session_id = input.session_id;
  const echo = buildEchoResult(
    {
      session_id,
      id_phone: input.id_phone,
      phone_lookup_found: input.phone_lookup_found,
    },
    session_id
  );

  return {
    ok: true,
    received_session_id: session_id ?? null,
    session_id_received: Boolean(session_id),
    session_mode: echo.session_mode,
    inferred_phone_lookup_found: echo.inferred_phone_lookup_found,
    received_fields: echo.received_fields,
  };
}

export function runDebugEchoSession(input: DebugEchoSessionInput): DebugEchoSessionResult {
  const session_id = input.session_id;
  const echo = buildEchoResult(input as Record<string, unknown>, session_id);

  return {
    ok: true,
    received_session_id: session_id ?? null,
    session_id_received: Boolean(session_id),
    session_mode: echo.session_mode,
    latest_customer_input: input.latest_customer_input ?? null,
    inferred_phone_lookup_found: echo.inferred_phone_lookup_found,
    received_fields: echo.received_fields,
  };
}
