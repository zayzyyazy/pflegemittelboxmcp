import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerificationBrain } from './verification-brain.js';

test('asks for birthday after successful phone lookup', () => {
  const result = runVerificationBrain({
    phone_lookup_found: true,
    birthday_customer: undefined,
  });

  assert.equal(result.next_action, 'ASK_BIRTHDAY');
  assert.equal(result.allowed_to_call_function, false);
});

test('calls address lookup when PLZ house number and birthday are complete', () => {
  const result = runVerificationBrain({
    phone_lookup_found: false,
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(result.function_to_call, 'get_customer_by_plz_geb');
});

test('transitions directly after address lookup found customer', () => {
  const result = runVerificationBrain({
    get_customer_by_plz_geb_result: 'found',
    lookup_path: 'address',
  });

  assert.equal(result.next_action, 'TRANSITION_WEITER');
  assert.equal(result.transition_to, 'weiter');
});

test('falls back to VNR after two failed address lookups', () => {
  const result = runVerificationBrain({
    get_customer_by_plz_geb_result: 'not_found',
    attempt_counts: { address_lookup_attempts: 2 },
  });

  assert.equal(result.next_action, 'ASK_VNR');
});

test('requires VNR confirmation before format check or lookup', () => {
  const result = runVerificationBrain({
    lookup_path: 'vnr',
    vnr_candidate: 'L039359923',
    vnr_confirmed: false,
  });

  assert.equal(result.next_action, 'CONFIRM_VNR');
});

test('blocks birthday check when birthday_system is missing', () => {
  const result = runVerificationBrain({
    phone_lookup_found: true,
    birthday_customer: '1948-05-03',
    birthday_system_available: false,
  });

  assert.equal(result.next_action, 'TECHNICAL_ESCALATION');
  assert.deepEqual(result.safety_flags, ['missing_birthday_system', 'block_birthday_loop']);
});

test('escalates when check_birthday reports missing birthday_system', () => {
  const result = runVerificationBrain({
    check_birthday_error: 'Missing field value: birthday_system',
  });

  assert.equal(result.next_action, 'TECHNICAL_ESCALATION');
  assert.equal(result.ok, false);
});

test('prevents more than two birthday check attempts', () => {
  const result = runVerificationBrain({
    phone_lookup_found: true,
    birthday_customer: '1948-05-03',
    check_birthday_result: 'failed',
    attempt_counts: { birthday_check_attempts: 2 },
  });

  assert.equal(result.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('looks up customer by confirmed valid VNR', () => {
  const result = runVerificationBrain({
    lookup_path: 'vnr',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    vnr_valid_shape: true,
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.equal(result.function_to_call, 'get_customer_by_insurance_number');
});
