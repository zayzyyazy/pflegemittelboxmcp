import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerificationLogicLayer } from './verification-logic-layer.js';
import { parseVerificationBirthday } from './verification-method-brains.js';

const SESSION = 'elderly-vnr-birthday';

const GARBLED_BIRTHDAYS: Array<{ input: string; iso: string }> = [
  { input: 'sechzen märz sechsundfünfozfg', iso: '1956-03-16' },
  { input: 'sechzehn märz sechsundfunfzog', iso: '1956-03-16' },
  { input: 'sechzen märz sechsundfünfzig', iso: '1956-03-16' },
  { input: 'sechzehnter märz fünfzig', iso: '1950-03-16' },
  { input: 'sechzenter märz neunzehnhundertsechundfünfzig', iso: '1965-03-16' },
];

for (const { input, iso } of GARBLED_BIRTHDAYS) {
  test(`parseVerificationBirthday elderly STT: ${input}`, () => {
    const parsed = parseVerificationBirthday(input);
    assert.equal(parsed.status, 'complete', `expected complete parse for "${input}"`);
    assert.equal(parsed.iso, iso);
  });
}

function runVnrBirthdayFlow(sessionId: string, birthdayUtterance: string) {
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'Versichertennummer' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'E207064360' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'ja' });
  runVerificationLogicLayer({
    session_id: sessionId,
    get_customer_by_insurance_number_result: 'found',
    birthday_system_available: true,
  });
  return runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: birthdayUtterance,
    birthday_system_available: true,
  });
}

test('logic layer: garbled birthday utterance allows check_birthday', () => {
  const result = runVnrBirthdayFlow(`${SESSION}-garbled`, 'sechzen märz sechsundfünfozfg');
  assert.equal(result.action, 'ALLOW_CALL_FUNCTION');
  assert.equal(result.function_name, 'check_birthday');
  assert.equal(result.function_arguments?.birthday, '1956-03-16');
});

test('logic layer: ja genau after stored birthday allows check_birthday', () => {
  const sessionId = `${SESSION}-ja-genau-logic`;
  const parsed = runVnrBirthdayFlow(sessionId, 'sechzehn märz sechsundfünfzig');
  assert.equal(parsed.function_arguments?.birthday, '1956-03-16');

  const confirm = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'ja genau',
    birthday_system_available: true,
  });
  assert.equal(confirm.action, 'ALLOW_CALL_FUNCTION');
  assert.equal(confirm.function_name, 'check_birthday');
  assert.equal(confirm.guidance.parse_failed, false);
});

test('logic layer: ja genau without stored birthday asks for birth year not parse loop', () => {
  const sessionId = `${SESSION}-ja-incomplete`;
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'Versichertennummer' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'E207064360' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'ja' });
  runVerificationLogicLayer({
    session_id: sessionId,
    get_customer_by_insurance_number_result: 'found',
    birthday_system_available: true,
  });
  runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'sechzehnter märz',
    birthday_system_available: true,
  });
  const confirm = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'ja genau',
    birthday_system_available: true,
  });
  assert.equal(confirm.action, 'ALLOW_ASK_CUSTOMER');
  assert.equal(confirm.phase, 'collect_birth_year');
  assert.equal(confirm.guidance.parse_failed, false);
});
