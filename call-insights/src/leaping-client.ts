import type { CallInsightsConfig, LeapingCallRecord } from './types.js';
import { normalizeLeapingCall } from './call-normalize.js';

export { normalizeLeapingCall } from './call-normalize.js';

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

async function loginWithPassword(config: CallInsightsConfig): Promise<string> {
  const body = new URLSearchParams({
    username: config.leapingUsername ?? '',
    password: config.leapingPassword ?? '',
    grant_type: 'password',
  });
  if (config.leapingClientId) {
    body.set('client_id', config.leapingClientId);
  }
  if (config.leapingClientSecret) {
    body.set('client_secret', config.leapingClientSecret);
  }
  const response = await fetch(`${config.leapingApiBaseUrl}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    message?: string;
  };
  if (!response.ok || !json.access_token) {
    throw new Error(json.message ?? `Leaping login failed (${response.status})`);
  }
  cachedToken = json.access_token;
  cachedTokenExpiresAt = Date.now() + (json.expires_in ?? 900) * 1000;
  return json.access_token;
}

export async function getLeapingAccessToken(config: CallInsightsConfig): Promise<string> {
  const pasted = config.leapingAccessToken?.trim();
  if (pasted) {
    return pasted;
  }
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 30_000) {
    return cachedToken;
  }
  if (!config.leapingUsername?.trim() || !config.leapingPassword?.trim()) {
    throw new Error(
      'Set LEAPING_ACCESS_TOKEN (Bearer from POST /v1/login) or LEAPING_API_USERNAME + LEAPING_API_PASSWORD'
    );
  }
  return loginWithPassword(config);
}

export interface FetchCallsOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
  status?: string;
  callId?: string;
}

async function fetchCallsPage(
  config: CallInsightsConfig,
  token: string,
  query: URLSearchParams
): Promise<LeapingCallRecord[]> {
  const response = await fetch(`${config.leapingApiBaseUrl}/calls/?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = (await response.json().catch(() => ({}))) as {
    calls?: unknown[];
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Leaping get calls failed (${response.status})`);
  }

  return (body.calls ?? [])
    .map(normalizeLeapingCall)
    .filter((c): c is LeapingCallRecord => c !== null);
}

export async function fetchLeapingCallById(
  config: CallInsightsConfig,
  callId: string
): Promise<LeapingCallRecord | null> {
  const token = await getLeapingAccessToken(config);
  const query = new URLSearchParams({
    agent_id: config.leapingAgentId,
    id: callId,
    limit: '1',
  });
  const calls = await fetchCallsPage(config, token, query);
  return calls[0] ?? null;
}

export async function fetchLeapingCalls(
  config: CallInsightsConfig,
  options: FetchCallsOptions
): Promise<LeapingCallRecord[]> {
  if (options.callId) {
    const single = await fetchLeapingCallById(config, options.callId);
    return single ? [single] : [];
  }

  const token = await getLeapingAccessToken(config);
  const maxCalls = options.limit ?? 100;
  const pageSize = Math.min(maxCalls, 100);
  const all: LeapingCallRecord[] = [];
  let offset = 0;

  while (all.length < maxCalls) {
    const query = new URLSearchParams({
      agent_id: config.leapingAgentId,
      limit: String(Math.min(pageSize, maxCalls - all.length)),
      offset: String(offset),
      order_by: 'ended_at',
    });
    if (options.startDate) query.set('start_date', options.startDate);
    if (options.endDate) query.set('end_date', options.endDate);
    if (options.status) query.set('status', options.status);

    const batch = await fetchCallsPage(config, token, query);
    all.push(...batch);
    if (batch.length < Number(query.get('limit'))) break;
    offset += batch.length;
  }

  return all.slice(0, maxCalls);
}

export async function exportLeapingCallsCsv(
  config: CallInsightsConfig,
  options: FetchCallsOptions
): Promise<string> {
  const token = await getLeapingAccessToken(config);
  const startDate = options.startDate ?? new Date(Date.now() - 7 * 86400000).toISOString();
  const endDate = options.endDate ?? new Date().toISOString();
  const response = await fetch(`${config.leapingApiBaseUrl}/calls/export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: config.leapingAgentId,
      filters: {
        start_datetime: startDate,
        end_datetime: endDate,
        ...(options.callId ? { id: options.callId } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 300) || `Leaping export failed (${response.status})`);
  }
  return text;
}
