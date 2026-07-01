import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';

// Leaping reserved field style: leaping_conversation_id_hex (32-char hex UUID without dashes)
const LEAPING_SESSION_HEX = 'a1b2c3d4e5f6789012345678abcdef01';
const LEAPING_SESSION_HEX_B = 'b2c3d4e5f6789012345678abcdef0123';

test('1. address with leaping_conversation_id_hex-style session persists PLZ, HNR, birthday', () => {
  const first = runVerificationAddressBrain({
    session_id: LEAPING_SESSION_HEX,
    phone_lookup_found: false,
    latest_customer_input: 'vier eins drei sieben zwei',
  });
  assert.equal(first.stored_values?.plz, '41372');
  assert.equal(first.next_action, 'ASK_HOUSE_NUMBER');

  const second = runVerificationAddressBrain({
    session_id: LEAPING_SESSION_HEX,
    latest_customer_input: 'einhundert',
  });
  assert.equal(second.stored_values?.plz, '41372');
  assert.equal(second.stored_values?.house_number, '100');
  assert.equal(second.next_action, 'ASK_BIRTHDAY');

  const third = runVerificationAddressBrain({
    session_id: LEAPING_SESSION_HEX,
    latest_customer_input: '16.03.1956',
  });
  assert.equal(third.stored_values?.birthday_customer, '1956-03-16');
  assert.equal(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
});

test('2. address without session_id is stateless and returns known_values_required_next_call', () => {
  const result = runVerificationAddressBrain({
    phone_lookup_found: false,
    latest_customer_input: '41372',
  });
  assert.equal(result.session_mode, 'stateless');
  assert.equal(result.session_id_received, false);
  assert.ok(result.safety_flags.includes('missing_session_id'));
  assert.equal(result.known_values_required_next_call?.plz, '41372');
});

test('3. address with changing fake call_ IDs does not merge state', () => {
  runVerificationAddressBrain({ session_id: 'call_1', latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: 'call_2', latest_customer_input: '100' });
  const third = runVerificationAddressBrain({ session_id: 'call_3', latest_customer_input: '16.03.1956' });
  assert.notEqual(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(third.stored_values?.plz, null);
});

test('4. address with same stable session across 5 turns does not lose values', () => {
  const sessionId = 'stable-five-turn-session';
  const turns = [
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: '41372' }),
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: '100' }),
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: '16.03.1956' }),
    runVerificationAddressBrain({
      session_id: sessionId,
      get_customer_by_plz_geb_result: { error: 'Kein Kunde gefunden' },
    }),
    runVerificationAddressBrain({ session_id: sessionId, latest_customer_input: 'ja das stimmt' }),
  ];

  assert.equal(turns[0].stored_values?.plz, '41372');
  assert.equal(turns[1].stored_values?.house_number, '100');
  assert.equal(turns[2].stored_values?.birthday_customer, '1956-03-16');
  assert.equal(turns[3].next_action, 'CONFIRM_ADDRESS_VALUES');
  assert.equal(turns[4].next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(turns[4].stored_values?.plz, '41372');
  assert.equal(turns[4].stored_values?.house_number, '100');
  assert.equal(turns[4].stored_values?.birthday_customer, '1956-03-16');
});

test('5. address with two concurrent stable sessions keeps values separate', () => {
  runVerificationAddressBrain({ session_id: LEAPING_SESSION_HEX, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: LEAPING_SESSION_HEX_B, latest_customer_input: '22765' });

  const a = runVerificationAddressBrain({ session_id: LEAPING_SESSION_HEX, latest_customer_input: '100' });
  const b = runVerificationAddressBrain({ session_id: LEAPING_SESSION_HEX_B, latest_customer_input: '14' });

  assert.equal(a.stored_values?.plz, '41372');
  assert.equal(a.stored_values?.house_number, '100');
  assert.equal(b.stored_values?.plz, '22765');
  assert.equal(b.stored_values?.house_number, '14');
});

test('6. address function_arguments uses only plz, hnr, bday', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-fn-args-keys',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  assert.deepEqual(Object.keys(result.function_arguments ?? {}).sort(), ['bday', 'hnr', 'plz']);
});

test('7. address leaping_function_arguments includes aliases', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-fn-args-aliases',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  assert.deepEqual(result.leaping_function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
    house_number: '100',
    birthday: '1956-03-16',
  });
});

test('8. address never sends raw spoken PLZ or HNR in function_arguments', () => {
  const sessionId = 'addr-spoken-normalized-args';
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'vier eins drei sieben zwei',
  });
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'einhundert',
  });
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzehnter März neunzehnhundertsechsundfünfzig',
  });
  assert.match(result.function_arguments?.plz ?? '', /^\d{5}$/);
  assert.match(result.function_arguments?.hnr ?? '', /^\d+$/);
  assert.equal(result.function_arguments?.plz, '41372');
  assert.equal(result.function_arguments?.hnr, '100');
  assert.notEqual(result.function_arguments?.plz, 'vier eins drei sieben zwei');
  assert.notEqual(result.function_arguments?.hnr, 'einhundert');
});

test('9. address spoken PLZ vier eins drei sieben zwei never becomes house_number', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-plz-not-hnr',
    latest_customer_input: 'vier eins drei sieben zwei',
  });
  assert.equal(result.stored_values?.plz, '41372');
  assert.equal(result.stored_values?.house_number, null);
});

test('10. address partial PLZ eins drei sieben zwei while awaiting PLZ is rejected', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-partial-plz',
    latest_customer_input: 'eins drei sieben zwei',
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.equal(result.awaiting_field, 'plz');
  assert.equal(result.stored_values?.plz, null);
  assert.equal(result.stored_values?.house_number, null);
});

test('11. phone with stable session persists birthday until check_birthday result', () => {
  const sessionId = LEAPING_SESSION_HEX;
  const first = runVerificationPhoneBrain({
    session_id: sessionId,
    phone_lookup_found: true,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  assert.equal(first.stored_values?.birthday_customer, '1956-03-16');
  assert.equal(first.next_action, 'CALL_CHECK_BIRTHDAY');

  const second = runVerificationPhoneBrain({
    session_id: sessionId,
    phone_lookup_found: true,
    check_birthday_result: true,
  });
  assert.equal(second.stored_values?.birthday_customer, '1956-03-16');
  assert.equal(second.next_action, 'TRANSITION_WEITER');
});

test('12. phone check_birthday true transitions weiter', () => {
  const result = runVerificationPhoneBrain({
    session_id: 'phone-success',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: true,
  });
  assert.equal(result.action_type, 'TRANSITION');
  assert.equal(result.transition_name, 'weiter');
});

test('13. phone check_birthday false does not transition weiter', () => {
  const result = runVerificationPhoneBrain({
    session_id: 'phone-failed',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: false,
  });
  assert.notEqual(result.transition_name, 'weiter');
  assert.equal(result.next_action, 'ASK_BIRTHDAY');
});

test('14. phone check_birthday birthday_system error escalates safely', () => {
  const result = runVerificationPhoneBrain({
    session_id: 'phone-bday-system-error',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_error: 'Missing field value: birthday_system',
  });
  assert.equal(result.next_action, 'TECHNICAL_ESCALATION');
  assert.equal(result.action_type, 'ERROR');
  assert.notEqual(result.transition_name, 'weiter');
});

test('15. phone function_arguments includes birthday and leaping bday alias', () => {
  const result = runVerificationPhoneBrain({
    session_id: 'phone-fn-args',
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });
  assert.deepEqual(result.function_arguments, { birthday: '1956-03-16' });
  assert.equal(result.leaping_function_arguments?.bday, '1956-03-16');
});

test('16. VNR with stable session persists candidate through confirmation', () => {
  const sessionId = 'vnr-stable-confirm';
  const first = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });
  assert.equal(first.stored_values?.vnr_candidate, 'L039359923');
  assert.equal(first.next_action, 'CONFIRM_VNR');

  const second = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'ja',
  });
  assert.equal(second.stored_values?.vnr_candidate, 'L039359923');
  assert.equal(second.stored_values?.vnr_confirmed, true);
  assert.equal(second.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
});

test('17. confirmed VNR with invalid shape asks for correction before lookup', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-invalid-shape',
    vnr_candidate: '039359923',
    vnr_confirmed: true,
  });
  assert.equal(result.next_action, 'ASK_VNR_LETTER');
  assert.notEqual(result.function_name, 'pmb_safe_get_customer_by_insurance_number');
});

test('18. VNR lookup Kein Kunde gefunden does not ask birthday', () => {
  const sessionId = 'vnr-lookup-not-found';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    get_customer_by_insurance_number_result: { error: 'Kein Kunde gefunden' },
  });
  assert.equal(result.next_action, 'ASK_VNR');
  assert.notEqual(result.next_action, 'ASK_BIRTHDAY');
  assert.notEqual(result.function_name, 'check_birthday');
});

test('19. VNR lookup found then birthday answer allows check_birthday', () => {
  const sessionId = 'vnr-found-then-birthday';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(result.function_name, 'check_birthday');
});

test('20. cross-path address not_found twice then VNR reuses reliable birthday from same session', () => {
  const sessionId = 'c0ffee00000000000000000000000020';
  const addressFallback = runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 2,
  });
  assert.equal(addressFallback.next_action, 'FALLBACK_TO_VNR');
  assert.equal(addressFallback.stored_values?.birthday_customer, '1956-03-16');

  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
    birthday_system_available: true,
  });
  const vnr = runVerificationVnrBrain({ session_id: sessionId });
  assert.equal(vnr.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(vnr.stored_values?.birthday_customer, '1956-03-16');
  assert.deepEqual(vnr.function_arguments, { birthday: '1956-03-16' });
});
