#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadConfigFromEnv, isoDateDaysAgo, isoDateNow, assertLeapingAuthConfigured } from "./config.js";
import { fetchLeapingCalls, exportLeapingCallsCsv } from "./leaping-client.js";
import { analyzeCalls, buildSummary, enrichWithLlm } from "./analyze.js";
import { writePdfReport, writeMarkdownReport } from "./report.js";

function parseArgs(argv: string[]) {
  const opts: Record<string, string | boolean> = {
    days: "7",
    limit: "100",
    out: "reports",
    llm: true,
    csv: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-llm") opts.llm = false;
    else if (arg === "--no-csv") opts.csv = false;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-/g, "_");
      const val = argv[i + 1];
      if (val && !val.startsWith("--")) {
        opts[key] = val;
        i++;
      } else {
        opts[key] = true;
      }
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const callId = typeof opts.call_id === "string" ? opts.call_id.trim() : "";
  const days = Number(opts.days) || 7;
  const limit = Number(opts.limit) || 100;
  const outDir = String(opts.out);
  const useLlm = opts.llm !== false;
  const exportCsv = opts.csv !== false && !callId;

  const config = loadConfigFromEnv();
  if (typeof opts.token === "string" && opts.token.trim()) {
    config.leapingAccessToken = opts.token.trim();
  }
  assertLeapingAuthConfigured(config);

  const startDate = isoDateDaysAgo(days);
  const endDate = isoDateNow();

  if (callId) {
    console.log(`Fetching call ${callId}...`);
  } else {
    console.log(`Fetching calls ${startDate.slice(0, 10)} → ${endDate.slice(0, 10)} (limit ${limit})...`);
  }

  const calls = await fetchLeapingCalls(config, {
    callId: callId || undefined,
    startDate,
    endDate,
    limit: callId ? 1 : limit,
  });

  console.log(`Fetched ${calls.length} call(s).`);

  if (calls.length === 0) {
    console.warn("No calls found. Check credentials, agent ID, date range, or call ID.");
    process.exit(0);
  }

  const withTranscript = calls.filter((c) => (c.transcript_text?.length ?? 0) > 0).length;
  const withSummary = calls.filter((c) => (c.summary_text?.length ?? 0) > 0).length;
  const withTools = calls.filter((c) => (c.function_calls?.length ?? 0) > 0).length;

  if (withTranscript === 0 && withSummary === 0) {
    console.warn(
      "Warning: no transcript or summary extracted — check Leaping payload shape."
    );
  } else {
    console.log(
      `Content: ${withTranscript}/${calls.length} transcripts, ${withSummary}/${calls.length} summaries, ${withTools}/${calls.length} with tool logs`
    );
  }

  const analyses = analyzeCalls(calls);
  const summary = buildSummary(analyses);

  let llm = null;
  if (useLlm && config.openaiApiKey) {
    console.log("Running LLM enrichment...");
    llm = await enrichWithLlm(analyses, summary, {
      apiKey: config.openaiApiKey,
      model: config.openaiModel,
      baseUrl: config.openaiBaseUrl,
    });
  } else if (useLlm) {
    console.warn("OPENAI_API_KEY not set — rule-based report only.");
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = path.resolve(outDir);
  fs.mkdirSync(reportDir, { recursive: true });

  const suffix = callId ? `call-${callId.slice(0, 8)}-${stamp}` : stamp;
  const pdfPath = path.join(reportDir, `dkn-call-insights-${suffix}.pdf`);
  const mdPath = path.join(reportDir, `dkn-call-insights-${suffix}.md`);
  const jsonPath = path.join(reportDir, `dkn-call-insights-${suffix}.json`);

  await writePdfReport(pdfPath, summary, analyses, llm);
  writeMarkdownReport(mdPath, summary, analyses, llm);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ summary, llm, analyses }, null, 2),
    "utf8"
  );

  if (exportCsv) {
    const csvPath = path.join(reportDir, `calls-export-${stamp}.csv`);
    const csv = await exportLeapingCallsCsv(config, { startDate, endDate, limit });
    fs.writeFileSync(csvPath, csv, "utf8");
    console.log(`  CSV:  ${csvPath}`);
  }

  console.log("\nReport generated:");
  console.log(`  PDF:  ${pdfPath}`);
  console.log(`  MD:   ${mdPath}`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(
    `\nSummary: ${summary.ok} ok, ${summary.failed} failed, ${summary.needsReview} need review` +
      (summary.topIssues[0]
        ? `, top issue: ${summary.topIssues[0].category} (${summary.topIssues[0].count}x)`
        : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
