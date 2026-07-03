import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLeapingTranscriptEvents, normalizeLeapingCall } from "./call-normalize.js";
import { analyzeCall } from "./analyze.js";

const SAMPLE_SUMMARY =
  "In dem Gespräch versuchte der virtuelle Assistent, den Anrufer zu identifizieren. " +
  "Trotz mehrerer Versuche war die Versichertennummer ungültig. " +
  "Schließlich bat der Anrufer darum, mit einem menschlichen Mitarbeiter zu sprechen. " +
  "Der Assistent leitete den Anruf erfolgreich an einen menschlichen Mitarbeiter weiter.";

describe("parseLeapingTranscriptEvents", () => {
  it("parses Leaping transcript v2 event array", () => {
    const parsed = parseLeapingTranscriptEvents([
      { type: "start", fields: { intent: "sonstiges" } },
      { type: "function_call_request", name: "get_now" },
      {
        type: "function",
        name: "get_now",
        returned: "03.07.2026, Friday, 10:34",
        error: null,
      },
      { type: "user", content: "Ich möchte kündigen." },
      { type: "assistant", content: "Gerne, ich identifiziere Sie zuerst." },
      {
        type: "end",
        summary: SAMPLE_SUMMARY,
        fields: { leaping_conversation_usecase_successful: false },
      },
    ]);

    assert.match(parsed.transcript_text ?? "", /tool get_now/);
    assert.match(parsed.transcript_text ?? "", /user: Ich möchte kündigen/);
    assert.equal(parsed.summary_text, SAMPLE_SUMMARY);
    assert.equal(parsed.field_values.leaping_conversation_usecase_successful, false);
  });
});

describe("normalizeLeapingCall with transcript array", () => {
  it("fills transcript_text and summary from raw.transcript[]", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "transferred",
      duration_seconds: "396",
      summary: SAMPLE_SUMMARY,
      transcript: [
        { type: "function", name: "verification_brain_router", returned: "{}", error: null },
        { type: "user", content: "A123456789" },
        { type: "end", summary: SAMPLE_SUMMARY, fields: { verification_successful: false } },
      ],
    });

    assert.ok(call);
    assert.ok((call!.transcript_text?.length ?? 0) > 50);
    assert.equal(call!.summary_text, SAMPLE_SUMMARY);
    assert.equal(call!.verification_successful, false);
  });

  it("detects VNR failure and human transfer from summary", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "transferred",
      duration_seconds: 396,
      summary: SAMPLE_SUMMARY,
      transcript: [{ type: "end", summary: SAMPLE_SUMMARY }],
    })!;

    const analysis = analyzeCall(call);
    assert.ok(analysis.issues.some((i) => i.title.includes("VNR")));
    assert.ok(analysis.issues.some((i) => i.title.includes("Mensch")));
    assert.match(analysisText(call), /Versichertennummer/);
  });
});

function analysisText(call: { transcript_text?: string; summary_text?: string }): string {
  return [call.transcript_text, call.summary_text].filter(Boolean).join("\n");
}
