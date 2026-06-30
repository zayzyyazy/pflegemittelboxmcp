import test from 'node:test';
import assert from 'node:assert/strict';
import type { AppConfig } from './config.js';
import {
  mapLeapingCallToNotifierInput,
  runPostCallMonitorCycle,
} from './post-call-monitor.js';

function makeConfig(): AppConfig {
  return {
    PORT: 3001,
    NODE_ENV: 'test',
    ENV_LABEL: 'test',
    PUBLIC_BASE_URL: 'http://localhost:3001',
    POST_CALL_MONITOR_ENABLED: true,
    POST_CALL_MONITOR_INTERVAL_SECONDS: 60,
    POST_CALL_MONITOR_LOOKBACK_MINUTES: 15,
    POST_CALL_MONITOR_FETCH_LIMIT: 100,
    LEAPING_API_BASE_URL: 'https://api.leaping.ai/v1',
    LEAPING_API_USERNAME: 'user@example.com',
    LEAPING_API_PASSWORD: 'secret',
    LEAPING_API_CLIENT_ID: undefined,
    LEAPING_API_CLIENT_SECRET: undefined,
    LEAPING_AGENT_ID: 'agent_123',
    ALERT_EMAIL_PROVIDER: 'resend',
    ALERT_EMAIL_FROM: 'alerts@example.com',
    ALERT_EMAIL_TO: 'ops@example.com',
    ALERT_EMAIL_SUBJECT_PREFIX: '[Test]',
    RESEND_API_KEY: 're_test',
    GMAIL_SMTP_USER: undefined,
    GMAIL_SMTP_APP_PASSWORD: undefined,
  };
}

test('maps a Leaping call payload into notifier input', () => {
  const mapped = mapLeapingCallToNotifierInput({
    id: 'call_123',
    status: 'completed',
    created_at: '2026-06-25T12:00:00Z',
    ended_at: '2026-06-25T12:03:10Z',
    transcript: 'Customer asked for help.',
    authenticated: true,
    function_calls: [{ name: 'check_birthday', timestamp: '2026-06-25T12:01:00Z' }],
    transitions: [{ from: 'verification', to: 'weiter', timestamp: '2026-06-25T12:02:00Z' }],
  });

  assert.deepEqual(mapped, {
    call_id: 'call_123',
    call_date: '2026-06-25T12:00:00Z',
    duration_seconds: 190,
    call_status: 'completed',
    verification_successful: true,
    transcript_text: 'Customer asked for help.',
    function_calls: [{ name: 'check_birthday', arguments: undefined, result: undefined, error: undefined, timestamp: '2026-06-25T12:01:00Z' }],
    transitions: [{ from: 'verification', to: 'weiter', timestamp: '2026-06-25T12:02:00Z' }],
    detected_events: {
      customer_frustrated: undefined,
      customer_requested_human: undefined,
      technical_issue_mentioned: undefined,
      repeated_birthday_requests: undefined,
      repeated_vnr_requests: undefined,
      repeated_address_requests: undefined,
      silence_or_dead_air: undefined,
    },
  });
});

test('monitor cycle logs in, fetches recent calls, and sends one alert per new qualifying call', async () => {
  const seenRequests: Array<{ url: string; method: string }> = [];
  const processed = new Set<string>();

  const summary = await runPostCallMonitorCycle(makeConfig(), {
    fetchImpl: async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      seenRequests.push({ url, method });

      if (url.endsWith('/login')) {
        return new Response(
          JSON.stringify({ access_token: 'token_123', expires_in: 900 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url.includes('/calls/?')) {
        return new Response(
          JSON.stringify({
            calls: [
              {
                id: 'call_alert',
                status: 'completed',
                duration_seconds: 181,
                verification_successful: false,
                created_at: '2026-06-25T12:00:00Z',
              },
              {
                id: 'call_ok',
                status: 'completed',
                duration_seconds: 45,
                verification_successful: true,
                created_at: '2026-06-25T12:05:00Z',
              },
              {
                id: 'call_live',
                status: 'in_progress',
                duration_seconds: 20,
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`Unexpected URL: ${url}`);
    },
    isAlreadyProcessed: (callId) => processed.has(callId),
    markProcessed: (callId) => {
      processed.add(callId);
    },
    notifier: async (input) => ({
      ok: true,
      alert_required: input.call_id === 'call_alert',
      email_attempted: input.call_id === 'call_alert',
      email_sent: input.call_id === 'call_alert',
      provider: input.call_id === 'call_alert' ? 'resend' : 'none',
      call_id: input.call_id ?? null,
      call_date: input.call_date ?? null,
      duration_label: null,
      biggest_problem: input.call_id === 'call_alert' ? 'Long verification loop' : 'No alert',
      subject: input.call_id === 'call_alert' ? 'Alert' : 'No alert',
      email_text: '',
      message_id: input.call_id === 'call_alert' ? 'msg_1' : null,
      reason: 'ok',
      safety_flags: [],
    }),
    now: () => new Date('2026-06-25T12:10:00Z'),
  });

  assert.equal(summary.ok, true);
  assert.equal(summary.fetched_calls, 3);
  assert.equal(summary.terminal_calls_seen, 2);
  assert.equal(summary.already_processed, 0);
  assert.equal(summary.processed_now, 2);
  assert.equal(summary.alerts_sent, 1);
  assert.equal(summary.alerts_skipped, 1);
  assert.deepEqual([...processed].sort(), ['call_alert', 'call_ok']);
  assert.equal(seenRequests.length, 2);
  assert.equal(seenRequests[0]?.method, 'POST');
  assert.equal(seenRequests[1]?.method, 'GET');
});
