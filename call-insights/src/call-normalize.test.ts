import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLeapingTranscriptEvents, normalizeLeapingCall } from "./call-normalize.js";
import { analyzeCall } from "./analyze.js";

const SAMPLE_SUMMARY =
  "Versichertennummer ungültig nach mehreren Versuchen. Kunde wollte menschlichen Mitarbeiter. Transfer erfolgreich.";

describe("parseLeapingTranscriptEvents", () => {
  it("parses Leaping transcript v2 event array", () => {
    const parsed = parseLeapingTranscriptEvents([
      { type: "function", name: "get_customer_by_insurance_number", returned: "{}", error: "not found" },
      { type: "function", name: "get_now", returned: "{}", error: null },
      { type: "user", content: "Ich möchte kündigen." },
      { type: "end", summary: SAMPLE_SUMMARY },
    ]);

    assert.match(parsed.transcript_text ?? "", /user: Ich möchte kündigen/);
    assert.ok(parsed.verification_tools.includes("get_customer_by_insurance_number"));
    assert.ok(parsed.utility_tools.includes("get_now"));
    assert.ok(parsed.compact_timeline.includes("get_customer_by_insurance_number ERR"));
  });
});

describe("normalizeLeapingCall with transcript array", () => {
  it("uses summary when no utterances", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "transferred",
      summary: SAMPLE_SUMMARY,
      transcript: [{ type: "end", summary: SAMPLE_SUMMARY }],
    });

    assert.ok(call);
    assert.equal(call!.summary_text, SAMPLE_SUMMARY);
  });

  it("detects VNR failure from summary with owner", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "transferred",
      duration_seconds: 396,
      summary: SAMPLE_SUMMARY,
      transcript: [
        { type: "function", name: "get_customer_by_insurance_number", error: "not found" },
        { type: "function", name: "get_now", error: null },
        { type: "end", summary: SAMPLE_SUMMARY },
      ],
    })!;

    const analysis = analyzeCall(call);
    assert.ok(analysis.issues.some((i) => i.title.includes("VNR")));
    assert.ok(analysis.issues.some((i) => i.title.includes("Mensch")));
    assert.equal(call.leaping_context?.verification_path, "vnr");
    assert.equal(call.leaping_context?.is_clone_mcp, false);
  });
});
