import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseLeapingTranscriptEvents, normalizeLeapingCall } from "./call-normalize.js";
import { analyzeCall } from "./analyze.js";

const SAMPLE_SUMMARY =
  "Versichertennummer ungültig nach mehreren Versuchen. Kunde wollte menschlichen Mitarbeiter. Transfer erfolgreich.";

describe("parseLeapingTranscriptEvents", () => {
  it("parses Leaping transcript v2 event array", () => {
    const parsed = parseLeapingTranscriptEvents([
      { type: "function", name: "pmb_verification_vnr_brain", returned: "{}", error: null },
      { type: "user", content: "Ich möchte kündigen." },
      { type: "end", summary: SAMPLE_SUMMARY },
    ]);

    assert.match(parsed.transcript_text ?? "", /user: Ich möchte kündigen/);
    assert.ok(parsed.mcp_brains.includes("pmb_verification_vnr_brain"));
    assert.ok(parsed.compact_timeline.includes("pmb_verification_vnr_brain"));
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
        { type: "function", name: "pmb_verification_vnr_brain", error: null },
        { type: "end", summary: SAMPLE_SUMMARY },
      ],
    })!;

    const analysis = analyzeCall(call);
    assert.ok(analysis.issues.some((i) => i.title.includes("VNR")));
    assert.ok(analysis.issues.some((i) => i.title.includes("Mensch")));
  });
});
