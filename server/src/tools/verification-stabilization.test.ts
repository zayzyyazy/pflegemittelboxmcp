import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runDebugEchoSessionOnly,
} from './debug-echo-session.js';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './verification-method-router.js';
import {
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import {
  toLeapingLegacyCoreResponse,
} from './verification-brain-response.js';

test('stabilization: phone brain returns legacy instruction shape', () => {
  const result = runVerificationPhoneBrain({ session_id: 'legacy-shape', phone_lookup_found: true });
  assert.equal(result.method, 'phone');
  assert.equal(result.next_action, 'ASK_BIRTHDAY');
  assert.equal(result.allowed_to_call_function, false);
  assert.equal(result.allowed_to_transition, false);
  assert.equal(result.function_to_call, null);
  assert.match(result.say, /Geburtsdatum/);
});

test('stabilization: id_phone coerces to phone_lookup_found=true', () => {
  const coerced = coerceVerificationPhoneBrainInput({ session_id: 'x', id_phone: '107484' });
  assert.equal(coerced.phone_lookup_found, true);
});

test('stabilization: VNR after confirmation requests native format check', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-format',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  assert.equal(result.next_action, 'CALL_CHECK_INSURANCE_NUMBER_FORMAT');
  assert.equal(result.allowed_to_call_function, true);
  assert.equal(result.function_to_call, 'check_insurance_number_format');
});

test('stabilization: VNR spoken birthday sechzen märz fünfzig', () => {
  const sessionId = 'vnr-stt';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'L039359923', vnr_confirmed: true });
  runVerificationVnrBrain({
    session_id: sessionId,
    check_insurance_number_format_result: 'valid',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    get_customer_by_insurance_number_result: 'found',
  });
  const call = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzen märz fünfzig',
    birthday_system_available: true,
  });
  assert.equal(call.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(call.allowed_to_call_function, true);
  assert.equal(call.function_to_call, 'check_birthday');
  assert.deepEqual(call.function_arguments, { birthday: '1950-03-16' });
});

test('stabilization: VNR failed check without stored birthday uses smart retry', () => {
  const sessionId = 'vnr-failed';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'L039359923', vnr_confirmed: true });
  runVerificationVnrBrain({ session_id: sessionId, check_insurance_number_format_result: 'valid' });
  runVerificationVnrBrain({ session_id: sessionId, get_customer_by_insurance_number_result: 'found' });

  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: false,
    })
  );
  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
  assert.match(failed.say, /konnte ich leider nicht bestätigen/);
  assert.notEqual(failed.say, 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.');
});

test('stabilization: router routes id_phone=107484 to phone brain', () => {
  const sessionId = 'router-phone-id';
  const result = runVerificationMethodRouter(
    coerceVerificationMethodRouterInput({
      session_id: sessionId,
      id_phone: '107484',
    })
  );
  assert.equal(result.active_brain, 'phone');
  assert.equal(result.next_brain, 'pmb_verification_phone_brain');
  assert.equal(result.session_id_received, true);
  assert.equal(result.session_mode, 'session');
});

test('stabilization: debug echo session_only reports session mode and id_phone', () => {
  const sessionId = 'echo-session-only';
  const result = runDebugEchoSessionOnly({
    session_id: sessionId,
    id_phone: '107484',
  });
  assert.equal(result.session_id_received, true);
  assert.equal(result.session_mode, 'session');
  assert.equal(result.inferred_phone_lookup_found, true);
  assert.equal(result.received_fields.id_phone, '107484');
});

test('stabilization: Leaping response trims session debug blobs', () => {
  const full = runVerificationPhoneBrain({ session_id: 'trim-test', phone_lookup_found: true });
  const leaping = toLeapingLegacyCoreResponse(full);
  assert.equal(leaping.next_action, 'ASK_BIRTHDAY');
  assert.equal('stored_values' in leaping, false);
  assert.equal('attempts' in leaping, false);
  assert.equal('state_summary' in leaping, false);
  assert.equal('action_type' in leaping, false);
});

test('stabilization: compact VNR E207064360 from latest_customer_input', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-compact',
    latest_customer_input: 'E207064360',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
  assert.match(result.say, /E207064360/);
});

test('stabilization: vnr_raw alone resolves to candidate', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-raw-only',
    vnr_raw: 'E207064360',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
});

test('stabilization: stale ja on lookup-result turn asks birthday normally', () => {
  const sessionId = 'vnr-stale-ja';
  runVerificationVnrBrain({ session_id: sessionId, latest_customer_input: 'E207064360' });
  runVerificationVnrBrain({ session_id: sessionId, latest_customer_input: 'ja' });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'ja',
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
  });
  assert.equal(result.next_action, 'ASK_BIRTHDAY');
  assert.match(result.say, /Geburtsdatum/);
  assert.ok(result.safety_flags.includes('latest_customer_input_ignored_stale_confirmation'));
  assert.ok(!result.safety_flags.includes('birthday_parse_failed'));
});
