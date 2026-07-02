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
  runVerificationAddressBrain,
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

test('stabilization: lowercase spoken VNR letter e is accepted', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-lowercase-e',
    latest_customer_input: 'e zwei null sieben null sechs vier drei sechs null',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
  assert.match(result.say, /E207064360/);
});

test('stabilization: fresh valid VNR parse overrides stale digits-only session', () => {
  const sessionId = 'vnr-session-poison';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'e zwei null sieben null sechs vier drei sechs null',
  });
  const fixed = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'E zwei null sieben null sechs vier drei sechs null',
  });
  assert.equal(fixed.next_action, 'CONFIRM_VNR');
  assert.match(fixed.say, /E207064360/);
});

test('stabilization: vnr_raw alone resolves to candidate', () => {
  const result = runVerificationVnrBrain({
    session_id: 'vnr-raw-only',
    vnr_raw: 'E207064360',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
});

test('stabilization: VNR neuzenhundert STT typo parses full birthday', () => {
  const sessionId = 'vnr-neuzen-typo';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'E207064360', vnr_confirmed: true });
  runVerificationVnrBrain({ session_id: sessionId, check_insurance_number_format_result: 'valid' });
  runVerificationVnrBrain({ session_id: sessionId, get_customer_by_insurance_number_result: 'found' });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zehnter märz neuzenhundertsechsundfünfzig',
    birthday_system_available: true,
  });
  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.deepEqual(result.function_arguments, { birthday: '1956-03-10' });
});

test('stabilization: VNR year-only follow-up after incomplete parses with neuzen typo', () => {
  const sessionId = 'vnr-year-followup';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'E207064360', vnr_confirmed: true });
  runVerificationVnrBrain({ session_id: sessionId, check_insurance_number_format_result: 'valid' });
  runVerificationVnrBrain({ session_id: sessionId, get_customer_by_insurance_number_result: 'found' });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zehnter märz',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'neuzenhundertsechsundfünfzig',
    birthday_system_available: true,
  });
  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.deepEqual(result.function_arguments, { birthday: '1956-03-10' });
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

test('stabilization: digits first then phonetic letter e wie Emil confirms VNR', () => {
  const sessionId = 'vnr-letter-emil';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zwei null sieben null sechs vier drei sechs null',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'e wie Emil',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
  assert.match(result.say, /E207064360/);
});

test('stabilization: digits first then die Emil confirms VNR', () => {
  const sessionId = 'vnr-letter-die-emil';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zwei null sieben null sechs vier drei sechs null',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'die Emil',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
  assert.match(result.say, /E207064360/);
});

test('stabilization: digits first then e wie E-Mail confirms VNR', () => {
  const sessionId = 'vnr-letter-email';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zwei null sieben null sechs vier drei sechs null',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Das ist genau e wie E-Mail.',
  });
  assert.equal(result.next_action, 'CONFIRM_VNR');
  assert.match(result.say, /E207064360/);
});

test('stabilization: stale ja on ASK_VNR_LETTER re-prompts without treating as letter', () => {
  const sessionId = 'vnr-stale-ja-letter';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zwei null sieben null sechs vier drei sechs null',
  });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Ja.',
  });
  assert.equal(result.next_action, 'ASK_VNR_LETTER');
  assert.ok(result.safety_flags.includes('latest_customer_input_ignored_stale_confirmation'));
  assert.ok(result.missing_fields.includes('vnr_letter'));
});

test('stabilization: letter in prior turn then digits in next turn', () => {
  const sessionId = 'vnr-split-turn-letter-first';
  const first = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Das ist einmal e.',
  });
  assert.equal(first.next_action, 'ASK_VNR_DIGITS');
  assert.match(first.say, /Buchstaben E/);

  const second = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'drei null sieben null sechs vier drei sechs null',
  });
  assert.equal(second.next_action, 'CONFIRM_VNR');
  assert.match(second.say, /E307064360/);
});

test('stabilization: correction during confirm updates VNR prefix', () => {
  const sessionId = 'vnr-correction-prefix';
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'e drei null sieben null sechs vier drei sechs null',
  });
  const corrected = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Ja, also am Anfang ist das zwei null sieben.',
  });
  assert.equal(corrected.next_action, 'CONFIRM_VNR');
  assert.match(corrected.say, /E207064360/);
  assert.equal(corrected.stored_values?.vnr_confirmed, false);
});

test('stabilization: partial digits accumulate across turns after lookup retry', () => {
  const sessionId = 'vnr-partial-digit-accum';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'E307064360',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'not_found',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'e wie Emil',
  });
  const partial = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'zwei null sieben sechs vier drei sechs neun',
  });
  assert.equal(partial.next_action, 'ASK_VNR_DIGITS');
  assert.match(partial.say, /restlichen 1 Ziffer/);

  const complete = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'null',
  });
  assert.equal(complete.next_action, 'CONFIRM_VNR');
  assert.match(complete.say, /E207643690/);
});

test('stabilization: ISO birthday_system echo does not trigger ASK_BIRTH_YEAR loop', () => {
  const sessionId = 'vnr-iso-bday-echo';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'E207064360', vnr_confirmed: true });
  runVerificationVnrBrain({ session_id: sessionId, check_insurance_number_format_result: 'valid' });
  runVerificationVnrBrain({ session_id: sessionId, get_customer_by_insurance_number_result: 'found' });
  const result = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '1956-03-16',
    birthday_system_available: true,
  });
  assert.equal(result.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.deepEqual(result.function_arguments, { birthday: '1956-03-16' });
});

test('stabilization: spoken full birthday then ISO echo proceeds to check', () => {
  const sessionId = 'vnr-bday-then-iso';
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'E207064360', vnr_confirmed: true });
  runVerificationVnrBrain({ session_id: sessionId, check_insurance_number_format_result: 'valid' });
  runVerificationVnrBrain({ session_id: sessionId, get_customer_by_insurance_number_result: 'found' });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzehnter März neunzehnhundertsechsundfünfzig',
    birthday_system_available: true,
  });
  const echo = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '1956-03-16',
    birthday_system_available: true,
  });
  assert.equal(echo.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.deepEqual(echo.function_arguments, { birthday: '1956-03-16' });
});

test('stabilization: address PLZ correction after not_found retries lookup', () => {
  const sessionId = 'addr-plz-correction';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41371',
    house_number: '100',
    birthday_customer: '1956-03-16',
  });
  runVerificationAddressBrain({
    session_id: sessionId,
    get_customer_by_plz_geb_result: 'not_found',
  });
  const corrected = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Nein, die Postleitzahl ist vier eins drei sieben zwei',
  });
  assert.equal(corrected.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(corrected.stored_values?.plz, '41372');
  assert.deepEqual(corrected.function_arguments, {
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });
  assert.ok(corrected.safety_flags.includes('address_corrected'));
});

test('stabilization: partial PLZ echoes understood digits instead of generic loop', () => {
  const sessionId = 'addr-partial-plz-echo';
  const first = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'eins drei sieben zwei',
    phone_lookup_found: false,
  });
  assert.equal(first.next_action, 'ASK_PLZ');
  assert.ok(first.say?.includes('eins, drei, sieben, zwei'));
  assert.ok(first.safety_flags.includes('plz_partial_digits'));

  const repeat = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'eins sieben drei zwei',
    phone_lookup_found: false,
  });
  assert.equal(repeat.next_action, 'ASK_PLZ');
  assert.ok(repeat.say?.includes('eins, sieben, drei, zwei'));
  assert.notEqual(repeat.say, 'Bitte nennen Sie mir Ihre Postleitzahl.');
});

test('stabilization: date spoken while awaiting PLZ does not parse as PLZ digits', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-date-not-plz',
    latest_customer_input: '16.03.1956',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.equal(result.stored_values?.plz, null);
  assert.ok(result.say?.includes('Datum'));
});

test('stabilization: partial PLZ append asks confirmation before storing PLZ', () => {
  const sessionId = 'addr-partial-append';
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'eins drei sieben zwei',
    phone_lookup_found: false,
  });
  const confirm = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'fünf',
    phone_lookup_found: false,
  });
  assert.equal(confirm.stored_values?.plz, null);
  assert.ok(confirm.safety_flags.includes('plz_confirm_candidate'));
  assert.ok(confirm.say?.includes('bestätigen'));
});

test('stabilization: VNR birthday correction after check_birthday failed retries lookup', () => {
  const sessionId = 'vnr-bday-correction-after-fail';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'E207064360',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzehnter März neunzehnhundertfünfzig',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    check_birthday_result: 'failed',
  });
  const corrected = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Sechzehnter März neunzehnhundertsechsundfünfzig',
  });
  assert.equal(corrected.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(corrected.function_to_call, 'check_birthday');
  assert.equal(corrected.stored_values?.birthday_customer, '1956-03-16');
  assert.deepEqual(corrected.function_arguments, { birthday: '1956-03-16' });
  assert.ok(corrected.safety_flags.includes('birthday_corrected_after_failed_check'));
});

test('stabilization: address method choice does not count as failed PLZ parse', () => {
  const sessionId = 'addr-method-choice';
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Machen wir das über die Postleitzahl bitte.',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.match(result.say ?? '', /Gerne über die Postleitzahl/);
  assert.ok(result.safety_flags.includes('address_method_choice'));
  assert.equal(result.attempts?.plz_attempts, 0);
});

test('stabilization: bare Postleitzahl keyword is method choice not failed PLZ parse', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-bare-postleitzahl',
    latest_customer_input: 'Postleitzahl',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.match(result.say ?? '', /Gerne über die Postleitzahl/);
  assert.ok(result.safety_flags.includes('address_method_choice'));
  assert.equal(result.attempts?.plz_attempts, 0);
  assert.ok(!result.safety_flags.includes('plz_parse_retry'));
});

test('stabilization: bare PLZ keyword is method choice not failed PLZ parse', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-bare-plz',
    latest_customer_input: 'PLZ',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.match(result.say ?? '', /Gerne über die Postleitzahl/);
  assert.ok(result.safety_flags.includes('address_method_choice'));
  assert.equal(result.attempts?.plz_attempts, 0);
});

test('stabilization: stale ja while awaiting PLZ prompts again without harsh retry', () => {
  const sessionId = 'addr-stale-ja-plz';
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Ja,',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.equal(result.say, 'Bitte nennen Sie mir Ihre fünfstellige Postleitzahl.');
  assert.ok(result.safety_flags.includes('plz_acknowledgement_only'));
});

test('stabilization: PLZ collection does not set house_number_parse_retry on same turn', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-plz-no-house-retry-flag',
    latest_customer_input: 'vier eins drei sieben zwei',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_HOUSE_NUMBER');
  assert.ok(!result.safety_flags.includes('house_number_parse_retry'));
});

test('stabilization: birthday-only correction keeps house number and updates year', () => {
  const sessionId = 'addr-bday-only-correction';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1976-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  const corrected = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Das Geburtsdatum ist sechzehnter März neunzehnhundertsechsundfünfzig',
  });
  assert.equal(corrected.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(corrected.stored_values?.house_number, '100');
  assert.equal(corrected.stored_values?.birthday_customer, '1956-03-16');
  assert.deepEqual(corrected.function_arguments, { plz: '41372', hnr: '100', bday: '1956-03-16' });
});

test('stabilization: ambiguous birthday correction asks for birth year instead of corrupting house number', () => {
  const sessionId = 'addr-bday-ambiguous';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1976-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  const unclear = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Geburtsdatum ist der sechzehnte März sechsundfünfzig, hundertsechsundfünfzig',
  });
  assert.equal(unclear.next_action, 'ASK_BIRTH_YEAR');
  assert.equal(unclear.stored_values?.house_number, '100');
  assert.equal(unclear.stored_values?.birthday_customer, '1976-03-16');
  assert.ok(unclear.safety_flags.includes('birthday_correction_unclear'));
});

test('stabilization: address retry request after failed lookups reopens confirmation', () => {
  const sessionId = 'addr-retry-request';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
    address_lookup_attempts: 3,
  });
  const retry = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Könnte das noch mal über die Postleitzahl probieren?',
  });
  assert.equal(retry.next_action, 'CONFIRM_ADDRESS_VALUES');
  assert.match(retry.say ?? '', /noch einmal über die Postleitzahl/);
  assert.ok(retry.safety_flags.includes('address_retry_requested'));
});

test('stabilization: was über die Postleitzahl STT variant prompts PLZ politely', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-was-ueber-plz',
    latest_customer_input: 'Machen wir was über die Postleitzahl?',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_PLZ');
  assert.match(result.say ?? '', /Gerne über die Postleitzahl/);
  assert.equal(result.attempts?.plz_attempts, 0);
});

test('stabilization: versicherte Nummer method switch from address brain', () => {
  const result = runVerificationAddressBrain({
    session_id: 'addr-switch-vnr',
    latest_customer_input: 'Machen wir das über die versicherte Nummer?',
    phone_lookup_found: false,
  });
  assert.equal(result.next_action, 'ASK_VNR');
  assert.match(result.say ?? '', /Versicherungsnummer/);
  assert.ok(result.safety_flags.includes('method_switch_to_vnr'));
  assert.equal(result.awaiting_field, null);
});

test('stabilization: path switch address to VNR clears awaiting_field plz bleed', () => {
  const sessionId = 'addr-vnr-awaiting-clear';
  runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Machen wir was über die Postleitzahl?',
    phone_lookup_found: false,
  });
  const vnr = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'versicherten Nummer',
  });
  assert.equal(vnr.next_action, 'ASK_VNR');
  assert.equal(vnr.awaiting_field, null);
});

test('stabilization: confirm yes blocked when birthday year incomplete', () => {
  const sessionId = 'addr-confirm-incomplete-bday';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1976-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  const partialOnConfirm = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzehnter März',
  });
  assert.equal(partialOnConfirm.next_action, 'ASK_BIRTH_YEAR');
  assert.ok(partialOnConfirm.safety_flags.includes('birthday_incomplete_on_confirm'));

  const yes = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Ja, das ist alles korrekt',
  });
  assert.equal(yes.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(yes.function_arguments?.bday, '1976-03-16');
});

test('stabilization: customer asking what birthday was stored gets echo from MCP', () => {
  const sessionId = 'addr-bday-echo-request';
  runVerificationAddressBrain({
    session_id: sessionId,
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: 'not_found',
  });
  const echo = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'Was für ein Geburtsdatum haben Sie verstanden?',
  });
  assert.match(echo.say ?? '', /1956/);
  assert.match(echo.say ?? '', /März/);
  assert.ok(echo.safety_flags.includes('birthday_echo_on_request'));
});

test('stabilization: VNR birthday retry uses session-stored correction without fresh speech', () => {
  const sessionId = 'vnr-bday-session-retry';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'E207064360',
    vnr_confirmed: true,
    check_insurance_number_format_result: 'valid',
    get_customer_by_insurance_number_result: 'found',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Sechzehnter Fünfter neunzehnhundertsechsundfünfzig',
    birthday_system_available: true,
  });
  runVerificationVnrBrain({ session_id: sessionId, check_birthday_result: 'failed' });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'Sechzehnter März neunzehnhundertsechsundfünfzig',
    birthday_system_available: true,
  });
  const staleRetry = runVerificationVnrBrain({ session_id: sessionId });
  assert.equal(staleRetry.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(staleRetry.function_arguments?.birthday, '1956-03-16');
});
