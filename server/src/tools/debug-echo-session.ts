export interface DebugEchoSessionInput {
  session_id?: string;
  latest_customer_input?: string;
  plz?: string;
  hnr?: string;
  bday?: string;
}

export interface DebugEchoSessionResult {
  ok: true;
  received_session_id: string | null;
  session_id_received: boolean;
  latest_customer_input: string | null;
  received_fields: Record<string, string | null>;
}

export interface DebugEchoSessionOnlyInput {
  session_id?: string;
}

export interface DebugEchoSessionOnlyResult {
  ok: true;
  received_session_id: string | null;
  session_id_received: boolean;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function coerceDebugEchoSessionInput(input: Record<string, unknown>): DebugEchoSessionInput {
  return {
    session_id: optionalString(input.session_id),
    latest_customer_input: optionalString(input.latest_customer_input),
    plz: optionalString(input.plz),
    hnr: optionalString(input.hnr),
    bday: optionalString(input.bday),
  };
}

/**
 * Clone-only debug helper: echoes what Leaping bound into the MCP tool call.
 * Do not wire into production Marie — use only in Leaping clone Function nodes.
 */
export function coerceDebugEchoSessionOnlyInput(
  input: Record<string, unknown>
): DebugEchoSessionOnlyInput {
  return {
    session_id: optionalString(input.session_id),
  };
}

/**
 * Clone-only session binding smoke test: echoes only session_id.
 * No optional fields — prevents Leaping LLM from hallucinating PLZ/HNR/bday.
 */
export function runDebugEchoSessionOnly(
  input: DebugEchoSessionOnlyInput
): DebugEchoSessionOnlyResult {
  const session_id = input.session_id;

  return {
    ok: true,
    received_session_id: session_id ?? null,
    session_id_received: Boolean(session_id),
  };
}

export function runDebugEchoSession(input: DebugEchoSessionInput): DebugEchoSessionResult {
  const session_id = input.session_id;
  const latest_customer_input = input.latest_customer_input;
  const plz = input.plz;
  const hnr = input.hnr;
  const bday = input.bday;

  return {
    ok: true,
    received_session_id: session_id ?? null,
    session_id_received: Boolean(session_id),
    latest_customer_input: latest_customer_input ?? null,
    received_fields: {
      session_id: session_id ?? null,
      latest_customer_input: latest_customer_input ?? null,
      plz: plz ?? null,
      hnr: hnr ?? null,
      bday: bday ?? null,
    },
  };
}
