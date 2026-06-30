import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import {
  leapingResponseContainsForbiddenDebug,
  splitVerificationBrainResponse,
  toDashboardVerificationBrainResponse,
  toLeapingVerificationBrainResponse,
  toLoggedVerificationBrainResponse,
} from './verification-brain-response.js';
import {
  extractMcpCallLogMeta,
  outputContainsRawCustomerRecord,
  sanitizeMcpToolInput,
  sanitizeMcpToolOutput,
  sanitizeVerificationBrainInput,
} from './verification-brain-sanitize.js';
import { getLogs, logCall } from '../db.js';

const FORBIDDEN_CONTROLLER_KEYS = [
  'stored_values',
  'attempts',
  'state_summary',
  'reason',
  'missing_fields',
  'safety_flags',
  'next_action',
  'debug',
];

test('1. Marie-facing controller response is minimal', () => {
  const internal = runVerificationAddressBrain({
    session_id: 'minimal-controller-001',
    latest_customer_input: '41372',
  });
  const leaping = toLeapingVerificationBrainResponse(internal);

  for (const key of FORBIDDEN_CONTROLLER_KEYS) {
    assert.equal(key in leaping, false, `controller must not include ${key}`);
  }
  assert.equal(leapingResponseContainsForbiddenDebug(leaping).length, 0);
  assert.ok(leaping.session_id_received);
  assert.equal(leaping.active_brain, 'address');
});

test('2. address lookup found: customer object sanitized in logs, not in Marie response', () => {
  const customerObject = {
    id: '107484',
    birthday: '1956-03-16',
    mail: 'secret@example.com',
    name: 'Max Mustermann',
  };
  const internal = runVerificationAddressBrain({
    session_id: 'sanitize-found-002',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: customerObject,
  });
  const leaping = toLeapingVerificationBrainResponse(internal);
  const logged = toLoggedVerificationBrainResponse(internal);
  const sanitizedInput = sanitizeVerificationBrainInput({
    session_id: 'sanitize-found-002',
    get_customer_by_plz_geb_result: customerObject,
  });

  assert.equal(internal.stored_values?.get_customer_by_plz_geb_result, 'found');
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'weiter');
  assert.equal(outputContainsRawCustomerRecord(leaping), false);
  assert.equal((sanitizedInput as { get_customer_by_plz_geb_result: string }).get_customer_by_plz_geb_result, 'found');
  assert.equal(logged.debug.stored_values?.get_customer_by_plz_geb_result, 'found');
  assert.equal(outputContainsRawCustomerRecord(logged), false);
});

test('3. address lookup not_found object normalizes to not_found without raw storage', () => {
  const internal = runVerificationAddressBrain({
    session_id: 'sanitize-notfound-003',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' },
  });
  const sanitizedInput = sanitizeVerificationBrainInput({
    get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' },
  });
  const logged = toLoggedVerificationBrainResponse(internal);

  assert.equal(internal.stored_values?.get_customer_by_plz_geb_result, 'not_found');
  assert.equal((sanitizedInput as { get_customer_by_plz_geb_result: string }).get_customer_by_plz_geb_result, 'not_found');
  assert.equal(logged.debug.stored_values?.get_customer_by_plz_geb_result, 'not_found');
  assert.equal(typeof logged.debug.stored_values?.get_customer_by_plz_geb_result, 'string');
});

test('4. VNR lookup found: no raw customer object exposed', () => {
  const internal = runVerificationVnrBrain({
    session_id: 'sanitize-vnr-found-004',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: { id: '999', birthday: '1956-03-16', mail: 'x@y.z' },
  });
  const leaping = toLeapingVerificationBrainResponse(internal);
  const logged = toLoggedVerificationBrainResponse(internal);

  assert.equal(internal.next_action, 'ASK_BIRTHDAY');
  assert.equal(outputContainsRawCustomerRecord(leaping), false);
  assert.equal(logged.debug.stored_values?.get_customer_by_insurance_number_result, 'found');
  assert.equal(outputContainsRawCustomerRecord(logged), false);
});

test('5. check_birthday boolean normalizes to success/failed without raw internals', () => {
  const success = runVerificationPhoneBrain({
    session_id: 'sanitize-bday-success-005',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: true as unknown as 'success',
  });
  const failed = runVerificationPhoneBrain({
    session_id: 'sanitize-bday-failed-005b',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: false as unknown as 'failed',
    birthday_check_attempts: 1,
  });
  const sanitizedSuccessInput = sanitizeVerificationBrainInput({ check_birthday_result: true });
  const sanitizedFailedInput = sanitizeVerificationBrainInput({ check_birthday_result: false });

  assert.equal(success.next_action, 'TRANSITION_WEITER');
  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
  assert.equal((sanitizedSuccessInput as { check_birthday_result: string }).check_birthday_result, 'success');
  assert.equal((sanitizedFailedInput as { check_birthday_result: string }).check_birthday_result, 'failed');
  assert.equal(outputContainsRawCustomerRecord(toLeapingVerificationBrainResponse(success)), false);
});

test('6. session log extraction stores session_id, active_brain, action_type, function_name, transition_name', () => {
  const sessionId = `test-session-meta-${Date.now()}`;
  const internal = runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  const logged = toLoggedVerificationBrainResponse(internal);
  const meta = extractMcpCallLogMeta(
    'pmb_verification_address_brain',
    { session_id: sessionId },
    logged,
    null
  );

  assert.equal(meta.session_id, sessionId);
  assert.equal(meta.active_brain, 'address');
  assert.equal(meta.action_type, 'CALL_FUNCTION');
  assert.equal(meta.function_name, 'get_customer_by_plz_geb');
  assert.equal(meta.status, 'ok');
});

test('7. dashboard logs can filter by session_id chronologically', () => {
  const sessionId = `test-session-filter-${Date.now()}`;
  const firstLogged = toLoggedVerificationBrainResponse(
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: '41372' })
  );
  const secondLogged = toLoggedVerificationBrainResponse(
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: '100' })
  );

  logCall('pmb_verification_address_brain', { session_id: sessionId, latest_customer_input: '41372' }, firstLogged, null, 1);
  logCall('pmb_verification_address_brain', { session_id: sessionId, latest_customer_input: '100' }, secondLogged, null, 2);

  const rows = getLogs(50, sessionId);
  assert.ok(rows.length >= 2);
  assert.equal(rows[0].session_id, sessionId);
  assert.equal(rows[rows.length - 1].session_id, sessionId);
  assert.ok(rows[0].id <= rows[rows.length - 1].id);
});

test('8. customer-provided birthday is allowed in debug', () => {
  const dashboard = toDashboardVerificationBrainResponse(
    runVerificationAddressBrain({
      session_id: 'sanitize-customer-bday-008',
      latest_customer_input: '16.03.1956',
      plz: '41372',
      house_number: '100',
    })
  );

  assert.equal(dashboard.debug.stored_values?.birthday_customer, '1956-03-16');
  assert.equal(outputContainsRawCustomerRecord(dashboard.controller), false);
});

test('9. system-provided birthday from API is not exposed in sanitized output', () => {
  const logged = toLoggedVerificationBrainResponse(
    runVerificationAddressBrain({
      session_id: 'sanitize-system-bday-009',
      plz: '41372',
      house_number: '100',
      birthday_customer: '1956-03-16',
      get_customer_by_plz_geb_result: { id: '107484', birthday: '1956-03-16' },
    })
  );
  const sanitizedOutput = sanitizeMcpToolOutput('pmb_verification_address_brain', logged);

  assert.equal(outputContainsRawCustomerRecord(sanitizedOutput), false);
  assert.equal(JSON.stringify(sanitizedOutput).includes('107484'), false);
  assert.equal(JSON.stringify(sanitizedOutput).includes('secret'), false);
});

test('10. CALL_FUNCTION controller still includes normalized function_arguments', () => {
  const { controller } = splitVerificationBrainResponse(
    runVerificationAddressBrain({
      session_id: 'sanitize-fn-args-010',
      plz: '41372',
      house_number: '100',
      birthday_customer: '1956-03-16',
    })
  );

  assert.equal(controller.action_type, 'CALL_FUNCTION');
  assert.deepEqual(controller.function_arguments, { plz: '41372', hnr: '100', bday: '1956-03-16' });

  const phoneController = toLeapingVerificationBrainResponse(
    runVerificationPhoneBrain({
      session_id: 'sanitize-fn-args-phone',
      phone_lookup_found: true,
      birthday_customer: '1956-03-16',
      birthday_system_available: true,
    })
  );
  assert.deepEqual(phoneController.function_arguments, { birthday: '1956-03-16' });

  const vnrController = toLeapingVerificationBrainResponse(
    runVerificationVnrBrain({
      session_id: 'sanitize-fn-args-vnr',
      vnr_candidate: 'L039359923',
      vnr_confirmed: true,
    })
  );
  assert.deepEqual(vnrController.function_arguments, { insurance_number: 'L039359923' });
});

test('stateless controller may include known_values_required_next_call', () => {
  const leaping = toLeapingVerificationBrainResponse(
    runVerificationAddressBrain({ latest_customer_input: '41372' })
  );

  assert.equal(leaping.session_mode, 'stateless');
  assert.equal(leaping.known_values_required_next_call?.plz, '41372');
  assert.equal('stored_values' in leaping, false);
});
