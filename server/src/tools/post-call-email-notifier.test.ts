import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPostCallAlertEmail,
  draftPostCallAlertEmailWithLlm,
  runPostCallEmailNotifier,
  type SendEmailPayload,
} from './post-call-email-notifier.js';

test('builds a human-readable email with call metadata and biggest problem', () => {
  const built = buildPostCallAlertEmail({
    call_id: 'call_123',
    call_date: '2026-06-22T10:15:00Z',
    duration_seconds: 487,
    verification_successful: false,
    call_status: 'completed',
  });

  assert.equal(built.alert_required, true);
  assert.match(built.subject, /Long call without successful verification/i);
  assert.match(built.email_text, /Call ID: call_123/);
  assert.match(built.email_text, /Call date: 2026-06-22T10:15:00Z/);
  assert.match(built.email_text, /Duration: 8m 07s/);
  assert.match(built.email_text, /Biggest problem:/);
});

test('does not attempt to send when no alert is required', async () => {
  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_ok',
      call_status: 'completed',
      verification_successful: true,
    },
    {}
  );

  assert.equal(result.alert_required, false);
  assert.equal(result.email_attempted, false);
  assert.equal(result.email_sent, false);
});

test('returns configuration error when alert exists but email config is missing', async () => {
  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_missing_cfg',
      duration_seconds: 420,
      verification_successful: false,
      call_status: 'completed',
    },
    {}
  );

  assert.equal(result.ok, false);
  assert.equal(result.email_sent, false);
  assert.match(result.reason, /configuration is incomplete/i);
  assert.match(result.safety_flags.join(','), /missing_email_config/);
});

test('supports dry run previews without sending', async () => {
  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_preview',
      duration_seconds: 420,
      verification_successful: false,
      call_status: 'completed',
      dry_run: true,
    },
    {
      apiKey: 're_test',
      from: 'alerts@example.com',
      defaultTo: 'ops@example.com',
    }
  );

  assert.equal(result.ok, true);
  assert.equal(result.email_attempted, false);
  assert.equal(result.email_sent, false);
  assert.match(result.reason, /Dry run mode/i);
});

test('sends through injected sender when configured', async () => {
  let sentPayload: SendEmailPayload | null = null;

  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_send',
      duration_seconds: 420,
      verification_successful: false,
      call_status: 'completed',
      call_date: '2026-06-22T10:15:00Z',
    },
    {
      apiKey: 're_test',
      from: 'alerts@example.com',
      defaultTo: 'ops@example.com',
      subjectPrefix: '[Test Bot]',
    },
    async (payload) => {
      sentPayload = payload;
      return { id: 'msg_123', provider: 'gmail' };
    }
  );

  assert.equal(result.email_attempted, true);
  assert.equal(result.email_sent, true);
  assert.equal(result.message_id, 'msg_123');
  if (!sentPayload) {
    throw new Error('Expected sentPayload to be captured by the fake sender.');
  }
  const payload: SendEmailPayload = sentPayload;
  assert.equal(payload.to, 'ops@example.com');
  assert.match(payload.subject, /\[Test Bot\]/);
  assert.match(payload.text, /call_send/);
});

test('uses LLM drafted subject and body when configured', async () => {
  let sentPayload: SendEmailPayload | null = null;

  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_llm',
      duration_seconds: 420,
      verification_successful: false,
      call_status: 'completed',
    },
    {
      apiKey: 're_test',
      from: 'alerts@example.com',
      defaultTo: 'ops@example.com',
      llmEnabled: true,
      openaiApiKey: 'sk-test',
    },
    async (payload) => {
      sentPayload = payload;
      return { id: 'msg_llm', provider: 'gmail' };
    },
    async () => ({
      subject: 'LLM Betreff',
      email_text: 'LLM Mailtext',
    })
  );

  assert.equal(result.email_sent, true);
  assert.equal(result.subject, 'LLM Betreff');
  assert.equal(result.email_text, 'LLM Mailtext');
  assert.equal(sentPayload?.subject, 'LLM Betreff');
  assert.equal(sentPayload?.text, 'LLM Mailtext');
});

test('falls back to plain text email when LLM drafting fails', async () => {
  let sentPayload: SendEmailPayload | null = null;

  const result = await runPostCallEmailNotifier(
    {
      call_id: 'call_fallback',
      duration_seconds: 420,
      verification_successful: false,
      call_status: 'completed',
    },
    {
      apiKey: 're_test',
      from: 'alerts@example.com',
      defaultTo: 'ops@example.com',
      llmEnabled: true,
      openaiApiKey: 'sk-test',
    },
    async (payload) => {
      sentPayload = payload;
      return { id: 'msg_fallback', provider: 'gmail' };
    },
    async () => {
      throw new Error('LLM unavailable');
    }
  );

  assert.equal(result.email_sent, true);
  assert.match(result.subject, /Pflegemittelbox Alert/i);
  assert.match(result.email_text, /Call ID: call_fallback/);
  assert.match(sentPayload?.text ?? '', /Call ID: call_fallback/);
});

test('draftPostCallAlertEmailWithLlm parses structured OpenAI response text', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        output: [
          {
            type: 'message',
            content: [
              {
                type: 'output_text',
                text: JSON.stringify({
                  subject: 'Kurzer Betreff',
                  email_text: 'Sauberer Mailtext',
                }),
              },
            ],
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )) as typeof fetch;

  try {
    const drafted = await draftPostCallAlertEmailWithLlm(
      {
        call_id: 'call_openai',
        duration_seconds: 220,
        verification_successful: false,
        call_status: 'dropped',
      },
      buildPostCallAlertEmail({
        call_id: 'call_openai',
        duration_seconds: 220,
        verification_successful: false,
        call_status: 'dropped',
      }),
      {
        openaiApiKey: 'sk-test',
        openaiModel: 'gpt-4.1-mini',
      }
    );

    assert.equal(drafted.subject, 'Kurzer Betreff');
    assert.equal(drafted.email_text, 'Sauberer Mailtext');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
