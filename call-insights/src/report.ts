import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { CallAnalysis, ReportSummary, LlmAnalysisResult } from "./types.js";
import { ownerLabel } from "./leaping-context.js";

const CATEGORY_LABELS: Record<string, string> = {
  verification_loop: "Verifikations-Loop",
  birthday_binding: "birthday_system",
  phone_path: "Telefon-Pfad",
  stt_noise: "STT / Improvisation",
  wrong_brain: "Falscher Pfad",
  escalation: "Eskalation / Transfer",
  customer_confusion: "Kundenverwirrung",
  other: "Sonstiges",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin" });
  } catch {
    return iso;
  }
}

export function buildMarkdownReport(
  summary: ReportSummary,
  analyses: CallAnalysis[],
  llm: LlmAnalysisResult | null
): string {
  const lines: string[] = [
    "# DKN Call Report",
    "",
    `${summary.totalCalls} calls · ${summary.ok} ok · ${summary.failed} fail · ${summary.needsReview} review`,
    `Generated ${formatDate(summary.generatedAt)}`,
    "",
  ];

  if (llm?.headline) {
    lines.push(`**${llm.headline}**`, "");
  }

  lines.push("## Top issues", "");
  const top = llm?.biggestIssues?.length
    ? llm.biggestIssues
    : summary.topIssues.map((t) => ({
        issue: CATEGORY_LABELS[t.category] ?? t.category,
        count: t.count,
        owner: t.owner ? ownerLabel(t.owner) : "?",
        fix: "",
      }));

  for (const item of top.slice(0, 6)) {
    lines.push(
      `- **${item.issue}** (${item.count}×) · ${"owner" in item ? item.owner : "?"}${item.fix ? ` → ${item.fix}` : ""}`
    );
  }
  lines.push("");

  if (Object.keys(summary.byOwner).length) {
    lines.push("## By owner", "");
    for (const [owner, count] of Object.entries(summary.byOwner).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${ownerLabel(owner as Parameters<typeof ownerLabel>[0])}: ${count}`);
    }
    lines.push("");
  }

  if (llm?.recommendations?.length) {
    lines.push("## Actions", "");
    llm.recommendations.slice(0, 3).forEach((r) => lines.push(`- ${r}`));
    lines.push("");
  }

  const worst = analyses
    .filter((a) => a.verdict !== "ok")
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  lines.push("## Calls to review", "");
  for (const a of worst) {
    const intent = a.call.leaping_context?.intent ?? "—";
    const topIssue = a.issues[0];
    lines.push(
      `- \`${a.call.id.slice(0, 8)}…\` ${a.call.call_status} ${a.call.duration_seconds ?? "?"}s · intent=${intent}`
    );
    if (topIssue) {
      lines.push(
        `  ${ownerLabel(topIssue.owner)}: ${topIssue.title} — ${topIssue.recommendation}`
      );
    }
  }

  return lines.join("\n");
}

export async function writePdfReport(
  outPath: string,
  summary: ReportSummary,
  analyses: CallAnalysis[],
  llm: LlmAnalysisResult | null
): Promise<void> {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);

    doc.fontSize(18).text("DKN Call Report");
    doc.fontSize(10).fillColor("#444");
    doc.text(
      `${summary.totalCalls} calls · ok ${summary.ok} · fail ${summary.failed} · review ${summary.needsReview}`
    );
    doc.text(formatDate(summary.generatedAt));
    doc.moveDown();

    if (llm?.headline) {
      doc.fillColor("#000").fontSize(11).text(llm.headline);
      doc.moveDown();
    }

    doc.fontSize(12).text("Top issues");
    doc.fontSize(9);
    const top = llm?.biggestIssues ?? summary.topIssues.map((t) => ({
      issue: CATEGORY_LABELS[t.category] ?? t.category,
      count: t.count,
      owner: t.owner ? ownerLabel(t.owner) : "",
      fix: "",
    }));
    for (const item of top.slice(0, 6)) {
      doc.text(`• ${item.issue} (${item.count}×) ${item.owner ?? ""}`);
      if (item.fix) doc.text(`  ${item.fix}`, { indent: 12 });
    }
    doc.moveDown();

    doc.fontSize(12).text("Calls to review");
    doc.fontSize(8);
    const worst = analyses
      .filter((a) => a.verdict !== "ok")
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    for (const a of worst) {
      if (doc.y > 720) doc.addPage();
      const issue = a.issues[0];
      doc.text(
        `${a.call.id.slice(0, 13)}… ${a.call.call_status} ${issue ? ownerLabel(issue.owner) + ": " + issue.title : ""}`
      );
    }

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
  });
}

export function writeMarkdownReport(
  outPath: string,
  summary: ReportSummary,
  analyses: CallAnalysis[],
  llm: LlmAnalysisResult | null
): void {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buildMarkdownReport(summary, analyses, llm), "utf8");
}
