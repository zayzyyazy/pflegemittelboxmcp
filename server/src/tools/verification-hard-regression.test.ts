import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceVerificationMethodRouterInput,
  runVerificationMethodRouter,
} from './verification-method-router.js';
import {
  coerceVerificationAddressBrainInput,
  coerceVerificationPhoneBrainInput,
  coerceVerificationVnrBrainInput,
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import {
  toLeapingVerificationBrainResponse,
  toLoggedVerificationBrainResponse,
} from './verification-brain-response.js';
import { outputContainsRawCustomerRecord } from './verification-brain-sanitize.js';

const REG = 'hard-regression';

function assertNoSensitiveLeak(leaping: ReturnType<typeof toLeapingVerificationBrainResponse>, say?: string) {
  assert.equal(outputContainsRawCustomerRecord(leaping), false);
  const blob = JSON.stringify(leaping) + (say ?? '');
  assert.equal(blob.includes('birthday_system'), false);
  assert.equal(blob.includes('secret@'), false);
  assert.equal(blob.includes('@example.com'), false);
}

function setupVnrLookupFound(sessionId: string) {
  runVerificationVnrBrain({ session_id: sessionId, vnr_candidate: 'L039359923', vnr_confirmed: true });
  runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: 'found',
    })
  );
}

// --- 1. Phone-found routing (5) ---

test('HR-01 router phone_lookup_found=true routes to phone brain', () => {
  const r = runVerificationMethodRouter({ session_id: `${REG}-01`, phone_lookup_found: true });
  assert.equal(r.active_brain, 'phone');
  assert.equal(r.next_brain, 'pmb_verification_phone_brain');
  assert.equal(r.say, '');
});

test('HR-02 router phone_lookup_found customer id routes to phone brain', () => {
  const r = runVerificationMethodRouter({ session_id: `${REG}-02`, phone_lookup_found: '107484' });
  assert.equal(r.active_brain, 'phone');
  assert.equal(r.say, '');
});

test('HR-03 router id_phone routes to phone brain without method question', () => {
  const r = runVerificationMethodRouter(
    coerceVerificationMethodRouterInput({ session_id: `${REG}-03`, id_phone: '107484' })
  );
  assert.equal(r.active_brain, 'phone');
  assert.equal(r.next_brain, 'pmb_verification_phone_brain');
  assert.equal(r.say, '');
});

test('HR-04 router id from phone lookup routes to phone brain', () => {
  const r = runVerificationMethodRouter(
    coerceVerificationMethodRouterInput({
      session_id: `${REG}-04`,
      id: '107484',
      get_customer_by_phone_result: 'found',
    })
  );
  assert.equal(r.active_brain, 'phone');
});

test('HR-05 phone brain after phone-found asks birthday not check_birthday immediately', () => {
  const sid = `${REG}-05`;
  runVerificationMethodRouter({ session_id: sid, phone_lookup_found: true });
  const phone = runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  assert.equal(phone.next_action, 'ASK_BIRTHDAY');
  assert.notEqual(phone.function_to_call, 'check_birthday');
});

// --- 2. Phone brain birthday auth (5) ---

test('HR-06 phone birthday correct leads to check_birthday then weiter', () => {
  const sid = `${REG}-06`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  const call = runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  assert.equal(call.next_action, 'CALL_CHECK_BIRTHDAY');
  const done = runVerificationPhoneBrain(
    coerceVerificationPhoneBrainInput({ session_id: sid, phone_lookup_found: true, check_birthday_result: 'success' })
  );
  assert.equal(done.next_action, 'TRANSITION_WEITER');
});

test('HR-07 phone wrong birthday retries', () => {
  const sid = `${REG}-07`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  const failed = runVerificationPhoneBrain(
    coerceVerificationPhoneBrainInput({ session_id: sid, phone_lookup_found: true, check_birthday_result: 'failed' })
  );
  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
  assert.match(failed.say, /noch einmal/i);
});

test('HR-08 phone repeated wrong birthday escalates', () => {
  const sid = `${REG}-08`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  runVerificationPhoneBrain(
    coerceVerificationPhoneBrainInput({ session_id: sid, phone_lookup_found: true, check_birthday_result: 'failed' })
  );
  runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: '01.01.1990',
    birthday_system_available: true,
  });
  runVerificationPhoneBrain(
    coerceVerificationPhoneBrainInput({ session_id: sid, phone_lookup_found: true, check_birthday_result: 'failed' })
  );
  runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: '02.02.1948',
    birthday_system_available: true,
  });
  const final = runVerificationPhoneBrain(
    coerceVerificationPhoneBrainInput({ session_id: sid, phone_lookup_found: true, check_birthday_result: 'failed' })
  );
  assert.equal(final.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('HR-09 phone unclear birthday asks again', () => {
  const sid = `${REG}-09`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  const unclear = runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    latest_customer_input: 'äh keine Ahnung',
  });
  assert.equal(unclear.next_action, 'ASK_BIRTHDAY');
});

test('HR-10 phone path say never leaks stored birthday', () => {
  const sid = `${REG}-10`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  const ask = runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  const leaping = toLeapingVerificationBrainResponse(ask);
  assertNoSensitiveLeak(leaping, ask.say);
  assert.equal(ask.say.includes('1956'), false);
});

// --- 3. Router no-phone method choice (5) ---

test('HR-11 router customer says Postleitzahl selects address', () => {
  const r = runVerificationMethodRouter({
    session_id: `${REG}-11`,
    phone_lookup_found: false,
    latest_customer_input: 'Über die Postleitzahl bitte',
  });
  assert.equal(r.active_brain, 'address');
  assert.equal(r.next_brain, 'pmb_verification_address_brain');
});

test('HR-12 router customer says Versicherungsnummer selects VNR', () => {
  const r = runVerificationMethodRouter({
    session_id: `${REG}-12`,
    phone_lookup_found: false,
    latest_customer_input: 'Mit der Versicherungsnummer',
  });
  assert.equal(r.active_brain, 'vnr');
});

test('HR-13 router unclear Kundennummer still asks method choice', () => {
  const r = runVerificationMethodRouter({
    session_id: `${REG}-13`,
    phone_lookup_found: false,
    latest_customer_input: 'Kundennummer',
  });
  assert.match(r.say, /Versichertennummer|Postleitzahl/);
});

test('HR-14 router why verification keeps method choice active_brain null until answer', () => {
  const r = runVerificationMethodRouter({
    session_id: `${REG}-14`,
    phone_lookup_found: false,
    latest_customer_input: 'Warum brauchen Sie das?',
  });
  assert.equal(r.active_brain, null);
  assert.match(r.say, /Versichertennummer/);
});

test('HR-15 router stores address path until new session even if customer mentions VNR', () => {
  const first = runVerificationMethodRouter({
    session_id: `${REG}-15`,
    phone_lookup_found: false,
    latest_customer_input: 'Postleitzahl',
  });
  assert.equal(first.active_brain, 'address');
  const second = runVerificationMethodRouter({
    session_id: `${REG}-15`,
    phone_lookup_found: false,
    latest_customer_input: 'Doch lieber Versicherungsnummer',
  });
  assert.equal(second.active_brain, 'address');
  const fresh = runVerificationMethodRouter({
    session_id: `${REG}-15b`,
    phone_lookup_found: false,
    latest_customer_input: 'Versicherungsnummer',
  });
  assert.equal(fresh.active_brain, 'vnr');
});

// --- 4. Address path (9) ---

test('HR-16 address clean PLZ HNR birthday leads to lookup', () => {
  const sid = `${REG}-16`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  const ready = runVerificationAddressBrain({ session_id: sid, latest_customer_input: '16.03.1956' });
  assert.equal(ready.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.notEqual(ready.function_to_call, 'check_birthday');
});

test('HR-17 address spoken PLZ vier eins drei sieben zwei', () => {
  const r = runVerificationAddressBrain({
    session_id: `${REG}-17`,
    latest_customer_input: 'vier eins drei sieben zwei',
  });
  assert.equal(r.stored_values?.plz, '41372');
});

test('HR-18 address incomplete PLZ retries PLZ', () => {
  const r = runVerificationAddressBrain({
    session_id: `${REG}-18`,
    latest_customer_input: 'eins drei sieben zwei',
  });
  assert.equal(r.next_action, 'ASK_PLZ');
});

test('HR-19 address house number hundert', () => {
  const sid = `${REG}-19`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  const hnr = runVerificationAddressBrain({ session_id: sid, latest_customer_input: 'einhundert' });
  assert.equal(hnr.stored_values?.house_number, '100');
});

test('HR-20 address house number suffix 100B strips to 100', () => {
  const sid = `${REG}-20`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  const hnr = runVerificationAddressBrain({ session_id: sid, latest_customer_input: 'hundert b' });
  assert.equal(hnr.stored_values?.house_number, '100');
});

test('HR-21 address missing birthday year asks birth year', () => {
  const sid = `${REG}-21`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  const partial = runVerificationAddressBrain({ session_id: sid, latest_customer_input: 'sechzehnter März' });
  assert.equal(partial.next_action, 'ASK_BIRTH_YEAR');
});

test('HR-22 address impossible future birthday retries birthday', () => {
  const sid = `${REG}-22`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  const bad = runVerificationAddressBrain({ session_id: sid, latest_customer_input: '16. März 2030' });
  assert.equal(bad.next_action, 'ASK_BIRTHDAY');
});

test('HR-23 address not_found once confirms values', () => {
  const sid = `${REG}-23`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '16.03.1956' });
  const nf = runVerificationAddressBrain(
    coerceVerificationAddressBrainInput({ session_id: sid, get_customer_by_plz_geb_result: 'not_found' })
  );
  assert.equal(nf.next_action, 'CONFIRM_ADDRESS_VALUES');
});

test('HR-24 address repeated not_found falls back to VNR', () => {
  const sid = `${REG}-24`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '16.03.1956' });
  runVerificationAddressBrain(
    coerceVerificationAddressBrainInput({ session_id: sid, get_customer_by_plz_geb_result: 'not_found' })
  );
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: 'ja das stimmt' });
  runVerificationAddressBrain(
    coerceVerificationAddressBrainInput({ session_id: sid, get_customer_by_plz_geb_result: 'not_found' })
  );
  const fallback = runVerificationAddressBrain({ session_id: sid, latest_customer_input: 'ja das stimmt' });
  assert.equal(fallback.next_action, 'FALLBACK_TO_VNR');
});

// --- 5. VNR path (10) ---

test('HR-25 VNR clean confirmed triggers insurance lookup', () => {
  const r = runVerificationVnrBrain({
    session_id: `${REG}-25`,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  assert.equal(r.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
});

test('HR-26 VNR spelling alphabet first letter', () => {
  const r = runVerificationVnrBrain({
    session_id: `${REG}-26`,
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });
  assert.equal(r.stored_values?.vnr_candidate, 'L039359923');
});

test('HR-27 VNR letter later after digits asks confirmation', () => {
  const sid = `${REG}-27`;
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: 'null drei neun drei fünf neun neun zwei drei' });
  const withLetter = runVerificationVnrBrain({ session_id: sid, latest_customer_input: 'L' });
  assert.equal(withLetter.next_action, 'CONFIRM_VNR');
});

test('HR-28 VNR invalid shape retries VNR', () => {
  const r = runVerificationVnrBrain({
    session_id: `${REG}-28`,
    latest_customer_input: '039359923',
  });
  assert.match(r.next_action, /ASK_VNR/);
});

test('HR-29 VNR customer says nein after candidate asks confirmation', () => {
  const sid = `${REG}-29`;
  runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });
  const no = runVerificationVnrBrain({ session_id: sid, latest_customer_input: 'nein' });
  assert.equal(no.next_action, 'CONFIRM_VNR');
});

test('HR-30 VNR partial VNR does not confirm', () => {
  const r = runVerificationVnrBrain({ session_id: `${REG}-30`, latest_customer_input: 'L null drei neun' });
  assert.notEqual(r.stored_values?.vnr_confirmed, true);
});

test('HR-31 VNR confirmation yes proceeds', () => {
  const sid = `${REG}-31`;
  runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'L wie Ludwig null drei neun drei fünf neun neun zwei drei',
  });
  const yes = runVerificationVnrBrain({ session_id: sid, latest_customer_input: 'ja' });
  assert.equal(yes.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
});

test('HR-32 VNR lookup found asks birthday not weiter', () => {
  const sid = `${REG}-32`;
  runVerificationVnrBrain({ session_id: sid, vnr_candidate: 'L039359923', vnr_confirmed: true });
  const found = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, get_customer_by_insurance_number_result: 'found' })
  );
  assert.equal(found.next_action, 'ASK_BIRTHDAY');
  assert.notEqual(found.next_action, 'TRANSITION_WEITER');
});

test('HR-33 VNR lookup not_found retries VNR', () => {
  const sid = `${REG}-33`;
  runVerificationVnrBrain({ session_id: sid, vnr_candidate: 'L039359923', vnr_confirmed: true });
  const nf = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, get_customer_by_insurance_number_result: 'not_found' })
  );
  assert.equal(nf.next_action, 'ASK_VNR');
});

test('HR-34 VNR lookup found on same callback with check true still does not bypass birthday ask', () => {
  const sid = `${REG}-34`;
  runVerificationVnrBrain({ session_id: sid, vnr_candidate: 'L039359923', vnr_confirmed: true });
  const lookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sid,
      get_customer_by_insurance_number_result: 'found',
      check_birthday_result: true,
    })
  );
  assert.notEqual(lookup.next_action, 'TRANSITION_WEITER');
  assert.equal(lookup.next_action, 'ASK_BIRTHDAY');
});

// --- 6. VNR birthday-auth (8) ---

test('HR-35 VNR birthday latest_customer_input before check_birthday', () => {
  const sid = `${REG}-35`;
  setupVnrLookupFound(sid);
  const call = runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'sechzen märz fünfzig',
    birthday_system_available: true,
  });
  assert.equal(call.next_action, 'CALL_CHECK_BIRTHDAY');
});

test('HR-36 VNR parsed birthday normalized to ISO in function args', () => {
  const sid = `${REG}-36`;
  setupVnrLookupFound(sid);
  const call = runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: '16 3 50',
    birthday_system_available: true,
  });
  assert.deepEqual(call.function_arguments, { birthday: '1950-03-16' });
});

test('HR-37 VNR check_birthday_result true transitions weiter', () => {
  const sid = `${REG}-37`;
  setupVnrLookupFound(sid);
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: '16.03.1950', birthday_system_available: true });
  const done = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: true })
  );
  assert.equal(done.next_action, 'TRANSITION_WEITER');
});

test('HR-38 VNR check_birthday_result false smart retry', () => {
  const sid = `${REG}-38`;
  setupVnrLookupFound(sid);
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: '16.03.1950', birthday_system_available: true });
  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: false })
  );
  assert.match(failed.say, /konnte ich leider nicht bestätigen/i);
});

test('HR-39 VNR repeated false escalates', () => {
  const sid = `${REG}-39`;
  setupVnrLookupFound(sid);
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: '16.03.1950', birthday_system_available: true });
  runVerificationVnrBrain(coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: 'failed' }));
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: '16.03.1951', birthday_system_available: true });
  runVerificationVnrBrain(coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: 'failed' }));
  const final = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: 'failed' })
  );
  assert.equal(final.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('HR-40 VNR messy German spoken date sechzehnter dritter fünfzig', () => {
  const sid = `${REG}-40`;
  setupVnrLookupFound(sid);
  const call = runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'sechzehnter dritter fünfzig',
    birthday_system_available: true,
  });
  assert.equal(call.next_action, 'CALL_CHECK_BIRTHDAY');
});

test('HR-41 VNR unparseable birthday acoustic retry', () => {
  const sid = `${REG}-41`;
  setupVnrLookupFound(sid);
  const retry = runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'blabla keine Ahnung',
    birthday_system_available: true,
  });
  assert.match(retry.say, /akustisch nicht sicher verstanden/i);
});

test('HR-42 VNR birthday auth output no birthday_system leak', () => {
  const sid = `${REG}-42`;
  setupVnrLookupFound(sid);
  const call = runVerificationVnrBrain({
    session_id: sid,
    latest_customer_input: 'sechzehn märz fünfzig',
    birthday_system_available: true,
    birthday_system: '1950-03-16',
  });
  const leaping = toLeapingVerificationBrainResponse(call);
  const logged = toLoggedVerificationBrainResponse(call);
  assertNoSensitiveLeak(leaping, call.say);
  assert.equal(JSON.stringify(logged).includes('birthday_system'), false);
});

// --- 7. Leaping-misorder resilience (5) ---

test('HR-43 VNR minimal check_birthday_result true with session only transitions weiter', () => {
  const sid = `${REG}-43`;
  setupVnrLookupFound(sid);
  runVerificationVnrBrain({ session_id: sid, latest_customer_input: '16.03.1956', birthday_system_available: true });
  const done = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: true })
  );
  assert.equal(done.next_action, 'TRANSITION_WEITER');
});

test('HR-44 VNR minimal check_birthday_result false smart retry not first-time', () => {
  const sid = `${REG}-44`;
  setupVnrLookupFound(sid);
  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({ session_id: sid, check_birthday_result: false })
  );
  assert.match(failed.say, /konnte ich leider nicht bestätigen|akustisch nicht sicher/i);
  assert.notEqual(failed.say, 'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.');
});

test('HR-45 VNR lookup callback without vnr fields still asks birthday', () => {
  const sid = `${REG}-45`;
  runVerificationVnrBrain({ session_id: sid, vnr_candidate: 'L039359923', vnr_confirmed: true });
  const cb = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sid,
      get_customer_by_insurance_number_result: { id: '107484', birthday: '1956-03-16', mail: 'secret@example.com' },
    })
  );
  assert.equal(cb.next_action, 'ASK_BIRTHDAY');
  assert.notEqual(cb.next_action, 'ASK_VNR');
});

test('HR-46 VNR missing latest_customer_input after ask keeps birthday auth state', () => {
  const sid = `${REG}-46`;
  setupVnrLookupFound(sid);
  const again = runVerificationVnrBrain({ session_id: sid });
  assert.equal(again.next_action, 'ASK_BIRTHDAY');
});

test('HR-47 address latest_customer_input valid function result flagged not speech', () => {
  const r = runVerificationAddressBrain({
    session_id: `${REG}-47`,
    latest_customer_input: 'valid',
  });
  assert.ok(r.safety_flags.includes('latest_customer_input_looks_like_function_result'));
});

// --- 8. Schema/state safety (6) ---

test('HR-48 session_id persists PLZ across address turns', () => {
  const sid = `${REG}-48`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  const second = runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  assert.equal(second.stored_values?.plz, '41372');
  assert.equal(second.session_id_received, true);
});

test('HR-49 stateless address brain warns missing session_id', () => {
  const r = runVerificationAddressBrain({ latest_customer_input: '41372' });
  assert.equal(r.session_mode, 'stateless');
  assert.ok(r.safety_flags.includes('missing_session_id'));
});

test('HR-50 VNR CRM callback sanitizes stored lookup summary', () => {
  const sid = `${REG}-50`;
  runVerificationVnrBrain({ session_id: sid, vnr_candidate: 'L039359923', vnr_confirmed: true });
  const cb = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sid,
      get_customer_by_insurance_number_result: {
        id: '107484',
        birthday: '1956-03-16',
        mail: 'secret@example.com',
        name: 'Max Mustermann',
      },
    })
  );
  const leaping = toLeapingVerificationBrainResponse(cb);
  assertNoSensitiveLeak(leaping, cb.say);
  assert.deepEqual(cb.stored_values?.get_customer_by_insurance_number_result, {
    found: true,
    id: '107484',
    birthday_present: true,
  });
});

test('HR-51 router no hallucinated active_brain without customer input', () => {
  const r = runVerificationMethodRouter({ session_id: `${REG}-51`, phone_lookup_found: false });
  assert.equal(r.active_brain, null);
});

test('HR-52 phone path never calls check_birthday without customer birthday', () => {
  const r = runVerificationPhoneBrain({ session_id: `${REG}-52`, phone_lookup_found: true });
  assert.notEqual(r.function_to_call, 'check_birthday');
});

test('HR-53 address found transitions weiter without check_birthday', () => {
  const sid = `${REG}-53`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '16.03.1956' });
  const found = runVerificationAddressBrain(
    coerceVerificationAddressBrainInput({ session_id: sid, get_customer_by_plz_geb_result: 'found' })
  );
  assert.equal(found.next_action, 'TRANSITION_WEITER');
  assert.notEqual(found.function_to_call, 'check_birthday');
});

test('HR-54 VNR neukunde transitions nicht identifiziert', () => {
  const r = runVerificationVnrBrain({
    session_id: `${REG}-54`,
    latest_customer_input: 'Ich bin Neukunde',
  });
  assert.equal(r.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
});

test('HR-55 address impossible birthday 31 February retries', () => {
  const sid = `${REG}-55`;
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: sid, latest_customer_input: '100' });
  const bad = runVerificationAddressBrain({ session_id: sid, latest_customer_input: '31. Februar 1956' });
  assert.equal(bad.next_action, 'ASK_BIRTHDAY');
});
