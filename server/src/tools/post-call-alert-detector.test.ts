import test from 'node:test';
import assert from 'node:assert/strict';
import { runPostCallAlertDetector } from './post-call-alert-detector.js';

test('alerts on long call without successful verification', () => {
  const result = runPostCallAlertDetector({
    duration_seconds: 181,
    verification_successful: false,
    call_status: 'completed',
  });

  assert.equal(result.alert_required, true);
  assert.equal(result.alert_type, 'LONG_FAILED_VERIFICATION');
});

test('alerts on 3-minute unverified call even when status is not completed', () => {
  const result = runPostCallAlertDetector({
    duration_seconds: 181,
    verification_successful: false,
    call_status: 'transferred',
  });

  assert.equal(result.alert_required, true);
  assert.equal(result.alert_type, 'LONG_FAILED_VERIFICATION');
});

test('alerts on missing birthday_system function error', () => {
  const result = runPostCallAlertDetector({
    function_calls: [{ name: 'check_birthday', error: 'Missing field value: birthday_system' }],
  });

  assert.equal(result.alert_type, 'MISSING_BIRTHDAY_SYSTEM');
  assert.equal(result.severity, 'critical');
});

test('alerts on customer frustration event', () => {
  const result = runPostCallAlertDetector({
    detected_events: { customer_frustrated: true },
  });

  assert.equal(result.alert_type, 'CUSTOMER_FRUSTRATED');
});

test('alerts on dropped or failed calls', () => {
  const dropped = runPostCallAlertDetector({ call_status: 'dropped' });
  assert.equal(dropped.alert_type, 'DROPPED_OR_FAILED_CALL');
});

test('alerts on repeated authentication loops', () => {
  const result = runPostCallAlertDetector({
    detected_events: { repeated_birthday_requests: 3 },
  });

  assert.equal(result.alert_type, 'REPEATED_AUTHENTICATION');
});

test('alerts when customer requested human and no transfer happened', () => {
  const result = runPostCallAlertDetector({
    detected_events: { customer_requested_human: true },
    call_status: 'completed',
    transitions: [{ from: 'verification', to: 'weiter' }],
  });

  assert.equal(result.alert_type, 'TRANSFER_REQUEST_NOT_HANDLED');
});

test('falls back to no alert when no rule matches', () => {
  const result = runPostCallAlertDetector({
    call_status: 'completed',
    verification_successful: true,
  });

  assert.equal(result.alert_type, 'NONE');
  assert.equal(result.alert_required, false);
});
