import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';

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
