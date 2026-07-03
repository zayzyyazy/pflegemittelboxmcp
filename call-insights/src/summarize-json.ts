#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import type { CallAnalysis, ReportSummary } from "./types.js";

const CATEGORY_LABELS: Record<string, string> = {
  verification_loop: "Warteschleife / Fülltext",
  birthday_binding: "birthday_system Binding",
  phone_path: "Telefon-Pfad",
  stt_noise: "STT / Improvisation",
  wrong_brain: "Falscher Pfad",
  escalation: "Eskalation",
  customer_confusion: "Kundenverwirrung",
  other: "Sonstiges",
};

type ReportFile = {
  summary: ReportSummary;
  analyses: CallAnalysis[];
  llm?: unknown;
};

function loadReport(filePath: string): ReportFile {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as ReportFile;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Usage: npm run summarize -- reports/dkn-call-insights-....json");
    process.exit(1);
  }

  const abs = path.resolve(filePath);
  const { summary, analyses } = loadReport(abs);

  console.log("\n=== DKN Call Insights Summary ===\n");
  console.log(`File: ${abs}`);
  console.log(
    `Calls: ${summary.totalCalls} | OK: ${summary.ok} | Failed: ${summary.failed} | Review: ${summary.needsReview}`
  );

  if (summary.topIssues.length === 0) {
    console.log("\nTop issues: (none detected)");
  } else {
    console.log("\nTop issues:");
    for (const t of summary.topIssues) {
      console.log(`  - ${CATEGORY_LABELS[t.category] ?? t.category}: ${t.count}x`);
    }
  }

  const withTranscript = analyses.filter((a) => (a.call.transcript_text?.length ?? 0) > 0);
  const withSummary = analyses.filter((a) => (a.call.summary_text?.length ?? 0) > 0);
  console.log(
    `\nContent: ${withTranscript.length}/${analyses.length} transcripts, ${withSummary.length}/${analyses.length} summaries`
  );

  const problemCalls = analyses
    .filter((a) => a.verdict !== "ok")
    .sort((a, b) => b.score - a.score);

  console.log(`\nCalls needing attention: ${problemCalls.length}`);
  for (const a of problemCalls.slice(0, 15)) {
    console.log(`\n--- ${a.call.id} (${a.verdict}, score ${a.score}) ---`);
    console.log(
      `  status=${a.call.status} verified=${String(a.call.verification_successful ?? "?")} duration=${a.call.duration_seconds ?? "?"}s`
    );
    if (a.issues.length === 0) {
      console.log("  (no issues listed)");
    } else {
      for (const issue of a.issues) {
        console.log(`  [${issue.severity}] ${issue.title}`);
        console.log(`    ${issue.detail.slice(0, 120)}`);
      }
    }
    const excerpt = (a.call.transcript_text ?? a.call.summary_text ?? "").slice(0, 200);
    if (excerpt) {
      const label = a.call.transcript_text ? "text" : "summary";
      console.log(`  ${label}: ${excerpt.replace(/\n/g, " ")}…`);
    } else {
      console.log("  text: (empty — no transcript[] or summary on call)");
    }
  }

  if (problemCalls.length > 15) {
    console.log(`\n… and ${problemCalls.length - 15} more`);
  }

  console.log("");
}

main();
