import type { AppConfig } from './config.js';
import {
  getSettings,
  hasProcessedPostCallAlert,
  markProcessedPostCallAlert,
} from './db.js';
import {
  coercePostCallEmailNotifierInput,
  runPostCallEmailNotifier,
  type EmailSendConfig,
  type PostCallEmailNotifierInput,
  type PostCallEmailNotifierResult,
} from './tools/post-call-email-notifier.js';

type JsonRecord = Record<string, unknown>;

export interface PostCallMonitorState {
  enabled: boolean;
  running: boolean;
  interval_seconds: number | null;
  configured_agent_id: string | null;
  last_run_started_at: string | null;
  last_run_finished_at: string | null;
  last_run_ok: boolean | null;
  last_error: string | null;
  last_summary: PostCallMonitorRunSummary | null;
}

export interface PostCallMonitorRunSummary {
  ok: boolean;
  fetched_calls: number;
  terminal_calls_seen: number;
  already_processed: number;
  processed_now: number;
  alerts_sent: number;
  alerts_skipped: number;
  started_at: string;
  finished_at: string;
}

interface LeapingLoginResponse {
  access_token: string;
  expires_in?: number;
}

interface EffectiveMonitorConfig {
  leapingAgentId: string;
}

interface MonitorRunDeps {
  fetchImpl?: typeof fetch;
  isAlreadyProcessed?: (callId: string) => boolean;
  markProcessed?: (callId: string) => void;
  notifier?: (
    input: PostCallEmailNotifierInput,
    config: EmailSendConfig
  ) => Promise<PostCallEmailNotifierResult>;
  now?: () => Date;
}

const TERMINAL_CALL_STATUSES = new Set(['completed', 'failed', 'dropped', 'transferred']);

let cachedAccessToken: string | null = null;
let cachedAccessTokenExpiresAt = 0;

let monitorState: PostCallMonitorState = {
  enabled: false,
  running: false,
  interval_seconds: null,
  configured_agent_id: null,
  last_run_started_at: null,
  last_run_finished_at: null,
  last_run_ok: null,
  last_error: null,
  last_summary: null,
};

function asRecord(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

function readCandidateValue(record: JsonRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (key in record && record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function readNestedCandidateValue(record: JsonRecord, parentKeys: string[], keys: string[]): unknown {
  for (const parentKey of parentKeys) {
    const nested = asRecord(record[parentKey]);
    if (!nested) continue;
    const value = readCandidateValue(nested, keys);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeFunctionCalls(value: unknown): PostCallEmailNotifierInput['function_calls'] {
  if (!Array.isArray(value)) return undefined;
  const normalized: NonNullable<PostCallEmailNotifierInput['function_calls']> = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = asString(record.name);
    if (!name) continue;
    normalized.push({
      name,
      arguments: record.arguments ?? record.args,
      result: record.result ?? record.output,
      error: asString(record.error),
      timestamp: asString(record.timestamp ?? record.created_at ?? record.started_at),
    });
  }
  return normalized;
}

function normalizeTransitions(value: unknown): PostCallEmailNotifierInput['transitions'] {
  if (!Array.isArray(value)) return undefined;
  const normalized: NonNullable<PostCallEmailNotifierInput['transitions']> = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    normalized.push({
      from: asString(record.from),
      to: asString(record.to),
      timestamp: asString(record.timestamp ?? record.created_at),
    });
  }
  return normalized;
}

function normalizeDetectedEvents(value: unknown): PostCallEmailNotifierInput['detected_events'] {
  const record = asRecord(value);
  if (!record) return undefined;
  return {
    customer_frustrated: asBoolean(record.customer_frustrated),
    customer_requested_human: asBoolean(record.customer_requested_human),
    technical_issue_mentioned: asBoolean(record.technical_issue_mentioned),
    repeated_birthday_requests: asNumber(record.repeated_birthday_requests),
    repeated_vnr_requests: asNumber(record.repeated_vnr_requests),
    repeated_address_requests: asNumber(record.repeated_address_requests),
    silence_or_dead_air: asBoolean(record.silence_or_dead_air),
  };
}

function deriveDurationSeconds(record: JsonRecord): number | undefined {
  const direct = asNumber(
    readCandidateValue(record, ['duration_seconds', 'duration', 'call_duration_seconds'])
  );
  if (direct !== undefined) return direct;

  const startedAt = asString(readCandidateValue(record, ['started_at', 'created_at', 'call_date']));
  const endedAt = asString(readCandidateValue(record, ['ended_at', 'completed_at', 'updated_at']));
  if (!startedAt || !endedAt) return undefined;

  const startedMs = Date.parse(startedAt);
  const endedMs = Date.parse(endedAt);
  if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs) || endedMs < startedMs) {
    return undefined;
  }
  return Math.round((endedMs - startedMs) / 1000);
}

function deriveVerificationSuccessful(record: JsonRecord): boolean | undefined {
  const direct = asBoolean(
    readCandidateValue(record, [
      'verification_successful',
      'verified',
      'authenticated',
      'authentication_successful',
    ])
  );
  if (direct !== undefined) return direct;

  const nested = asBoolean(
    readNestedCandidateValue(
      record,
      ['results', 'result_values', 'field_values', 'fields'],
      [
        'verification_successful',
        'verified',
        'authenticated',
        'authentication_successful',
      ]
    )
  );
  return nested;
}

function deriveCallStatus(record: JsonRecord): PostCallEmailNotifierInput['call_status'] {
  const rawStatus = asString(readCandidateValue(record, ['status', 'call_status']))?.toLowerCase();
  if (
    rawStatus === 'completed' ||
    rawStatus === 'failed' ||
    rawStatus === 'transferred' ||
    rawStatus === 'dropped'
  ) {
    return rawStatus;
  }
  return 'unknown';
}

export function mapLeapingCallToNotifierInput(call: unknown): PostCallEmailNotifierInput | null {
  const record = asRecord(call);
  if (!record) return null;

  const callId = asString(readCandidateValue(record, ['id', 'call_id']));
  if (!callId) return null;

  const input: PostCallEmailNotifierInput = coercePostCallEmailNotifierInput({
    call_id: callId,
    call_date: asString(readCandidateValue(record, ['call_date', 'created_at', 'started_at'])),
    duration_seconds: deriveDurationSeconds(record),
    call_status: deriveCallStatus(record),
    verification_successful: deriveVerificationSuccessful(record),
    transcript_text: asString(
      readCandidateValue(record, ['transcript_text', 'transcript', 'transcript_content'])
    ),
    function_calls: normalizeFunctionCalls(
      record.function_calls ??
      record.tool_calls ??
      readNestedCandidateValue(record, ['results'], ['function_calls'])
    ),
    transitions: normalizeTransitions(
      record.transitions ?? readNestedCandidateValue(record, ['results'], ['transitions'])
    ),
    detected_events: normalizeDetectedEvents(
      record.detected_events ??
      readNestedCandidateValue(record, ['results', 'result_values'], ['detected_events'])
    ),
  });

  return input;
}

function resolveEffectiveMonitorConfig(config: AppConfig): EffectiveMonitorConfig {
  const settings = getSettings();
  const leapingAgentId = settings.leaping_agent_id?.trim() || config.LEAPING_AGENT_ID?.trim() || '';

  if (!leapingAgentId) {
    throw new Error(
      'Missing Leaping agent ID. Set LEAPING_AGENT_ID in the server environment or save leaping_agent_id in Settings.'
    );
  }

  monitorState = {
    ...monitorState,
    configured_agent_id: leapingAgentId,
  };

  return { leapingAgentId };
}

async function getAccessToken(
  config: AppConfig,
  fetchImpl: typeof fetch,
  now: Date
): Promise<string> {
  if (cachedAccessToken && cachedAccessTokenExpiresAt > now.getTime() + 30000) {
    return cachedAccessToken;
  }

  const loginBody = new URLSearchParams({
    username: config.LEAPING_API_USERNAME ?? '',
    password: config.LEAPING_API_PASSWORD ?? '',
    grant_type: 'password',
  });

  if (config.LEAPING_API_CLIENT_ID) {
    loginBody.set('client_id', config.LEAPING_API_CLIENT_ID);
  }
  if (config.LEAPING_API_CLIENT_SECRET) {
    loginBody.set('client_secret', config.LEAPING_API_CLIENT_SECRET);
  }

  const response = await fetchImpl(`${config.LEAPING_API_BASE_URL}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: loginBody.toString(),
  });

  const body = (await response.json().catch(() => ({}))) as Partial<LeapingLoginResponse> & {
    message?: string;
  };
  if (!response.ok || !body.access_token) {
    throw new Error(body.message ?? `Leaping login failed with HTTP ${response.status}`);
  }

  cachedAccessToken = body.access_token;
  const expiresInSeconds = body.expires_in ?? 900;
  cachedAccessTokenExpiresAt = now.getTime() + expiresInSeconds * 1000;
  return cachedAccessToken;
}

async function fetchRecentCalls(
  config: AppConfig,
  fetchImpl: typeof fetch,
  now: Date
): Promise<unknown[]> {
  const effective = resolveEffectiveMonitorConfig(config);
  const accessToken = await getAccessToken(config, fetchImpl, now);
  const startDate = new Date(
    now.getTime() - config.POST_CALL_MONITOR_LOOKBACK_MINUTES * 60 * 1000
  ).toISOString();

  const query = new URLSearchParams({
    agent_id: effective.leapingAgentId,
    start_date: startDate,
    limit: String(config.POST_CALL_MONITOR_FETCH_LIMIT),
    order_by: 'ended_at',
  });

  const response = await fetchImpl(`${config.LEAPING_API_BASE_URL}/calls/?${query.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = (await response.json().catch(() => ({}))) as {
    calls?: unknown[];
    message?: string;
  };
  if (!response.ok) {
    throw new Error(body.message ?? `Leaping get calls failed with HTTP ${response.status}`);
  }

  return Array.isArray(body.calls) ? body.calls : [];
}

function isTerminalStatus(status: PostCallEmailNotifierInput['call_status']): boolean {
  return Boolean(status && TERMINAL_CALL_STATUSES.has(status));
}

async function runSingleCall(
  config: AppConfig,
  call: unknown,
  deps: Required<Pick<MonitorRunDeps, 'isAlreadyProcessed' | 'markProcessed' | 'notifier'>>
): Promise<'already_processed' | 'processed_alert_sent' | 'processed_no_alert'> {
  const input = mapLeapingCallToNotifierInput(call);
  if (!input?.call_id || !isTerminalStatus(input.call_status)) {
    return 'processed_no_alert';
  }

  if (deps.isAlreadyProcessed(input.call_id)) {
    return 'already_processed';
  }

  const result = await deps.notifier(input, {
    provider: config.ALERT_EMAIL_PROVIDER,
    apiKey: config.RESEND_API_KEY,
    from: config.ALERT_EMAIL_FROM,
    defaultTo: config.ALERT_EMAIL_TO,
    subjectPrefix: config.ALERT_EMAIL_SUBJECT_PREFIX,
    gmailUser: config.GMAIL_SMTP_USER,
    gmailAppPassword: config.GMAIL_SMTP_APP_PASSWORD,
    llmEnabled: config.ALERT_EMAIL_LLM_ENABLED,
    openaiApiKey: config.OPENAI_API_KEY,
    openaiModel: config.OPENAI_MODEL,
    openaiBaseUrl: config.OPENAI_BASE_URL,
  });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  deps.markProcessed(input.call_id);
  return result.alert_required ? 'processed_alert_sent' : 'processed_no_alert';
}

export async function runPostCallMonitorCycle(
  config: AppConfig,
  deps: MonitorRunDeps = {}
): Promise<PostCallMonitorRunSummary> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const isAlreadyProcessed = deps.isAlreadyProcessed ?? hasProcessedPostCallAlert;
  const markProcessed = deps.markProcessed ?? markProcessedPostCallAlert;
  const notifier = deps.notifier ?? runPostCallEmailNotifier;
  const now = deps.now ?? (() => new Date());

  const startedAt = now().toISOString();
  const calls = await fetchRecentCalls(config, fetchImpl, now());

  let terminalCallsSeen = 0;
  let alreadyProcessed = 0;
  let processedNow = 0;
  let alertsSent = 0;
  let alertsSkipped = 0;

  for (const call of calls) {
    const mapped = mapLeapingCallToNotifierInput(call);
    if (!mapped?.call_id || !isTerminalStatus(mapped.call_status)) {
      continue;
    }

    terminalCallsSeen += 1;
    const outcome = await runSingleCall(config, call, {
      isAlreadyProcessed,
      markProcessed,
      notifier,
    });

    if (outcome === 'already_processed') {
      alreadyProcessed += 1;
      continue;
    }

    processedNow += 1;
    if (outcome === 'processed_alert_sent') {
      alertsSent += 1;
    } else {
      alertsSkipped += 1;
    }
  }

  return {
    ok: true,
    fetched_calls: calls.length,
    terminal_calls_seen: terminalCallsSeen,
    already_processed: alreadyProcessed,
    processed_now: processedNow,
    alerts_sent: alertsSent,
    alerts_skipped: alertsSkipped,
    started_at: startedAt,
    finished_at: now().toISOString(),
  };
}

export function getPostCallMonitorState(): PostCallMonitorState {
  return { ...monitorState };
}

export function startPostCallMonitor(config: AppConfig): { stop: () => void } | null {
  if (!config.POST_CALL_MONITOR_ENABLED) {
    monitorState = {
      ...monitorState,
      enabled: false,
      interval_seconds: null,
      configured_agent_id: null,
    };
    return null;
  }

  monitorState = {
    ...monitorState,
    enabled: true,
    interval_seconds: config.POST_CALL_MONITOR_INTERVAL_SECONDS,
    configured_agent_id: config.LEAPING_AGENT_ID ?? null,
  };

  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const runCycle = async () => {
    if (stopped || monitorState.running) return;

    monitorState = {
      ...monitorState,
      running: true,
      last_run_started_at: new Date().toISOString(),
      last_error: null,
    };

    try {
      const summary = await runPostCallMonitorCycle(config);
      monitorState = {
        ...monitorState,
        running: false,
        last_run_ok: true,
        last_run_finished_at: summary.finished_at,
        last_summary: summary,
      };
      console.log(JSON.stringify({
        level: 'info',
        event: 'post_call_monitor_cycle_complete',
        summary,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      monitorState = {
        ...monitorState,
        running: false,
        last_run_ok: false,
        last_run_finished_at: new Date().toISOString(),
        last_error: message,
      };
      console.error(JSON.stringify({
        level: 'error',
        event: 'post_call_monitor_cycle_failed',
        message,
      }));
    }
  };

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, config.POST_CALL_MONITOR_INTERVAL_SECONDS * 1000);

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
