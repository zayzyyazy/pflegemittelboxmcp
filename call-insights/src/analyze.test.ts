import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeCall, buildSummary } from "./analyze.js";
import { buildMarkdownReport } from "./report.js";
import type { LeapingCallRecord } from "./types.js";

function sampleCall(overrides: Partial<LeapingCallRecord> = {}): LeapingCallRecord {
  return {
    id: "call-1",
    status: "completed",
    duration_seconds: 120,
    transcript_text: "",
    raw: {},
    ...overrides,
  };
}

describe("analyzeCall", () => {
  it("flags birthday_system binding errors", () => {
    const analysis = analyzeCall(
      sampleCall({
        function_calls: [
          { name: "check_birthday", error: "Missing field value: birthday_system" },
        ],
        raw: { birthday_system: null },
      })
    );
    assert.equal(analysis.verdict, "failed");
    assert.ok(analysis.issues.some((i) => i.category === "birthday_binding"));
  });

  it("flags verification loop filler speech", () => {
    const analysis = analyzeCall(
      sampleCall({
        transcript_text: "Danke. Einen Moment bitte. Noch einen Moment.",
      })
    );
    assert.ok(analysis.issues.some((i) => i.category === "verification_loop"));
  });

  it("marks failed verification", () => {
    const analysis = analyzeCall(
      sampleCall({ verification_successful: false })
    );
    assert.notEqual(analysis.verdict, "ok");
  });
});

describe("buildMarkdownReport", () => {
  it("renders summary without LLM", () => {
    const calls = [
      analyzeCall(
        sampleCall({
          transcript_text: "Meinten Sie 1956?",
          verification_successful: false,
        })
      ),
    ];
    const summary = buildSummary(calls);
    const md = buildMarkdownReport(summary, calls, null);
    assert.match(md, /DKN Call Insights Report/);
    assert.match(md, /Kritische Anrufe/);
  });
});
