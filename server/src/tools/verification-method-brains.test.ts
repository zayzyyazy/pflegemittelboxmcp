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
  assert.equal(result.session_mode, 'stateless');
  assert.ok(result.safety_flags.includes('missing_session_id'));
});

test('phone path stores birthday and handles missing year across session calls', () => {
  const first = runVerificationPhoneBrain({
    session_id: 'phone-session-missing-year',
    phone_lookup_found: true,
    latest_customer_input: '16. März',
  });

  assert.equal(first.next_action, 'ASK_BIRTH_YEAR');
  assert.equal(first.session_id, 'phone-session-missing-year');
  assert.equal(first.stored_values?.birthday_customer, null);

  const second = runVerificationPhoneBrain({
    session_id: 'phone-session-missing-year',
    latest_customer_input: 'neunzehnhundertsechsundfünfzig',
    phone_lookup_found: true,
    birthday_system_available: true,
  });

  assert.equal(second.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(second.stored_values?.birthday_customer, '1956-03-16');
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

test('address path parses latest utterance and normalizes house number across session turns', () => {
  const sessionId = 'address-all-in-one-session';
  const first = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Meine Postleitzahl ist vier eins drei sieben zwei',
  });
  assert.equal(first.next_action, 'ASK_HOUSE_NUMBER');
  assert.equal(first.stored_values?.plz, '41372');
  assert.equal(first.stored_values?.house_number, null);

  const second = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Hausnummer hundert B',
  });
  assert.equal(second.next_action, 'ASK_BIRTHDAY');
  assert.equal(second.stored_values?.house_number, '100');

  const third = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'geboren am 16.03.1956',
  });
  assert.equal(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(third.function_to_call, 'get_customer_by_plz_geb');
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

test('address path stores PLZ, house number, and birthday across session calls', () => {
  const sessionId = 'address-session-stepwise';

  const first = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Meine Postleitzahl ist 41372',
    phone_lookup_found: false,
  });
  assert.equal(first.next_action, 'ASK_HOUSE_NUMBER');
  assert.equal(first.stored_values?.plz, '41372');

  const second = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Hausnummer 100',
  });
  assert.equal(second.next_action, 'ASK_BIRTHDAY');
  assert.equal(second.stored_values?.plz, '41372');
  assert.equal(second.stored_values?.house_number, '100');

  const third = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: '16.03.1956',
  });
  assert.equal(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(third.function_to_call, 'get_customer_by_plz_geb');
  assert.deepEqual(third.function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });
  assert.deepEqual(third.leaping_function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
    house_number: '100',
    birthday: '1956-03-16',
  });
  assert.equal(third.stored_values?.plz, '41372');
  assert.equal(third.stored_values?.house_number, '100');
  assert.equal(third.stored_values?.birthday_customer, '1956-03-16');
});

test('address lookup not_found is stored and yes confirmation allows retry lookup', () => {
  const sessionId = 'address-session-retry';

  const first = runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  assert.equal(first.next_action, 'CONFIRM_ADDRESS_VALUES');

  const second = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'ja stimmt',
  });
  assert.equal(second.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(second.function_to_call, 'get_customer_by_plz_geb');
});

test('second address not_found falls back to VNR', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-second-fail',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 2,
  });

  assert.equal(result.next_action, 'FALLBACK_TO_VNR');
});

test('spoken PLZ utterance stores plz only and does not misparse house_number 1372', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-plz-only-guard',
    latest_customer_input: 'vier eins drei sieben zwei',
    phone_lookup_found: false,
  });

  assert.equal(result.next_action, 'ASK_HOUSE_NUMBER');
  assert.equal(result.awaiting_field, 'house_number');
  assert.equal(result.stored_values?.plz, '41372');
  assert.equal(result.stored_values?.house_number, null);
});

test('partial four-digit PLZ is rejected and not stored as house_number while awaiting plz', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-partial-plz',
    latest_customer_input: 'eins drei sieben zwei',
    phone_lookup_found: false,
  });

  assert.equal(result.next_action, 'ASK_PLZ');
  assert.equal(result.awaiting_field, 'plz');
  assert.equal(result.stored_values?.plz, null);
  assert.equal(result.stored_values?.house_number, null);
});

test('partial digits can be stored as house_number only when awaiting house_number', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-awaiting-hnr',
    plz: '41372',
    latest_customer_input: 'eins drei sieben zwei',
  });

  assert.equal(result.next_action, 'ASK_BIRTHDAY');
  assert.equal(result.stored_values?.house_number, '1372');
});

test('einhundert normalizes to house_number 100 only when awaiting house_number', () => {
  const rejected = runVerificationAddressBrain({
    session_id: 'address-einhundert-wrong-field',
    latest_customer_input: 'einhundert',
  });
  assert.equal(rejected.next_action, 'ASK_PLZ');
  assert.equal(rejected.stored_values?.house_number, null);

  const accepted = runVerificationAddressBrain({
    session_id: 'address-einhundert-correct-field',
    plz: '41372',
    latest_customer_input: 'einhundert',
  });
  assert.equal(accepted.next_action, 'ASK_BIRTHDAY');
  assert.equal(accepted.stored_values?.house_number, '100');
});

test('full address sequence with session_id reaches CALL_FUNCTION with normalized args', () => {
  const sessionId = 'address-full-sequence-41372';

  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'vier eins drei sieben zwei',
    phone_lookup_found: false,
  });
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'einhundert',
  });
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Sechzehnter März neunzehnhundertsechsundfünfzig',
  });

  assert.equal(result.action_type, 'CALL_FUNCTION');
  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.deepEqual(result.function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });
});

test('stateless mode returns known_values_required_next_call with parsed values', () => {
  const result = runVerificationAddressBrain({
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    phone_lookup_found: false,
  });

  assert.equal(result.session_mode, 'stateless');
  assert.ok(result.safety_flags.includes('missing_session_id'));
  assert.deepEqual(result.known_values_required_next_call, {
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    phone_lookup_found: 'false',
  });
  assert.equal(result.stored_values?.plz, '41372');
  assert.equal(result.stored_values?.house_number, '100');
  assert.equal(result.stored_values?.birthday_customer, '1956-03-16');
});

test('first address not_found asks for confirmation, second falls back to VNR', () => {
  const sessionId = 'address-not-found-flow';

  const first = runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  assert.equal(first.next_action, 'CONFIRM_ADDRESS_VALUES');
  assert.equal(first.awaiting_field, 'confirm_address');
  assert.equal(first.action_type, 'SAY_ONLY');

  const second = runVerificationAddressBrain({
    session_id: sessionId,
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 2,
  });
  assert.equal(second.next_action, 'FALLBACK_TO_VNR');
  assert.equal(second.action_type, 'SAY_ONLY');
});

test('address path exposes action_type aliases without removing legacy fields', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
  });

  assert.equal(result.action_type, 'CALL_FUNCTION');
  assert.equal(result.active_brain, 'address');
  assert.equal(result.function_name, 'get_customer_by_plz_geb');
  assert.equal(result.function_to_call, 'get_customer_by_plz_geb');
  assert.equal(result.requires_followup_mcp_call, true);
});

test('spoken values normalize before function call when collected stepwise in session', () => {
  const sessionId = 'address-normalized';
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Postleitzahl vier eins drei sieben zwei',
  });
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Hausnummer einhundert',
  });
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Geburtstag 16.03.1956',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.deepEqual(result.function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });
  assert.deepEqual(result.leaping_function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
    house_number: '100',
    birthday: '1956-03-16',
  });
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

test('VNR path stores candidate and accepts yes confirmation in later call', () => {
  const sessionId = 'vnr-session-confirm';

  const first = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });
  assert.equal(first.next_action, 'CONFIRM_VNR');
  assert.equal(first.stored_values?.vnr_candidate, 'L039359923');

  const second = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'ja',
  });
  assert.equal(second.next_action, 'CALL_CHECK_INSURANCE_NUMBER_FORMAT');
  assert.equal(second.stored_values?.vnr_confirmed, true);
});

test('latest_customer_input valid triggers warning and does not become customer speech', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-valid-warning',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    latest_customer_input: 'valid',
  });

  assert.ok(result.safety_flags.includes('latest_customer_input_looks_like_function_result'));
  assert.equal(result.next_action, 'CALL_CHECK_INSURANCE_NUMBER_FORMAT');
});

test('VNR digits-only candidate is rejected as missing leading letter', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-digits-only',
    vnr_candidate: '039359923',
  });

  assert.equal(result.next_action, 'ASK_VNR_LETTER');
});

test('VNR valid format result moves to customer lookup', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-format-valid',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'Valid!' as unknown as 'valid',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
});

test('VNR found customer with stored birthday does not ask birthday again', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-bday-reuse',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });

  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
});

test('stateless behavior still works without session_id', () => {
  const result = runVerificationAddressBrain({
    plz: '22765',
    house_number: '14',
    birthday_customer: '1948-05-03',
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(result.session_id, undefined);
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

test('address brain normalizes object not_found results inside runner', () => {
  const sessionId = 'address-object-not-found';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' },
  });
  assert.equal(result.next_action, 'CONFIRM_ADDRESS_VALUES');
  assert.equal(result.stored_values?.get_customer_by_plz_geb_result, 'not_found');
});

test('phone brain normalizes boolean check_birthday_result inside runner', () => {
  const success = runVerificationPhoneBrain({
    session_id: 'phone-bool-success',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: true as unknown as 'success',
  });
  assert.equal(success.next_action, 'TRANSITION_WEITER');

  const failed = runVerificationPhoneBrain({
    session_id: 'phone-bool-failed',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: false as unknown as 'failed',
  });
  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
});

test('vnr brain normalizes invalid format and not_found lookup objects', () => {
  const invalid = runVerificationVnrBrain({
    session_id: 'vnr-bool-invalid',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: false as unknown as 'invalid',
  });
  assert.equal(invalid.next_action, 'ASK_VNR');

  const sessionId = 'vnr-object-not-found';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
  });
  const notFound = runVerificationVnrBrain({
    session_id: sessionId,
    get_customer_by_insurance_number_result: { error: 'Kein Kunde gefunden' },
  });
  assert.equal(notFound.next_action, 'ASK_VNR');
  assert.equal(notFound.stored_values?.get_customer_by_insurance_number_result, 'not_found');
});

test('check_birthday and insurance calls include function_arguments', () => {
  const phone = runVerificationPhoneBrain({
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });
  assert.deepEqual(phone.function_arguments, { birthday: '1956-03-16' });

  const vnr = runVerificationVnrBrain({
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  assert.deepEqual(vnr.function_arguments, { insurance_number: 'L039359923' });
});

test('address brain surfaces function-result-like safety flag', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-valid-flag',
    latest_customer_input: 'valid',
  });
  assert.ok(result.safety_flags.includes('latest_customer_input_looks_like_function_result'));
});

test('address brain transitions neukunde to nicht_identifiziert', () => {
  const result = runVerificationAddressBrain({
    session_id: 'address-neukunde',
    latest_customer_input: 'Ich bin Neukunde',
  });
  assert.equal(result.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
  assert.equal(result.transition_name, 'nicht_identifiziert');
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
