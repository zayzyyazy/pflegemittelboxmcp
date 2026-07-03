import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { analyzeCall, analyzeCalls, buildSummary } from "./analyze.js";
import { buildMarkdownReport } from "./report.js";
import { normalizeLeapingCall } from "./call-normalize.js";
import type { LeapingCallRecord } from "./types.js";

function sampleCall(overrides: Partial<LeapingCallRecord> = {}): LeapingCallRecord {
  return {
    id: "call-1",
    status: "completed",
    call_status: "completed",
    duration_seconds: 120,
    transcript_text: "",
    verification_successful: true,
    raw: {},
    ...overrides,
  };
}

describe("normalizeLeapingCall", () => {
  it("extracts field_values and messages transcript", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "completed",
      field_values: {
        birthday_system: "1956-03-15",
        verification_successful: true,
        phone_lookup_found: true,
      },
      function_calls: [{ name: "verification_brain_router" }, { name: "check_birthday" }],
      messages: [
        { role: "assistant", content: "Guten Tag, wie kann ich helfen?" },
        { role: "user", content: "Ich brauche eine Box." },
      ],
    });

    assert.ok(call);
    assert.equal(call!.verification_successful, true);
    assert.match(call!.transcript_text ?? "", /Guten Tag/);
  });
});

describe("analyzeCall", () => {
  it("does not flag normal calls with birthday metadata", () => {
    const call = normalizeLeapingCall({
      id: "ok-call",
      status: "completed",
      authenticated: true,
      field_values: {
        birthday_system: "1956-03-15",
        check_birthday: "done",
      },
      function_calls: [{ name: "check_birthday" }],
    })!;

    const analysis = analyzeCall(call);
    assert.equal(analysis.verdict, "ok");
    assert.equal(analysis.issues.length, 0);
  });

  it("flags birthday_system binding errors from tool error text", () => {
    const analysis = analyzeCall(
      sampleCall({
        function_calls: [
          { name: "check_birthday", error: "Missing field value: birthday_system" },
        ],
      })
    );
    assert.equal(analysis.verdict, "failed");
    assert.ok(analysis.issues.some((i) => i.category === "birthday_binding"));
  });

  it("flags verification loop filler speech in transcript", () => {
    const analysis = analyzeCall(
      sampleCall({
        transcript_text:
          "assistant: Danke. Einen Moment bitte.\nassistant: Einen Moment bitte.\nassistant: Einen Moment bitte.",
      })
    );
    assert.ok(analysis.issues.some((i) => i.category === "verification_loop"));
  });

  it("marks long unverified calls for review", () => {
    const analysis = analyzeCall(
      sampleCall({
        duration_seconds: 200,
        verification_successful: false,
      })
    );
    assert.notEqual(analysis.verdict, "ok");
  });

  it("batch of healthy calls is mostly ok", () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      analyzeCall(
        sampleCall({
          id: `healthy-${i}`,
          function_calls: [{ name: "check_birthday" }],
          raw: { field_values: { birthday_system: "1990-01-01" } },
        })
      )
    );
    const summary = buildSummary(calls);
    assert.equal(summary.ok, 10);
    assert.equal(summary.failed, 0);
  });
});

describe("buildMarkdownReport", () => {
  it("renders summary without LLM", () => {
    const calls = [
      analyzeCall(
        sampleCall({
          transcript_text: "assistant: Meinten Sie 1956?",
          verification_successful: false,
        })
      ),
    ];
    const summary = buildSummary(calls);
    const md = buildMarkdownReport(summary, calls, null);
    assert.match(md, /DKN Call Insights Report/);
    assert.match(md, /OK:/);
  });
});

describe("analyzeCalls", () => {
  it("does not mark 100 calls failed due to metadata alone", () => {
    const rawCalls = Array.from({ length: 100 }, (_, i) =>
      normalizeLeapingCall({
        id: `call-${i}`,
        status: "completed",
        field_values: { birthday_system: "1950-01-01", verification_successful: true },
        function_calls: [{ name: "check_birthday" }, { name: "verification_brain_router" }],
      })
    ).filter((c): c is LeapingCallRecord => c !== null);

    const summary = buildSummary(analyzeCalls(rawCalls));
    assert.equal(summary.failed, 0);
    assert.equal(summary.ok, 100);
  });
});
