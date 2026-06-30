import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';

test('phone path asks birthday', () => {
  const result = runVerificationPhoneBrain({
    phone_lookup_found: true,
  });

  assert.equal(result.method, 'phone');
  assert.equal(result.next_action, 'ASK_BIRTHDAY');
  assert.deepEqual(result.missing_fields, ['birthday_customer']);
});

test('phone path calls check birthday only when safe', () => {
  const result = runVerificationPhoneBrain({
    phone_lookup_found: true,
    birthday_customer: '1948-05-03',
    birthday_system_available: true,
  });

  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(result.function_to_call, 'check_birthday');
});

test('phone path escalates on missing birthday_system', () => {
  const result = runVerificationPhoneBrain({
    phone_lookup_found: true,
    birthday_customer: '1948-05-03',
    check_birthday_error: 'Missing field value: birthday_system',
  });

  assert.equal(result.next_action, 'TECHNICAL_ESCALATION');
  assert.equal(result.ok, false);
});

test('phone path stops loops after birthday retry limit', () => {
  const result = runVerificationPhoneBrain({
    phone_lookup_found: true,
    birthday_customer: '1948-05-03',
    check_birthday_result: 'failed',
    birthday_check_attempts: 2,
  });

  assert.equal(result.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('phone path asks only for birth year when day and month were given', () => {
  const result = runVerificationPhoneBrain({
    phone_lookup_found: true,
    latest_customer_input: '16. März',
  });

  assert.equal(result.next_action, 'ASK_BIRTH_YEAR');
});

test('address path asks missing PLZ, house number, and birthday', () => {
  assert.equal(runVerificationAddressBrain({}).next_action, 'ASK_PLZ');
  assert.equal(runVerificationAddressBrain({ plz: '22765' }).next_action, 'ASK_HOUSE_NUMBER');
  assert.equal(
    runVerificationAddressBrain({ plz: '22765', house_number: '14' }).next_action,
    'ASK_BIRTHDAY'
  );
});

test('address path calls get_customer_by_plz_geb when complete', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(result.function_to_call, 'get_customer_by_plz_geb');
});

test('address path parses latest utterance and normalizes house number', () => {
  const result = runVerificationAddressBrain({
    latest_customer_input: 'Meine Postleitzahl ist vier eins drei sieben zwei, Hausnummer hundert B, geboren am 16.03.1956',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(result.function_to_call, 'get_customer_by_plz_geb');
});

test('address path transitions weiter after found', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
    get_customer_by_plz_geb_result: 'found',
  });

  assert.equal(result.next_action, 'TRANSITION_WEITER');
  assert.equal(result.transition_to, 'weiter');
});

test('address path never calls check_birthday', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
  });

  assert.notEqual(result.function_to_call, 'check_birthday');
  assert.ok(result.safety_flags.includes('never_call_check_birthday_in_address_path'));
});

test('address path falls back to VNR after two failed lookups', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 2,
  });

  assert.equal(result.next_action, 'FALLBACK_TO_VNR');
});

test('address path reuses previous values when customer just confirms', () => {
  const result = runVerificationAddressBrain({
    latest_customer_input: 'Ja, das stimmt.',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 1,
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
});

test('VNR path confirms VNR before format check', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: false,
  });

  assert.equal(result.next_action, 'CONFIRM_VNR');
});

test('VNR path confirms from latest utterance parsing', () => {
  const result = runVerificationVnrBrain({
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });

  assert.equal(result.next_action, 'CONFIRM_VNR');
});

test('VNR path calls format check before lookup', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  assert.equal(result.next_action, 'CALL_CHECK_INSURANCE_NUMBER_FORMAT');
});

test('VNR path calls customer lookup after valid format', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.equal(result.function_to_call, 'get_customer_by_insurance_number');
});

test('VNR path blocks birthday check before customer lookup', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    birthday_customer: '1948-05-03',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.ok(result.safety_flags.includes('blocked_check_birthday_before_customer_lookup'));
});

test('VNR path treats yes-like reply as confirmation of previous VNR', () => {
  const result = runVerificationVnrBrain({
    latest_customer_input: 'Ja, das stimmt.',
    vnr_candidate: 'L039359923',
    vnr_confirmed: false,
  });

  assert.equal(result.next_action, 'CALL_CHECK_INSURANCE_NUMBER_FORMAT');
});

test('VNR path calls birthday check only after customer lookup found', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
    birthday_customer: '1948-05-03',
    birthday_system_available: true,
  });

  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(result.function_to_call, 'check_birthday');
});

test('VNR path escalates on missing birthday_system', () => {
  const result = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
    birthday_customer: '1948-05-03',
    check_birthday_error: 'Missing field value: birthday_system',
  });

  assert.equal(result.next_action, 'TECHNICAL_ESCALATION');
});

test('VNR path stops loops after attempt limits', () => {
  const lookupLimit = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'not_found',
    vnr_lookup_attempts: 2,
  });
  assert.equal(lookupLimit.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');

  const birthdayLimit = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
    birthday_customer: '1948-05-03',
    check_birthday_result: 'failed',
    birthday_check_attempts: 2,
  });
  assert.equal(birthdayLimit.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('VNR path asks only for birth year when birthday is incomplete', () => {
  const result = runVerificationVnrBrain({
    latest_customer_input: '16. März',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
  });

  assert.equal(result.next_action, 'ASK_BIRTH_YEAR');
});
