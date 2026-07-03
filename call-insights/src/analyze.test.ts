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
  it("extracts leaping_context from transcript array", () => {
    const call = normalizeLeapingCall({
      id: "06a47740-e4de-7d7c-8000-885c352e3869",
      status: "transferred",
      field_values: { intent: "sonstiges" },
      transcript: [
        { type: "function", name: "pmb_verification_vnr_brain", returned: "{}", error: null },
        { type: "user", content: "A123456789" },
        { type: "transition", to_name: "Kundenident" },
      ],
    });

    assert.ok(call?.leaping_context);
    assert.equal(call!.leaping_context!.intent, "sonstiges");
    assert.ok(call!.leaping_context!.mcp_brains.includes("pmb_verification_vnr_brain"));
  });
});

describe("analyzeCall", () => {
  it("does not flag normal calls with birthday metadata", () => {
    const call = normalizeLeapingCall({
      id: "ok-call",
      status: "completed",
      field_values: { birthday_system: "1956-03-15", verification_successful: true },
      function_calls: [{ name: "check_birthday" }],
      transcript: [{ type: "function", name: "pmb_verification_phone_brain", error: null }],
    })!;

    const analysis = analyzeCall(call);
    assert.equal(analysis.verdict, "ok");
  });

  it("flags birthday_system binding errors", () => {
    const analysis = analyzeCall(
      sampleCall({
        function_calls: [
          { name: "check_birthday", error: "Missing field value: birthday_system" },
        ],
      })
    );
    assert.equal(analysis.verdict, "failed");
    assert.equal(analysis.issues[0]?.owner, "leaping");
  });

  it("flags marie filler speech", () => {
    const analysis = analyzeCall(
      sampleCall({
        leaping_context: {
          utterances: ["agent: Danke. Einen Moment bitte.", "agent: Einen Moment bitte."],
          mcp_brains: ["pmb_verification_address_brain"],
          native_tools: [],
          stages: [],
          compact_timeline: "",
        },
        transcript_text: "agent: Danke. Einen Moment bitte.",
      })
    );
    assert.ok(analysis.issues.some((i) => i.owner === "marie"));
  });

  it("batch of healthy calls stays ok", () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      analyzeCall(
        sampleCall({
          id: `healthy-${i}`,
          leaping_context: {
            mcp_brains: ["pmb_verification_method_router"],
            native_tools: ["get_customer_by_phone"],
            stages: ["Kundenident"],
            utterances: [],
            compact_timeline: "pmb_verification_method_router OK",
          },
        })
      )
    );
    const summary = buildSummary(calls);
    assert.equal(summary.ok, 10);
  });
});

describe("buildMarkdownReport", () => {
  it("renders compact report", () => {
    const calls = [
      analyzeCall(
        sampleCall({
          transcript_text: "summary: VNR ungültig",
          summary_text: "VNR ungültig, Transfer zum Menschen",
          call_status: "transferred",
        })
      ),
    ];
    const summary = buildSummary(calls);
    const md = buildMarkdownReport(summary, calls, null);
    assert.match(md, /DKN Call Report/);
    assert.match(md, /Calls to review/);
  });
});

describe("analyzeCalls", () => {
  it("does not mark 100 calls failed due to metadata alone", () => {
    const rawCalls = Array.from({ length: 100 }, (_, i) =>
      normalizeLeapingCall({
        id: `call-${i}`,
        status: "completed",
        field_values: { verification_successful: true },
        transcript: [{ type: "function", name: "pmb_verification_phone_brain", error: null }],
      })
    ).filter((c): c is LeapingCallRecord => c !== null);

    const summary = buildSummary(analyzeCalls(rawCalls));
    assert.equal(summary.failed, 0);
    assert.equal(summary.ok, 100);
  });
});
