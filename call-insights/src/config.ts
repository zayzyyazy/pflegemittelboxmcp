import type { CallInsightsConfig } from "./types.js";

export function loadConfigFromEnv(): CallInsightsConfig {
  const leapingAgentId = process.env.LEAPING_AGENT_ID?.trim();
  if (!leapingAgentId) {
    throw new Error("LEAPING_AGENT_ID is required in call-insights/.env");
  }

  return {
    leapingApiBaseUrl:
      process.env.LEAPING_API_BASE_URL?.trim() ?? "https://api.leaping.ai/v1",
    leapingApiKey: process.env.LEAPING_API_KEY?.trim(),
    leapingUsername: process.env.LEAPING_API_USERNAME?.trim(),
    leapingPassword: process.env.LEAPING_API_PASSWORD?.trim(),
    leapingAgentId,
    openaiApiKey: process.env.OPENAI_API_KEY?.trim(),
    openaiModel: process.env.OPENAI_MODEL?.trim() ?? "gpt-4o-mini",
    openaiBaseUrl:
      process.env.OPENAI_BASE_URL?.trim() ?? "https://api.openai.com/v1",
  };
}

export function isoDateDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

export function isoDateNow(): string {
  return new Date().toISOString();
}
