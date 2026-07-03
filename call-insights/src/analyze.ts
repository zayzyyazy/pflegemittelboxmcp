import type {
  LeapingCallRecord,
  DetectedIssue,
  CallAnalysis,
  ReportSummary,
  LlmAnalysisResult,
  IssueOwner,
} from "./types.js";
import { FIX, LEAPING_LLM_BRIEF, ownerLabel, isMcpBrain } from "./leaping-context.js";

const LONG_CALL_SECONDS = 180;
const SHORT_DROP_SECONDS = 30;

function pushUnique(issues: DetectedIssue[], seen: Set<string>, issue: DetectedIssue): void {
  const key = `${issue.category}:${issue.title}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function speechText(call: LeapingCallRecord): string {
  const parts: string[] = [];
  const utterances = call.leaping_context?.utterances ?? [];
  if (utterances.length) parts.push(utterances.join("\n"));
  else if (call.transcript_text) parts.push(call.transcript_text);
  if (call.summary_text) parts.push(call.summary_text);
  return parts.join("\n");
}

function countFiller(text: string): number {
  return text.match(/(?:ein(en)?\s+)?moment\s+bitte/gi)?.length ?? 0;
}

export function detectIssues(call: LeapingCallRecord): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const seen = new Set<string>();
  const text = speechText(call);
  const ctx = call.leaping_context;
  const duration = call.duration_seconds ?? 0;
  const status = call.call_status ?? "unknown";

  for (const fc of call.function_calls ?? []) {
    if (fc.error?.includes("Missing field value: birthday_system")) {
      pushUnique(issues, seen, {
        category: "birthday_binding",
        severity: "critical",
        owner: "leaping",
        title: "birthday_system fehlt",
        detail: fc.error.slice(0, 120),
        recommendation: FIX.birthday_binding,
      });
    } else if (fc.error) {
      pushUnique(issues, seen, {
        category: "escalation",
        severity: "high",
        owner: isMcpBrain(fc.name) ? "mcp" : "leaping",
        title: `${fc.name} Fehler`,
        detail: fc.error.slice(0, 120),
        recommendation: isMcpBrain(fc.name) ? "MCP-Logs + Brain-Args" : FIX.birthday_binding,
      });
    }
  }

  const events = call.detected_events;
  if ((events?.repeated_birthday_requests ?? 0) > 2) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      owner: "mixed",
      title: "Geburtsdatum-Loop",
      detail: `${events!.repeated_birthday_requests}×`,
      recommendation: FIX.empty_say_filler,
    });
  }
  if ((events?.repeated_vnr_requests ?? 0) > 2) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      owner: "mixed",
      title: "VNR-Loop",
      detail: `${events!.repeated_vnr_requests}×`,
      recommendation: FIX.vnr_stt,
    });
  }

  if (status === "dropped") {
    pushUnique(issues, seen, {
      category: "escalation",
      severity: duration < SHORT_DROP_SECONDS ? "low" : "medium",
      owner: "mixed",
      title: "Abgebrochen (dropped)",
      detail: `${duration}s`,
      recommendation: duration < SHORT_DROP_SECONDS ? FIX.dropped_short : "Recording anhören",
    });
  } else if (status === "failed") {
    pushUnique(issues, seen, {
      category: "escalation",
      severity: "high",
      owner: "leaping",
      title: "Call failed",
      detail: `status=failed`,
      recommendation: "Leaping call log + failed_stage",
    });
  }

  if (call.phone_lookup_found === false && (ctx?.native_tools.includes("get_customer_by_phone") || /telefon/i.test(text))) {
    pushUnique(issues, seen, {
      category: "phone_path",
      severity: "high",
      owner: "leaping",
      title: "Phone-Pfad ohne Lookup",
      detail: "phone_lookup_found=false",
      recommendation: FIX.phone_lookup,
    });
  }

  if (text) {
    if (countFiller(text) >= 2) {
      pushUnique(issues, seen, {
        category: "verification_loop",
        severity: "high",
        owner: "marie",
        title: "Fülltext „Moment bitte“",
        detail: `${countFiller(text)}×`,
        recommendation: FIX.empty_say_filler,
      });
    }
    if (/meinten sie\s+\d{4}/i.test(text)) {
      pushUnique(issues, seen, {
        category: "stt_noise",
        severity: "medium",
        owner: "marie",
        title: "Jahres-Rückfrage improvisiert",
        detail: "nicht in MCP say",
        recommendation: FIX.marie_improv,
      });
    }
    if (
      /versichertennummer|vnr/i.test(text) &&
      /ungültig|mehrere versuche|keine eindeutige identifikation/i.test(text)
    ) {
      pushUnique(issues, seen, {
        category: "verification_loop",
        severity: "high",
        owner: "mixed",
        title: "VNR/ID fehlgeschlagen",
        detail: ctx?.mcp_brains.includes("pmb_verification_vnr_brain") ? "vnr brain" : "summary",
        recommendation: FIX.vnr_stt,
      });
    }
    if (/menschlichen mitarbeiter|mit einem menschen/i.test(text)) {
      pushUnique(issues, seen, {
        category: "escalation",
        severity: status === "transferred" ? "low" : "high",
        owner: status === "transferred" ? "marie" : "leaping",
        title: "Mensch gewünscht",
        detail: status === "transferred" ? "transfer OK" : "kein transfer",
        recommendation:
          status === "transferred" ? FIX.transfer_ok : FIX.transfer_missing,
      });
    }
  }

  const noMcp = (ctx?.mcp_brains.length ?? 0) === 0;
  const hasNative = (ctx?.native_tools.length ?? 0) > 0;
  if (noMcp && hasNative && duration > 60) {
    pushUnique(issues, seen, {
      category: "wrong_brain",
      severity: "medium",
      owner: "marie",
      title: "Natives ohne MCP-Brain",
      detail: ctx!.native_tools.join(", "),
      recommendation: "Function nodes für pmb_verification_* brains",
    });
  }

  if (
    duration >= LONG_CALL_SECONDS &&
    call.verification_successful !== true &&
    status !== "transferred" &&
    status !== "dropped"
  ) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "medium",
      owner: "mixed",
      title: "Lang ohne Verifikation",
      detail: `${duration}s`,
      recommendation: "Kundenident-Stage + MCP-Turns prüfen",
    });
  }

  if (call.verification_successful === false && issues.length === 0) {
    pushUnique(issues, seen, {
      category: "other",
      severity: "medium",
      owner: "mixed",
      title: "Nicht verifiziert",
      detail: call.id,
      recommendation: "Leaping call ID öffnen",
    });
  }

  return issues;
}

function scoreCall(issues: DetectedIssue[]): number {
  if (!issues.length) return 0;
  const w = { critical: 40, high: 25, medium: 12, low: 5 };
  return Math.min(100, issues.reduce((s, i) => s + w[i.severity], 0));
}

export function analyzeCall(call: LeapingCallRecord): CallAnalysis {
  const issues = detectIssues(call);
  const score = scoreCall(issues);
  let verdict: CallAnalysis["verdict"] = "ok";
  if (issues.some((i) => i.severity === "critical")) verdict = "failed";
  else if (issues.filter((i) => i.severity === "high").length >= 2) verdict = "failed";
  else if (issues.some((i) => i.severity === "high" || i.severity === "medium")) verdict = "needs_review";
  else if (issues.length) verdict = "needs_review";

  return { call, issues, score, verdict };
}

export function analyzeCalls(calls: LeapingCallRecord[]): CallAnalysis[] {
  return calls.map(analyzeCall);
}

export function buildSummary(analyses: CallAnalysis[]): ReportSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  const byOwner: Record<string, number> = {};
  const ownerByCategory: Record<string, IssueOwner> = {};
  let failed = 0;
  let needsReview = 0;
  let ok = 0;

  for (const a of analyses) {
    if (a.verdict === "failed") failed++;
    else if (a.verdict === "needs_review") needsReview++;
    else ok++;

    for (const issue of a.issues) {
      byCategory[issue.category] = (byCategory[issue.category] ?? 0) + 1;
      bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
      byOwner[issue.owner] = (byOwner[issue.owner] ?? 0) + 1;
      if (!ownerByCategory[issue.category]) ownerByCategory[issue.category] = issue.owner;
    }
  }

  const topIssues = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([category, count]) => ({
      category,
      count,
      owner: ownerByCategory[category],
    }));

  return {
    generatedAt: new Date().toISOString(),
    totalCalls: analyses.length,
    ok,
    failed,
    needsReview,
    topIssues,
    bySeverity,
    byOwner,
  };
}

export async function enrichWithLlm(
  analyses: CallAnalysis[],
  summary: ReportSummary,
  options: { apiKey: string; model?: string; baseUrl?: string }
): Promise<LlmAnalysisResult | null> {
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return null;

  const model = options.model ?? "gpt-4o-mini";
  const baseUrl = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");

  const samples = analyses
    .filter((a) => a.verdict !== "ok")
    .slice(0, 8)
    .map((a) => ({
      id: a.call.id.slice(0, 8),
      status: a.call.call_status,
      intent: a.call.leaping_context?.intent,
      verdict: a.verdict,
      issues: a.issues.map((i) => `${ownerLabel(i.owner)}: ${i.title}`),
      summary: (a.call.summary_text ?? "").slice(0, 400),
      timeline: (a.call.leaping_context?.compact_timeline ?? "").slice(0, 300),
    }));

  const prompt = `${LEAPING_LLM_BRIEF}

Batch: ${summary.totalCalls} calls, ${summary.ok} ok, ${summary.failed} fail, ${summary.needsReview} review.
Owners: ${JSON.stringify(summary.byOwner)}
Top: ${JSON.stringify(summary.topIssues)}
Samples: ${JSON.stringify(samples)}

JSON only, Deutsch, KURZ (kein Prosa):
{
  "headline": "max 1 Satz",
  "biggestIssues": [{"issue":"...","count":N,"owner":"Marie|Leaping|MCP","fix":"max 12 Wörter"}],
  "recommendations": ["max 3 bullets, je max 15 Wörter"]
}`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Leaping/Marie DKN Analyst. Kurz. Nur JSON." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as LlmAnalysisResult;
  } catch {
    return null;
  }
}
