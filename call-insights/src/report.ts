import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { CallAnalysis, ReportSummary, LlmAnalysisResult } from "./types.js";

const CATEGORY_LABELS: Record<string, string> = {
  verification_loop: "Warteschleife / leerer Say",
  birthday_binding: "Geburtsdatum / Binding",
  phone_path: "Telefon-Pfad",
  stt_noise: "STT / Improvisation",
  wrong_brain: "Falscher Verifikations-Pfad",
  escalation: "Eskalation",
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
    "# DKN Call Insights Report",
    "",
    `**Erstellt:** ${formatDate(summary.generatedAt)}`,
    `**Anrufe:** ${summary.totalCalls} | **Fehlgeschlagen:** ${summary.failed} | **Review:** ${summary.needsReview}`,
    "",
  ];

  if (llm?.executiveSummary) {
    lines.push("## Executive Summary", "", llm.executiveSummary, "");
  }

  lines.push("## Größte Problemkategorien", "");
  const issues = llm?.biggestIssues?.length
    ? llm.biggestIssues
    : summary.topIssues.map((t) => ({
        issue: CATEGORY_LABELS[t.category] ?? t.category,
        count: t.count,
        fix: "",
      }));

  for (const item of issues) {
    lines.push(
      `- **${item.issue}** (${item.count}x)${item.fix ? ` — ${item.fix}` : ""}`
    );
  }
  lines.push("");

  if (llm?.marieVsMcp) {
    lines.push("## Marie vs MCP", "", llm.marieVsMcp, "");
  }

  if (llm?.recommendations?.length) {
    lines.push("## Empfehlungen", "");
    llm.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push("");
  }

  const worst = analyses
    .filter((a) => a.verdict !== "ok")
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  lines.push("## Kritische Anrufe (Top 20)", "");
  for (const a of worst) {
    lines.push(
      `### ${a.call.id} — Score ${a.score} (${a.verdict})`,
      `- Dauer: ${a.call.duration_seconds ?? "?"}s | Status: ${a.call.status}`,
      ""
    );
    for (const issue of a.issues) {
      lines.push(`- [${issue.severity}] ${issue.title}: ${issue.recommendation}`);
    }
    const excerpt = (a.call.transcript_text ?? "").slice(0, 400);
    if (excerpt) lines.push("", `> ${excerpt.replace(/\n/g, " ")}`, "");
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

    doc.fontSize(20).text("DKN Call Insights Report", { underline: true });
    doc.moveDown();
    doc.fontSize(10).fillColor("#444");
    doc.text(`Erstellt: ${formatDate(summary.generatedAt)}`);
    doc.text(
      `Anrufe: ${summary.totalCalls}  |  Fehlgeschlagen: ${summary.failed}  |  Review: ${summary.needsReview}`
    );
    doc.moveDown();

    if (llm?.executiveSummary) {
      doc.fontSize(14).fillColor("#000").text("Executive Summary");
      doc.fontSize(10).text(llm.executiveSummary, { align: "justify" });
      doc.moveDown();
    }

    doc.fontSize(14).text("Größte Probleme");
    doc.fontSize(10);
    const top = llm?.biggestIssues?.length
      ? llm.biggestIssues
      : summary.topIssues.map((t) => ({
          issue: CATEGORY_LABELS[t.category] ?? t.category,
          count: t.count,
          fix: "",
        }));

    for (const item of top.slice(0, 10)) {
      doc.text(`• ${item.issue} (${item.count}x)`);
      if (item.fix) {
        doc.fontSize(9).fillColor("#666").text(`  → ${item.fix}`);
        doc.fillColor("#000").fontSize(10);
      }
    }
    doc.moveDown();

    if (llm?.marieVsMcp) {
      doc.fontSize(14).text("Marie vs MCP");
      doc.fontSize(10).text(llm.marieVsMcp);
      doc.moveDown();
    }

    if (llm?.recommendations?.length) {
      doc.fontSize(14).text("Empfehlungen");
      doc.fontSize(10);
      llm.recommendations.forEach((r, i) => doc.text(`${i + 1}. ${r}`));
      doc.moveDown();
    }

    doc.fontSize(14).text("Kritische Anrufe");
    doc.fontSize(9);
    const worst = analyses
      .filter((a) => a.verdict !== "ok")
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    for (const a of worst) {
      if (doc.y > 700) doc.addPage();
      doc.fontSize(11).fillColor("#000").text(`${a.call.id} — Score ${a.score}`);
      doc.fontSize(9).fillColor("#444");
      for (const issue of a.issues.slice(0, 4)) {
        doc.text(`  [${issue.severity}] ${issue.title}`);
      }
      doc.moveDown(0.5);
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
