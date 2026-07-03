import type {
  LeapingCallRecord,
  DetectedIssue,
  CallAnalysis,
  ReportSummary,
  LlmAnalysisResult,
} from "./types.js";

const LONG_CALL_SECONDS = 180;

const TRANSCRIPT_PATTERNS: Array<{
  test: (text: string) => boolean;
  issue: Omit<DetectedIssue, "detail"> & { detail?: string };
}> = [
  {
    test: (t) => /(?:danke\.?\s*)?(?:ein(en)?\s+)?moment\s+bitte/i.test(t),
    issue: {
      category: "verification_loop",
      severity: "high",
      title: "Warteschleife / Fülltext",
      recommendation:
        'Marie spricht „Einen Moment bitte“ — bei leerem MCP say nur natives Tool, kein Fülltext.',
    },
  },
  {
    test: (t) => /meinten sie\s+\d{4}/i.test(t),
    issue: {
      category: "stt_noise",
      severity: "medium",
      title: "Marie erfindet Jahres-Rückfrage",
      recommendation: "Nur MCP say vorlesen — keine improvisierten „Meinten Sie …?“-Fragen.",
    },
  },
  {
    test: (t) => /\bmerz\b/i.test(t) && !/\bmärz\b/i.test(t),
    issue: {
      category: "stt_noise",
      severity: "medium",
      title: "STT: Merz statt März",
      recommendation: "MCP-STT-Normalisierung Merz→März; Adress-Bestätigung prüfen.",
    },
  },
  {
    test: (t) =>
      /technisch(e?s)?\s+problem/i.test(t) ||
      /fehler\s+aufgetreten/i.test(t) ||
      /es tut mir leid.*problem/i.test(t),
    issue: {
      category: "escalation",
      severity: "high",
      title: "Technischer Fehler / Entschuldigung",
      recommendation: "Ursache in Tool-Fehlern oder fehlenden Leaping-Feldern suchen.",
    },
  },
  {
    test: (t) =>
      (t.match(/verstehe (ich )?nicht|habe ich nicht verstanden|was meinen sie/gi) ?? [])
        .length >= 2,
    issue: {
      category: "customer_confusion",
      severity: "medium",
      title: "Wiederholte Kundenverwirrung",
      recommendation: "Kürzere Sätze, eine Frage pro Turn.",
    },
  },
];

function pushUnique(issues: DetectedIssue[], seen: Set<string>, issue: DetectedIssue): void {
  const key = `${issue.category}:${issue.title}`;
  if (seen.has(key)) return;
  seen.add(key);
  issues.push(issue);
}

function transcriptSuggestsFrustration(transcript: string): boolean {
  const lower = transcript.toLowerCase();
  return (
    lower.includes("beschwer") ||
    lower.includes("frustriert") ||
    lower.includes("unzufrieden") ||
    /\bmensch\b/.test(lower)
  );
}

function countFillerMoments(transcript: string): number {
  const matches = transcript.match(/(?:ein(en)?\s+)?moment\s+bitte/gi);
  return matches?.length ?? 0;
}

export function detectIssues(call: LeapingCallRecord): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const seen = new Set<string>();
  const transcript = call.transcript_text?.trim() ?? "";

  for (const fc of call.function_calls ?? []) {
    if (fc.error?.includes("Missing field value: birthday_system")) {
      pushUnique(issues, seen, {
        category: "birthday_binding",
        severity: "critical",
        title: "birthday_system fehlt bei check_birthday",
        detail: fc.error.slice(0, 200),
        recommendation:
          "Leaping: birthday_system vor check_birthday binden (get_customer_by_phone o.ä.).",
      });
    } else if (fc.error) {
      pushUnique(issues, seen, {
        category: "escalation",
        severity: "high",
        title: `Tool-Fehler: ${fc.name}`,
        detail: fc.error.slice(0, 200),
        recommendation: "Leaping-Feldbindings und MCP-Args prüfen.",
      });
    }
  }

  const events = call.detected_events;
  if ((events?.repeated_birthday_requests ?? 0) > 2) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      title: "Geburtsdatum mehrfach angefragt",
      detail: `repeated_birthday_requests=${events!.repeated_birthday_requests}`,
      recommendation: "Verifikationsschleife — MCP/Marie Turn-Logik prüfen.",
    });
  }
  if ((events?.repeated_vnr_requests ?? 0) > 2) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      title: "VNR mehrfach angefragt",
      detail: `repeated_vnr_requests=${events!.repeated_vnr_requests}`,
      recommendation: "VNR-STT oder Retry-Limit prüfen.",
    });
  }
  if ((events?.repeated_address_requests ?? 0) > 2) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      title: "Adresse/PLZ mehrfach angefragt",
      detail: `repeated_address_requests=${events!.repeated_address_requests}`,
      recommendation: "Adress-Pfad oder Methodenwechsel prüfen.",
    });
  }
  if (events?.technical_issue_mentioned) {
    pushUnique(issues, seen, {
      category: "escalation",
      severity: "high",
      title: "Technisches Problem (detected_events)",
      detail: "technical_issue_mentioned=true",
      recommendation: "Function-call-Fehler und Eskalationspfad prüfen.",
    });
  }
  if (events?.customer_requested_human && call.call_status !== "transferred") {
    pushUnique(issues, seen, {
      category: "escalation",
      severity: "high",
      title: "Mensch gewünscht, keine Weiterleitung",
      detail: "customer_requested_human=true",
      recommendation: "Transfer-Pfad in Leaping prüfen.",
    });
  }

  if (call.call_status === "failed" || call.call_status === "dropped") {
    pushUnique(issues, seen, {
      category: "escalation",
      severity: "high",
      title: `Anruf ${call.call_status}`,
      detail: `status=${call.call_status}`,
      recommendation: "Aufzeichnung anhören; ggf. Rückruf.",
    });
  }

  if (call.phone_lookup_found === false && transcript.length > 0) {
    const phoneBrainMentioned =
      /telefonnummer|anrufnummer|über das telefon/i.test(transcript) &&
      /verifiz|identifiz|bestätig/i.test(transcript);
    if (phoneBrainMentioned) {
      pushUnique(issues, seen, {
        category: "phone_path",
        severity: "high",
        title: "Telefon-Pfad trotz fehlendem Lookup",
        detail: "phone_lookup_found=false, Telefon-Verifikation im Gespräch",
        recommendation:
          "phone_lookup_found nur aus get_customer_by_phone — nicht Caller-ID als Kunden-Telefon.",
      });
    }
  }

  if (transcript) {
    if (countFillerMoments(transcript) >= 3) {
      pushUnique(issues, seen, {
        category: "verification_loop",
        severity: "high",
        title: "Mehrfach „Einen Moment bitte“",
        detail: `${countFillerMoments(transcript)}× im Transcript`,
        recommendation: "Leeres MCP say → natives Tool ohne Füllsprache.",
      });
    }

    for (const rule of TRANSCRIPT_PATTERNS) {
      if (rule.test(transcript)) {
        pushUnique(issues, seen, {
          ...rule.issue,
          detail: rule.issue.detail ?? "Im Transcript erkannt",
        });
      }
    }

    if (events?.customer_frustrated || transcriptSuggestsFrustration(transcript)) {
      pushUnique(issues, seen, {
        category: "customer_confusion",
        severity: "medium",
        title: "Kundenfrustration",
        detail: events?.customer_frustrated ? "customer_frustrated=true" : "Transcript-Hinweise",
        recommendation: "Flow vereinfachen; ggf. früherer Transfer.",
      });
    }
  }

  if (
    (call.duration_seconds ?? 0) >= LONG_CALL_SECONDS &&
    call.verification_successful !== true
  ) {
    pushUnique(issues, seen, {
      category: "verification_loop",
      severity: "high",
      title: "Langer Anruf ohne erfolgreiche Verifikation",
      detail: `${call.duration_seconds}s, verification_successful=${String(call.verification_successful ?? "unknown")}`,
      recommendation: "Schleife bei Geburtstag/Adresse/VNR — Transcript ansehen.",
    });
  }

  if (call.verification_successful === false && issues.length === 0) {
    pushUnique(issues, seen, {
      category: "other",
      severity: "medium",
      title: "Verifikation nicht erfolgreich",
      detail: `Call ${call.id}`,
      recommendation: "Transcript und Tool-Calls in Leaping prüfen.",
    });
  }

  return issues;
}

function scoreCall(issues: DetectedIssue[]): number {
  if (issues.length === 0) return 0;
  const weights = { critical: 40, high: 25, medium: 12, low: 5 };
  return Math.min(100, issues.reduce((s, i) => s + weights[i.severity], 0));
}

export function analyzeCall(call: LeapingCallRecord): CallAnalysis {
  const issues = detectIssues(call);
  const score = scoreCall(issues);

  let verdict: CallAnalysis["verdict"] = "ok";
  if (issues.some((i) => i.severity === "critical")) {
    verdict = "failed";
  } else if (
    issues.filter((i) => i.severity === "high").length >= 2 ||
    (issues.some((i) => i.severity === "high") && call.verification_successful === false)
  ) {
    verdict = "failed";
  } else if (issues.length > 0) {
    verdict = "needs_review";
  }

  return { call, issues, score, verdict };
}

export function analyzeCalls(calls: LeapingCallRecord[]): CallAnalysis[] {
  return calls.map(analyzeCall);
}

export function buildSummary(analyses: CallAnalysis[]): ReportSummary {
  const byCategory: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
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
    }
  }

  const topIssues = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([category, count]) => ({ category, count }));

  return {
    generatedAt: new Date().toISOString(),
    totalCalls: analyses.length,
    ok,
    failed,
    needsReview,
    topIssues,
    bySeverity,
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

  const sampleFails = analyses
    .filter((a) => a.verdict !== "ok")
    .slice(0, 15)
    .map((a) => ({
      id: a.call.id,
      duration: a.call.duration_seconds,
      verdict: a.verdict,
      verified: a.call.verification_successful,
      issues: a.issues.map((i) => ({ title: i.title, detail: i.detail })),
      excerpt: (a.call.transcript_text ?? "").slice(0, 1200),
      tools: a.call.function_calls?.map((f) =>
        f.error ? `${f.name} ERR:${f.error.slice(0, 80)}` : f.name
      ),
    }));

  const prompt = `Du bist Analyst für DKN-Pflegebox-Telefonate (Marie Voice-Agent + MCP-Verifikation).

Daten:
- Analysierte Anrufe: ${summary.totalCalls}
- OK: ${summary.ok}
- Fehlgeschlagen: ${summary.failed}
- Review nötig: ${summary.needsReview}
- Top-Kategorien: ${JSON.stringify(summary.topIssues)}

Problemanrufe (nur echte Issues, keine Metadata-False-Positives):
${JSON.stringify(sampleFails, null, 2)}

Antworte NUR mit validem JSON:
{
  "executiveSummary": "2-4 Sätze auf Deutsch",
  "biggestIssues": [{"issue": "...", "count": N, "fix": "konkrete Maßnahme"}],
  "marieVsMcp": "Kurz: was liegt an Marie/Leaping vs MCP",
  "recommendations": ["max 5 priorisierte Empfehlungen"]
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
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Du analysierst Voice-Agent-Anrufe für Pflegemittelbox. Nur echte Probleme nennen. Antworte nur JSON.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`LLM HTTP ${res.status}: ${await res.text()}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    return JSON.parse(content) as LlmAnalysisResult;
  } catch (err) {
    console.warn("LLM enrichment failed:", err);
    return null;
  }
}
