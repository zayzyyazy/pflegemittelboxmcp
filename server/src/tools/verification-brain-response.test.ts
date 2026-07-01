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
} from './verification-brain-response.js';

test('1. controller includes normalized function_arguments for address lookup', () => {
  const result = runVerificationAddressBrain({
    session_id: 'controller-address-lookup',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  const { controller } = splitVerificationBrainResponse(result);

  assert.equal(controller.action_type, 'CALL_FUNCTION');
  assert.equal(controller.function_name, 'get_customer_by_plz_geb');
  assert.deepEqual(controller.function_arguments, { plz: '41372', hnr: '100', bday: '1956-03-16' });
  assert.equal(controller.active_brain, 'address');
});

test('2. controller includes check_birthday function_arguments', () => {
  const result = runVerificationPhoneBrain({
    session_id: 'controller-phone-birthday',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });
  const { controller } = splitVerificationBrainResponse(result);

  assert.equal(controller.action_type, 'CALL_FUNCTION');
  assert.equal(controller.function_name, 'check_birthday');
  assert.deepEqual(controller.function_arguments, { birthday: '1956-03-16' });
  assert.equal(controller.active_brain, 'phone');
});

test('3. controller includes VNR function_arguments for customer lookup', () => {
  const result = runVerificationVnrBrain({
    session_id: 'controller-vnr-format',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  const { controller } = splitVerificationBrainResponse(result);

  assert.equal(controller.action_type, 'CALL_FUNCTION');
  assert.equal(controller.function_name, 'get_customer_by_insurance_number');
  assert.deepEqual(controller.function_arguments, { insurance_number: 'L039359923' });
  assert.equal(controller.active_brain, 'vnr');
});

test('4. debug still contains stored_values, attempts, and reason for dashboard path', () => {
  const result = runVerificationAddressBrain({
    session_id: 'controller-dashboard-debug',
    latest_customer_input: '41372',
  });
  const dashboard = toDashboardVerificationBrainResponse(result);

  assert.ok(dashboard.debug.stored_values);
  assert.equal(dashboard.debug.stored_values?.plz, '41372');
  assert.ok(dashboard.debug.attempts);
  assert.ok(dashboard.debug.reason.length > 0);
  assert.equal(dashboard.debug.next_action, result.next_action);
  assert.ok(dashboard.controller.session_id_received);
});

test('5. Leaping-facing response does not expose raw lookup result or full customer object', () => {
  const internal = runVerificationAddressBrain({
    session_id: 'controller-leaping-slim',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: { id: 'cust-999', name: 'Max Mustermann', birthday: '1956-03-16' },
  });
  const leaping = toLeapingVerificationBrainResponse(internal);
  const forbidden = leapingResponseContainsForbiddenDebug(leaping);

  assert.deepEqual(internal.stored_values?.get_customer_by_plz_geb_result, {
    found: true,
    id: 'cust-999',
    birthday_present: true,
  });
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'weiter');
  assert.equal(forbidden.length, 0, `Leaping response leaked debug keys: ${forbidden.join(', ')}`);
  assert.equal('stored_values' in leaping, false);
  assert.equal('customer_id' in leaping, false);
  assert.equal('debug' in leaping, false);
});
