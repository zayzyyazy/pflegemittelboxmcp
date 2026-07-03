import type {
  LeapingCallRecord,
  DetectedIssue,
  CallAnalysis,
  ReportSummary,
  LlmAnalysisResult,
  IssueCategory,
} from "./types.js";

const ISSUE_PATTERNS: Array<{
  category: IssueCategory;
  severity: DetectedIssue["severity"];
  patterns: RegExp[];
  title: string;
  recommendation: string;
}> = [
  {
    category: "verification_loop",
    severity: "high",
    patterns: [
      /ein moment bitte/i,
      /einen moment bitte/i,
      /danke\.?\s*ein(en)? moment/i,
      /warten sie/i,
    ],
    title: "Warteschleife / leere MCP-Antwort",
    recommendation:
      'Marie spricht trotz say:"" — Leaping-Prompt: bei leerem say nur natives Tool. MCP: action WAIT statt leer.',
  },
  {
    category: "birthday_binding",
    severity: "critical",
    patterns: [
      /missing field value:\s*birthday_system/i,
      /birthday_system/i,
      /geburtsdatum.*nicht.*gefunden/i,
      /check_birthday/i,
    ],
    title: "Geburtsdatum / birthday_system",
    recommendation:
      "Leaping: birthday_system vor check_birthday binden. MCP: WAIT_FOR_BIRTHDAY_SYSTEM bis Feld da ist.",
  },
  {
    category: "phone_path",
    severity: "high",
    patterns: [
      /phone_lookup_found.*false/i,
      /\+49\d{10,}/,
      /anrufnummer/i,
      /telefonnummer.*kunden/i,
    ],
    title: "Telefon-Pfad / Caller-ID verwechselt",
    recommendation:
      "Nicht Anrufnummer als Kunden-Telefon nutzen. phone_lookup_found nur aus get_customer_by_phone.",
  },
  {
    category: "stt_noise",
    severity: "medium",
    patterns: [
      /\bmerz\b/i,
      /\bmärz\b/i,
      /meinten sie \d{4}/i,
      /stimmt das so/i,
      /verstanden.*nicht/i,
      /wiederholen sie/i,
    ],
    title: "STT-Rauschen / Marie improvisiert",
    recommendation:
      "MCP-STT-Normalisierung (Merz→März). Marie: keine Jahres-Rückfragen erfinden — nur MCP say.",
  },
  {
    category: "wrong_brain",
    severity: "high",
    patterns: [
      /ask_birth_year/i,
      /ask_birth_month/i,
      /address_method_choice/i,
      /vnr_brain/i,
      /phone_brain/i,
    ],
    title: "Falscher Verifikations-Pfad",
    recommendation:
      "Router/Methode prüfen: PLZ vs Adresse vs VNR vs Telefon. Klarer Methodenwechsel statt Entschuldigung.",
  },
  {
    category: "escalation",
    severity: "critical",
    patterns: [
      /technisch.*problem/i,
      /weiterleitung/i,
      /eskaliert/i,
      /support/i,
      /fehler.*aufgetreten/i,
    ],
    title: "Eskalation / technischer Fehler",
    recommendation:
      "Post-Call-Alert + MCP-Logs. Häufige Ursache: fehlende Felder oder natives Tool vor MCP-Freigabe.",
  },
  {
    category: "customer_confusion",
    severity: "medium",
    patterns: [
      /verstehe nicht/i,
      /was meinen sie/i,
      /nochmal/i,
      /langsamer/i,
      /habe ich nicht verstanden/i,
    ],
    title: "Kundenverwirrung",
    recommendation:
      "Kürzere Sätze, eine Frage pro Turn. MCP method_choice freundlich statt Entschuldigung.",
  },
];

function buildAnalysisBlob(call: LeapingCallRecord): string {
  const parts: string[] = [];
  if (call.transcript_text) parts.push(call.transcript_text);
  if (call.function_calls?.length) {
    parts.push(
      call.function_calls
        .map((fc) => `${fc.name}${fc.error ? ` ERROR:${fc.error}` : ""}`)
        .join("\n")
    );
  }
  parts.push(JSON.stringify(call.raw));
  return parts.join("\n");
}

function detectIssues(call: LeapingCallRecord): DetectedIssue[] {
  const blob = buildAnalysisBlob(call);
  if (!blob.trim()) return [];

  const issues: DetectedIssue[] = [];
  const seen = new Set<string>();

  for (const rule of ISSUE_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(blob)) {
        const key = `${rule.category}:${rule.title}`;
        if (seen.has(key)) break;
        seen.add(key);
        const match = blob.match(pattern);
        issues.push({
          category: rule.category,
          severity: rule.severity,
          title: rule.title,
          detail: match ? `Treffer: „${match[0].slice(0, 120)}“` : rule.title,
          recommendation: rule.recommendation,
        });
        break;
      }
    }
  }

  if (
    call.verification_successful === false &&
    !issues.some((i) => i.category === "escalation")
  ) {
    issues.push({
      category: "other",
      severity: "high",
      title: "Verifikation fehlgeschlagen",
      detail: `Call ${call.id} — verification_successful=false`,
      recommendation: "Transcript und function_calls prüfen; häufig Binding- oder STT-Problem.",
    });
  }

  for (const fc of call.function_calls ?? []) {
    if (fc.error && !issues.some((i) => i.detail.includes(fc.name))) {
      issues.push({
        category: "escalation",
        severity: "high",
        title: `Tool-Fehler: ${fc.name}`,
        detail: fc.error.slice(0, 200),
        recommendation: "Leaping-Feldbindings und MCP-Args prüfen.",
      });
    }
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
  if (score >= 50 || issues.some((i) => i.severity === "critical")) verdict = "failed";
  else if (score >= 20 || issues.length > 0) verdict = "needs_review";

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

  for (const a of analyses) {
    if (a.verdict === "failed") failed++;
    if (a.verdict === "needs_review") needsReview++;
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
      issues: a.issues.map((i) => i.title),
      excerpt: (a.call.transcript_text ?? "").slice(0, 800),
      tools: a.call.function_calls?.map((f) => f.name),
    }));

  const prompt = `Du bist Analyst für DKN-Pflegebox-Telefonate (Marie Voice-Agent + MCP-Verifikation).

Daten:
- Analysierte Anrufe: ${summary.totalCalls}
- Fehlgeschlagen: ${summary.failed}
- Review nötig: ${summary.needsReview}
- Top-Kategorien: ${JSON.stringify(summary.topIssues)}

Beispiel-Problemanrufe:
${JSON.stringify(sampleFails, null, 2)}

Antworte NUR mit validem JSON (kein Markdown):
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
              "Du analysierst Voice-Agent-Anrufe für Pflegemittelbox. Antworte nur JSON.",
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
