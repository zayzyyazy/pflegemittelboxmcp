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
  it("extracts live leaping_context from transcript array", () => {
    const call = normalizeLeapingCall({
      id: "live-call-1",
      status: "completed",
      field_values: { intent: "kuendigung" },
      transcript: [
        { type: "function", name: "recognize_customer_by_phone", returned: "{}", error: null },
        { type: "function", name: "check_birthday", returned: "ok", error: null },
        { type: "function", name: "get_now", returned: "{}", error: null },
        { type: "user", content: "Ich möchte kündigen." },
        { type: "transition", to_name: "Kundenident" },
      ],
    });

    assert.ok(call?.leaping_context);
    assert.equal(call!.leaping_context!.intent, "kuendigung");
    assert.ok(call!.leaping_context!.verification_tools.includes("recognize_customer_by_phone"));
    assert.ok(call!.leaping_context!.utility_tools.includes("get_now"));
    assert.equal(call!.leaping_context!.is_clone_mcp, false);
    assert.equal(call!.leaping_context!.verification_path, "phone");
  });

  it("marks clone when pmb_* tools appear", () => {
    const call = normalizeLeapingCall({
      id: "clone-call-1",
      status: "transferred",
      transcript: [
        { type: "function", name: "pmb_verification_vnr_brain", returned: "{}", error: null },
      ],
    });

    assert.ok(call?.leaping_context?.is_clone_mcp);
    assert.ok(call!.leaping_context!.mcp_tools.includes("pmb_verification_vnr_brain"));
  });
});

describe("analyzeCall", () => {
  it("does not flag normal calls with birthday metadata", () => {
    const call = normalizeLeapingCall({
      id: "ok-call",
      status: "completed",
      field_values: { birthday_system: "1956-03-15", verification_successful: true },
      function_calls: [{ name: "check_birthday" }],
      transcript: [{ type: "function", name: "recognize_customer_by_phone", error: null }],
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
      }),
    );
    assert.equal(analysis.verdict, "failed");
    assert.equal(analysis.issues[0]?.owner, "leaping");
  });

  it("flags marie filler speech", () => {
    const analysis = analyzeCall(
      sampleCall({
        leaping_context: {
          verification_tools: ["recognize_customer_by_phone"],
          utility_tools: [],
          mcp_tools: [],
          verification_path: "phone",
          is_clone_mcp: false,
          utterances: ["agent: Danke. Einen Moment bitte.", "agent: Einen Moment bitte."],
          stages: [],
          compact_timeline: "",
        },
        transcript_text: "agent: Danke. Einen Moment bitte.",
      }),
    );
    assert.ok(analysis.issues.some((i) => i.owner === "marie"));
  });

  it("does not flag live native tools as missing MCP brain", () => {
    const calls = Array.from({ length: 10 }, (_, i) =>
      analyzeCall(
        sampleCall({
          id: `healthy-${i}`,
          leaping_context: {
            verification_tools: ["recognize_customer_by_phone", "check_birthday"],
            utility_tools: ["get_now"],
            mcp_tools: [],
            verification_path: "phone",
            is_clone_mcp: false,
            stages: ["Kundenident"],
            utterances: [],
            compact_timeline: "recognize_customer_by_phone OK",
          },
        }),
      ),
    );
    const summary = buildSummary(calls);
    assert.equal(summary.ok, 10);
    assert.ok(!calls.some((c) => c.issues.some((i) => i.title.includes("MCP-Brain"))));
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
        }),
      ),
    ];
    const summary = buildSummary(calls);
    const md = buildMarkdownReport(summary, calls, null);
    assert.match(md, /DKN Call Report/);
    assert.match(md, /Calls to review/);
  });
});

describe("analyzeCalls", () => {
  it("does not mark 100 live calls failed due to metadata alone", () => {
    const rawCalls = Array.from({ length: 100 }, (_, i) =>
      normalizeLeapingCall({
        id: `call-${i}`,
        status: "completed",
        field_values: { verification_successful: true },
        transcript: [
          { type: "function", name: "recognize_customer_by_phone", error: null },
          { type: "function", name: "check_birthday", error: null },
        ],
      }),
    ).filter((c): c is LeapingCallRecord => c !== null);

    const summary = buildSummary(analyzeCalls(rawCalls));
    assert.equal(summary.failed, 0);
    assert.equal(summary.ok, 100);
  });
});
