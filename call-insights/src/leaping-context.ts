/**
 * Live production Marie agent (Leaping Dialogue + native HTTP functions).
 * MCP clone tools (pmb_verification_*) are detected per-call but NOT expected on live.
 * Source: server/src/routes/api.ts, dashboard-api.ts
 */

export type IssueOwner = "marie" | "leaping" | "mcp" | "mixed";
export type VerificationPath = "phone" | "vnr" | "address" | "unknown";
export type MarieToolKind = "verification" | "utility" | "mcp" | "other";

/** Live Marie verification natives — production agent */
export const LIVE_VERIFICATION_TOOLS = new Set([
  "recognize_customer_by_phone",
  "clean_phone_number",
  "check_insurance_number_format",
  "get_customer_by_insurance_number",
  "get_customer_by_plz_geb",
  "check_birthday",
]);

/** Legacy alias still seen in older Leaping configs */
export const LEGACY_PHONE_TOOLS = new Set(["get_customer_by_phone"]);

/** Leaping template / misc — not verification logic */
export const UTILITY_TOOLS = new Set(["get_now", "get_status"]);

export const LIVE_KEY_FIELDS = [
  "intent",
  "birthday_system",
  "verification_successful",
  "authenticated",
  "leaping_conversation_usecase_successful",
  "leaping_conversation_completed",
] as const;

export interface LeapingCallContext {
  intent?: string;
  verification_tools: string[];
  utility_tools: string[];
  mcp_tools: string[];
  stages: string[];
  utterances: string[];
  compact_timeline: string;
  verification_path: VerificationPath;
  /** true when any pmb_* tool appears — clone experiment, not live default */
  is_clone_mcp: boolean;
}

export function classifyMarieTool(name: string): MarieToolKind {
  if (name.startsWith("pmb_")) return "mcp";
  if (LIVE_VERIFICATION_TOOLS.has(name) || LEGACY_PHONE_TOOLS.has(name)) return "verification";
  if (UTILITY_TOOLS.has(name)) return "utility";
  return "other";
}

export function inferVerificationPath(tools: string[]): VerificationPath {
  if (tools.includes("get_customer_by_plz_geb")) return "address";
  if (
    tools.includes("get_customer_by_insurance_number") ||
    tools.includes("check_insurance_number_format")
  ) {
    return "vnr";
  }
  if (tools.includes("recognize_customer_by_phone") || tools.includes("get_customer_by_phone")) {
    return "phone";
  }
  return "unknown";
}

export function isMcpBrain(name: string): boolean {
  return name.startsWith("pmb_");
}

export function isLiveVerificationTool(name: string): boolean {
  return LIVE_VERIFICATION_TOOLS.has(name) || LEGACY_PHONE_TOOLS.has(name);
}

export function isUtilityTool(name: string): boolean {
  return UTILITY_TOOLS.has(name);
}

export function ownerLabel(owner: IssueOwner): string {
  return { marie: "Marie", leaping: "Leaping", mcp: "MCP", mixed: "Marie+Leaping" }[owner];
}

function toolErrorOwner(toolName: string): IssueOwner {
  if (isMcpBrain(toolName)) return "mcp";
  if (isLiveVerificationTool(toolName)) return "marie";
  return "leaping";
}

export { toolErrorOwner };

/** One-line fixes — no essay */
export const FIX = {
  birthday_binding: "Leaping: birthday_system aus Lookup binden vor check_birthday",
  phone_verify: "recognize_customer_by_phone → birthday_system → check_birthday",
  vnr_stt: "VNR: Format-Check, STT-Splitting, dann get_customer_by_insurance_number",
  address_plz: "PLZ+Hausnr+Geburtstag an get_customer_by_plz_geb",
  marie_improv: "Dialogue: keine Rückfragen erfinden",
  marie_filler: "Dialogue: kein „Einen Moment“-Fülltext bei Tool-Wartezeit",
  transfer_ok: "Transfer OK — Verifikation verkürzen (Dialogue/Prompt)",
  transfer_missing: "Call-Transfer-Node prüfen",
  dropped_short: "Kurz abgebrochen — Voicemail/falsche Nummer",
  mcp_clone_only: "Clone-Agent (pmb_*) — Live nutzt native HTTP functions",
  routing_live: "Kundenident-Stage: Verifikationstool muss feuern",
  vnr_after_phone: "Nach Telefon-Treffer nicht in VNR-Pfad wechseln",
  long_no_verify: "Kundenident-Stage + Dialogue-Prompt prüfen",
} as const;

export const LEAPING_LLM_BRIEF = `LIVE Marie = Leaping Dialogue Kundenident + native HTTP functions (KEIN MCP auf Production).
Verification: recognize_customer_by_phone | VNR (check_insurance_number_format→get_customer_by_insurance_number) | Adresse (get_customer_by_plz_geb) → check_birthday.
Owner: Marie=Dialogue improvisiert / natives. Leaping=Feldbindings (birthday_system), Stages, Transfer. MCP=nur wenn pmb_* tools im transcript (Clone-Test).
Transcript=Leaping event array; summary=End-node Zusammenfassung.`;
