import type { CallInsightsConfig, LeapingCallRecord } from './types.js';

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t || undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function readPath(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function deriveDuration(record: Record<string, unknown>): number | undefined {
  const direct = readPath(record, ['duration_seconds', 'duration']);
  if (typeof direct === 'number' && Number.isFinite(direct)) return Math.round(direct);
  const started = asString(readPath(record, ['started_at', 'created_at']));
  const ended = asString(readPath(record, ['ended_at', 'completed_at', 'updated_at']));
  if (!started || !ended) return undefined;
  const ms = Date.parse(ended) - Date.parse(started);
  if (!Number.isFinite(ms) || ms < 0) return undefined;
  return Math.round(ms / 1000);
}

export function normalizeLeapingCall(call: unknown): LeapingCallRecord | null {
  const record = asRecord(call);
  if (!record) return null;
  const id = asString(readPath(record, ['id', 'call_id']));
  if (!id) return null;
  const status = asString(readPath(record, ['status', 'call_status'])) ?? 'unknown';
  const functionCallsRaw = record.function_calls ?? record.tool_calls;
  const function_calls = Array.isArray(functionCallsRaw)
    ? functionCallsRaw
        .map((item) => {
          const fc = asRecord(item);
          if (!fc) return null;
          const name = asString(readPath(fc, ['name', 'function_name', 'tool_name']));
          if (!name) return null;
          return {
            name,
            error: asString(readPath(fc, ['error', 'error_message'])),
          };
        })
        .filter((x): x is { name: string; error?: string } => x !== null)
    : undefined;

  return {
    id,
    status,
    created_at: asString(readPath(record, ['created_at', 'started_at', 'call_date'])),
    ended_at: asString(readPath(record, ['ended_at', 'completed_at'])),
    duration_seconds: deriveDuration(record),
    transcript_text: asString(
      readPath(record, ['transcript_text', 'transcript', 'transcript_content'])
    ),
    verification_successful: asBoolean(
      readPath(record, ['verification_successful', 'verified', 'authenticated'])
    ),
    function_calls,
    raw: record,
  };
}

async function loginWithPassword(config: CallInsightsConfig): Promise<string> {
  const body = new URLSearchParams({
    username: config.leapingUsername ?? '',
    password: config.leapingPassword ?? '',
    grant_type: 'password',
  });
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
  if (config.leapingApiKey?.trim()) {
    return config.leapingApiKey.trim();
  }
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 30_000) {
    return cachedToken;
  }
  if (!config.leapingUsername || !config.leapingPassword) {
    throw new Error('Set LEAPING_API_KEY or LEAPING_API_USERNAME + LEAPING_API_PASSWORD');
  }
  return loginWithPassword(config);
}

export interface FetchCallsOptions {
  startDate: string;
  endDate: string;
  limit?: number;
  status?: string;
}

export async function fetchLeapingCalls(
  config: CallInsightsConfig,
  options: FetchCallsOptions
): Promise<LeapingCallRecord[]> {
  const token = await getLeapingAccessToken(config);
  const query = new URLSearchParams({
    agent_id: config.leapingAgentId,
    start_date: options.startDate,
    end_date: options.endDate,
    limit: String(options.limit ?? 100),
    order_by: 'ended_at',
  });
  if (options.status) query.set('status', options.status);

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

export async function exportLeapingCallsCsv(
  config: CallInsightsConfig,
  options: FetchCallsOptions
): Promise<string> {
  const token = await getLeapingAccessToken(config);
  const response = await fetch(`${config.leapingApiBaseUrl}/calls/export`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      agent_id: config.leapingAgentId,
      filters: {
        start_datetime: options.startDate,
        end_datetime: options.endDate,
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
