/**
 * Leaping + Marie DKN context (from .codex/skills/leaping-marie).
 * Used for ownership tagging and compact issue text — not full skill dump.
 */

export type IssueOwner = "marie" | "leaping" | "mcp" | "mixed";

export const MARIE_NATIVE_TOOLS = new Set([
  "get_customer_by_phone",
  "check_insurance_number_format",
  "get_customer_by_insurance_number",
  "get_customer_by_plz_geb",
  "check_birthday",
  "get_now",
]);

export const MCP_BRAIN_TOOLS = new Set([
  "pmb_verification_method_router",
  "pmb_verification_phone_brain",
  "pmb_verification_address_brain",
  "pmb_verification_vnr_brain",
  "pmb_debug_echo_session_only",
]);

export const LEAPING_KEY_FIELDS = [
  "intent",
  "phone_lookup_found",
  "birthday_system",
  "active_brain",
  "verification_successful",
  "leaping_conversation_usecase_successful",
  "leaping_conversation_completed",
] as const;

export interface LeapingCallContext {
  intent?: string;
  mcp_brains: string[];
  native_tools: string[];
  stages: string[];
  utterances: string[];
  /** Short timeline for LLM / report — no JSON dump */
  compact_timeline: string;
}

export function isMcpBrain(name: string): boolean {
  return name.startsWith("pmb_verification_") || name.startsWith("pmb_debug_");
}

export function isMarieNative(name: string): boolean {
  return MARIE_NATIVE_TOOLS.has(name);
}

export function ownerLabel(owner: IssueOwner): string {
  return { marie: "Marie", leaping: "Leaping", mcp: "MCP", mixed: "Marie+Leaping" }[owner];
}

/** One-line fixes — no essay */
export const FIX = {
  empty_say_filler: "Kundenident-Prompt: say leer → Stille, kein Fülltext",
  birthday_binding: "birthday_system vor check_birthday binden (nach get_customer_by_phone)",
  phone_lookup: "phone_lookup_found nur aus get_customer_by_phone, nicht Caller-ID",
  vnr_stt: "VNR-STT / getrennte Äußerungen → Brain nach jedem Satz",
  marie_improv: "Nur MCP say — keine Rückfragen erfinden",
  transfer_ok: "Transfer OK — Verifikationsschleife verkürzen",
  transfer_missing: "Call-Transfer-Node / Junction prüfen",
  dropped_short: "Kurz abgebrochen — oft Rufnummer/Voicemail",
} as const;

export const LEAPING_LLM_BRIEF = `Marie clone = Leaping Function nodes für MCP brains + Kundenident Dialogue als Executor.
Ownership: Marie = spricht außerhalb MCP say / natives ohne Erlaubnis. Leaping = Feldbindings, stages. MCP = Router/Brain-Logik.
Leaping transcript = Event-Array (function, transition, field_update, speech). summary = Leaping End-Node Zusammenfassung.`;
