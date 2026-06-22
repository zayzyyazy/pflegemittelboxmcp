import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPostCallAlertEmail,
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
  assert.ok(sentPayload);
  const payload = sentPayload as SendEmailPayload;
  assert.equal(payload.to, 'ops@example.com');
  assert.match(payload.subject, /\[Test Bot\]/);
  assert.match(payload.text, /call_send/);
});
