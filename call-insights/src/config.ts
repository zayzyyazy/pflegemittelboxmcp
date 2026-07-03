import type { CallInsightsConfig } from "./types.js";

export type LeapingAuthMode = "access_token" | "login" | "missing";

export function resolveLeapingAuthMode(config: CallInsightsConfig): LeapingAuthMode {
  if (config.leapingAccessToken?.trim()) return "access_token";
  if (config.leapingUsername?.trim() && config.leapingPassword?.trim()) return "login";
  return "missing";
}

export function loadConfigFromEnv(): CallInsightsConfig {
  const leapingAgentId = process.env.LEAPING_AGENT_ID?.trim();
  if (!leapingAgentId) {
    throw new Error("LEAPING_AGENT_ID is required in call-insights/.env");
  }

  return {
    leapingApiBaseUrl:
      process.env.LEAPING_API_BASE_URL?.trim() ?? "https://api.leaping.ai/v1",
    leapingAccessToken: process.env.LEAPING_ACCESS_TOKEN?.trim(),
    leapingUsername: process.env.LEAPING_API_USERNAME?.trim(),
    leapingPassword: process.env.LEAPING_API_PASSWORD?.trim(),
    leapingClientId: process.env.LEAPING_API_CLIENT_ID?.trim(),
    leapingClientSecret: process.env.LEAPING_API_CLIENT_SECRET?.trim(),
    leapingAgentId,
    openaiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openaiModel: process.env.OPENAI_MODEL?.trim() ?? "gpt-4o-mini",
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1",
  };
}

export function assertLeapingAuthConfigured(config: CallInsightsConfig): void {
  const mode = resolveLeapingAuthMode(config);
  if (mode !== "missing") return;

  throw new Error(
    "Leaping auth required. Set LEAPING_ACCESS_TOKEN (Bearer from login) " +
      "or LEAPING_API_USERNAME + LEAPING_API_PASSWORD for POST /v1/login."
  );
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function isoDateNow(): string {
  return new Date().toISOString();
}
