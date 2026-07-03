import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveLeapingAuthMode } from "./config.js";
import type { CallInsightsConfig } from "./types.js";

function baseConfig(overrides: Partial<CallInsightsConfig> = {}): CallInsightsConfig {
  return {
    leapingApiBaseUrl: "https://api.leaping.ai/v1",
    leapingAgentId: "agent-1",
    openaiModel: "gpt-4o-mini",
    openaiBaseUrl: "https://api.openai.com/v1",
    ...overrides,
  };
}

describe("resolveLeapingAuthMode", () => {
  it("prefers login when username/password are set", () => {
    assert.equal(
      resolveLeapingAuthMode(
        baseConfig({
          leapingAccessToken: "eyJ.test",
          leapingUsername: "a@b.c",
          leapingPassword: "secret",
        })
      ),
      "login"
    );
  });

  it("falls back to login credentials", () => {
    assert.equal(
      resolveLeapingAuthMode(
        baseConfig({
          leapingUsername: "a@b.c",
          leapingPassword: "secret",
        })
      ),
      "login"
    );
  });

  it("reports missing auth", () => {
    assert.equal(resolveLeapingAuthMode(baseConfig()), "missing");
  });
});
