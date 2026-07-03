import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { CallInsightsConfig } from "./types.js";
import {
  clearLeapingTokenCache,
  getLeapingAccessToken,
  fetchLeapingCallById,
} from "./leaping-client.js";

function baseConfig(overrides: Partial<CallInsightsConfig> = {}): CallInsightsConfig {
  return {
    leapingApiBaseUrl: "https://api.leaping.ai/v1",
    leapingAgentId: "agent-1",
    leapingUsername: "user@example.com",
    leapingPassword: "secret",
    openaiModel: "gpt-4o-mini",
    openaiBaseUrl: "https://api.openai.com/v1",
    ...overrides,
  };
}

describe("getLeapingAccessToken", () => {
  it("prefers login over pasted token when both are set", async () => {
    clearLeapingTokenCache();
    const originalFetch = globalThis.fetch;
    let loginCalls = 0;

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        loginCalls++;
        return new Response(JSON.stringify({ access_token: "fresh_token", expires_in: 900 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? "GET"}`);
    }) as typeof fetch;

    try {
      const token = await getLeapingAccessToken(
        baseConfig({ leapingAccessToken: "stale_pasted_token" })
      );
      assert.equal(token, "fresh_token");
      assert.equal(loginCalls, 1);
    } finally {
      globalThis.fetch = originalFetch;
      clearLeapingTokenCache();
    }
  });
});

describe("fetchLeapingCallById 401 retry", () => {
  it("re-logins and retries once on 401", async () => {
    clearLeapingTokenCache();
    const originalFetch = globalThis.fetch;
    let callsAttempts = 0;
    let loginCalls = 0;

    globalThis.fetch = mock.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        loginCalls++;
        return new Response(JSON.stringify({ access_token: `token_${loginCalls}`, expires_in: 900 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/calls/?")) {
        callsAttempts++;
        if (callsAttempts === 1) {
          return new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 });
        }
        return new Response(
          JSON.stringify({
            calls: [{ id: "call-1", status: "completed", transcript: "hello" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    try {
      const call = await fetchLeapingCallById(baseConfig(), "call-1");
      assert.equal(call?.id, "call-1");
      assert.equal(callsAttempts, 2);
      assert.equal(loginCalls, 2);
    } finally {
      globalThis.fetch = originalFetch;
      clearLeapingTokenCache();
    }
  });
});
