import type {
  LeapingCallRecord,
  DetectedIssue,
  CallAnalysis,
  ReportSummary,
  LlmAnalysisResult,
  IssueOwner,
} from "./types.js";
import {
  FIX,
  LEAPING_LLM_BRIEF,
  ownerLabel,
  isMcpBrain,
  isLiveVerificationTool,
  toolErrorOwner,
} from "./leaping-context.js";

const LONG_CALL_SECONDS = 180;
const SHORT_DROP_SECONDS = 30;

const PHONE_TOOLS = ["recognize_customer_by_phone", "get_customer_by_phone"];

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

function hasToolError(call: LeapingCallRecord, names: string[]): boolean {
  return (call.function_calls ?? []).some((fc) => names.includes(fc.name) && fc.error);
}

function hasToolSuccess(call: LeapingCallRecord, names: string[]): boolean {
  return (call.function_calls ?? []).some((fc) => names.includes(fc.name) && !fc.error);
}

function callHasFailure(call: LeapingCallRecord): boolean {
  const status = call.call_status ?? "unknown";
  return (
    (call.function_calls ?? []).some((fc) => fc.error) ||
    status === "failed" ||
    status === "transferred" ||
    status === "dropped" ||
    call.verification_successful === false
  );
}

export function detectIssues(call: LeapingCallRecord): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const seen = new Set<string>();
  const text = speechText(call);
  const ctx = call.leaping_context;
  const duration = call.duration_seconds ?? 0;
  const status = call.call_status ?? "unknown";
  const isClone = ctx?.is_clone_mcp ?? false;

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
      const owner = toolErrorOwner(fc.name);
      let recommendation = FIX.birthday_binding;
      if (isMcpBrain(fc.name)) recommendation = FIX.mcp_clone_only;
      else if (PHONE_TOOLS.includes(fc.name)) recommendation = FIX.phone_verify;
      else if (fc.name === "get_customer_by_insurance_number") recommendation = FIX.vnr_stt;
      else if (fc.name === "get_customer_by_plz_geb") recommendation = FIX.address_plz;
      else if (fc.name === "check_birthday") recommendation = FIX.birthday_binding;

      pushUnique(issues, seen, {
        category: owner === "mcp" ? "wrong_brain" : "escalation",
        severity: "high",
        owner,
        title: `${fc.name} Fehler`,
        detail: fc.error.slice(0, 120),
        recommendation,
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
      recommendation: FIX.marie_filler,
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
      detail: "status=failed",
      recommendation: "Leaping call log + failed_stage",
    });
  }

  const phoneAttempted =
    ctx?.verification_path === "phone" ||
    (ctx?.verification_tools ?? []).some((t) => PHONE_TOOLS.includes(t)) ||
    /telefon/i.test(text);

  if (hasToolError(call, PHONE_TOOLS) && phoneAttempted && !hasToolSuccess(call, PHONE_TOOLS)) {
    pushUnique(issues, seen, {
      category: "phone_path",
      severity: "high",
      owner: "marie",
      title: "Telefon-Erkennung fehlgeschlagen",
      detail: "recognize_customer_by_phone ohne Treffer",
      recommendation: FIX.phone_verify,
    });
  }

  if (
    !isClone &&
    callHasFailure(call) &&
    (ctx?.verification_tools.length ?? 0) === 0 &&
    duration > 30
  ) {
    pushUnique(issues, seen, {
      category: "wrong_brain",
      severity: "medium",
      owner: "leaping",
      title: "Kein Verifikationstool aufgezeichnet",
      detail: "Live-Agent: recognize/VNR/PLZ fehlt im Log",
      recommendation: FIX.routing_live,
    });
  }

  if (isClone && (ctx?.mcp_tools.length ?? 0) > 0 && callHasFailure(call)) {
    const hasRouter = (ctx?.mcp_tools ?? []).includes("pmb_verification_method_router");
    const hasBrain = (ctx?.mcp_tools ?? []).some(
      (t) => t.startsWith("pmb_verification_") && t !== "pmb_verification_method_router",
    );
    if (hasBrain && !hasRouter) {
      pushUnique(issues, seen, {
        category: "wrong_brain",
        severity: "low",
        owner: "mcp",
        title: "Clone: Brain ohne method_router",
        detail: ctx!.mcp_tools.join(", "),
        recommendation: FIX.mcp_clone_only,
      });
    }
  }

  const phoneOk = hasToolSuccess(call, PHONE_TOOLS);
  const vnrFailed = hasToolError(call, ["get_customer_by_insurance_number"]);
  if (phoneOk && vnrFailed && (ctx?.verification_path === "vnr" || ctx?.verification_path === "unknown")) {
    pushUnique(issues, seen, {
      category: "wrong_brain",
      severity: "medium",
      owner: "leaping",
      title: "VNR-Pfad obwohl Telefon erkannt",
      detail: "recognize_customer_by_phone OK, danach VNR-Fehler",
      recommendation: FIX.vnr_after_phone,
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
        recommendation: FIX.marie_filler,
      });
    }
    if (/meinten sie\s+\d{4}/i.test(text)) {
      pushUnique(issues, seen, {
        category: "stt_noise",
        severity: "medium",
        owner: "marie",
        title: "Jahres-Rückfrage improvisiert",
        detail: "nicht im Dialogue-Script",
        recommendation: FIX.marie_improv,
      });
    }
    if (
      /versichertennummer|vnr/i.test(text) &&
      /ungültig|mehrere versuche|keine eindeutige identifikation/i.test(text)
    ) {
      const viaClone = (ctx?.mcp_tools ?? []).includes("pmb_verification_vnr_brain");
      pushUnique(issues, seen, {
        category: "verification_loop",
        severity: "high",
        owner: viaClone ? "mcp" : "mixed",
        title: "VNR/ID fehlgeschlagen",
        detail: viaClone ? "clone vnr brain" : "summary/transcript",
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
        recommendation: status === "transferred" ? FIX.transfer_ok : FIX.transfer_missing,
      });
    }
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
      recommendation: FIX.long_no_verify,
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
  options: { apiKey: string; model?: string; baseUrl?: string },
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
      path: a.call.leaping_context?.verification_path,
      clone: a.call.leaping_context?.is_clone_mcp,
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
