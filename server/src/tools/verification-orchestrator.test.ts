import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVnrUtterance } from './verification-vnr-parser.js';
import { normalizeVnr } from './normalize-vnr.js';
import { runUnifiedVerificationBrain } from './verification-orchestrator.js';
import { toLeapingVerificationBrainResponse } from './verification-brain-response.js';

const SESSION = 'unified-verification-test';

test('parseVnrUtterance accepts compact pasted VNR', () => {
  const parsed = parseVnrUtterance('E207064360', null);
  assert.equal(parsed.candidate, 'E207064360');
  assert.equal(parsed.valid_shape, true);
});

test('normalizeVnr accepts compact pasted VNR', () => {
  const normalized = normalizeVnr('E207064360');
  assert.equal(normalized.candidate, 'E207064360');
  assert.equal(normalized.valid_shape, true);
});

test('unified flow: unclear method answer uses shorter retry not full intro', () => {
  const sessionId = `${SESSION}-unclear-method`;
  runUnifiedVerificationBrain({ session_id: sessionId, customer_intent: 'boxwechsel' });
  const retry = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Physician',
  });
  assert.equal(retry.next_action, 'ASK_METHOD');
  assert.match(retry.say, /Versichertennummer oder die Postleitzahl/i);
  assert.doesNotMatch(retry.say, /Gerne, ich helfe Ihnen dabei/i);
});

test('unified flow: address birthday STT typo completes lookup', () => {
  const sessionId = `${SESSION}-bday-stt`;
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: 'Postleitzahl' });
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: '41372' });
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: '100' });
  const bday = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'sechzenter märz neunzehnhundertsechundfünfzig',
  });
  assert.equal(bday.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(bday.stored_values?.birthday_customer, '1965-03-16');
});

test('unified flow: STT typo Postleizahl selects address path', () => {
  const sessionId = `${SESSION}-typo-plz`;
  runUnifiedVerificationBrain({ session_id: sessionId });
  const pick = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Postleizahl',
  });
  assert.equal(pick.active_brain, 'address');
  assert.equal(pick.next_action, 'ASK_PLZ');
});

test('unified flow: STT typo Verischern selects VNR path', () => {
  const sessionId = `${SESSION}-typo-vnr`;
  runUnifiedVerificationBrain({ session_id: sessionId });
  const pick = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Verischern',
  });
  assert.equal(pick.active_brain, 'vnr');
  assert.equal(pick.next_action, 'ASK_VNR');
});

test('unified flow: method question does not expose misleading active_brain phone', () => {
  const ask = runUnifiedVerificationBrain({ session_id: `${SESSION}-ask`, customer_intent: 'boxwechsel' });
  const leaping = toLeapingVerificationBrainResponse(ask);
  assert.equal(ask.next_action, 'ASK_METHOD');
  assert.equal(leaping.active_brain, null);
});

test('unified flow: no phone match asks method then routes to VNR on choice', () => {
  const ask = runUnifiedVerificationBrain({
    session_id: `${SESSION}-vnr`,
    customer_intent: 'boxwechsel',
  });
  assert.equal(ask.action_type, 'SAY_ONLY');
  assert.match(ask.say, /Versichertennummer|Postleitzahl/i);

  const pick = runUnifiedVerificationBrain({
    session_id: `${SESSION}-vnr`,
    latest_customer_input: 'Versichertennummer bitte',
  });
  assert.equal(pick.active_brain, 'vnr');
  assert.equal(pick.next_action, 'ASK_VNR');
});

test('unified flow: pasted VNR confirms instead of looping ASK_VNR', () => {
  const sessionId = `${SESSION}-paste`;
  runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'versichern',
  });
  runUnifiedVerificationBrain({ session_id: sessionId });

  const paste = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'E207064360',
  });

  assert.equal(paste.next_action, 'CONFIRM_VNR');
  assert.match(paste.say, /E207064360/);
  assert.equal(toLeapingVerificationBrainResponse(paste).action_type, 'SAY_ONLY');
});

test('unified flow: phone caller skips method question', () => {
  const result = runUnifiedVerificationBrain({
    session_id: `${SESSION}-phone`,
    id_phone: '107484',
  } as Record<string, unknown>);

  assert.equal(result.active_brain, 'phone');
  assert.equal(result.next_action, 'ASK_BIRTHDAY');
});

test('unified flow: voluntary switch from VNR to address', () => {
  const sessionId = `${SESSION}-switch`;
  runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Versichertennummer',
  });
  runUnifiedVerificationBrain({ session_id: sessionId });

  const switched = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Lieber mit der Postleitzahl',
  });

  assert.equal(switched.active_brain, 'address');
  assert.equal(switched.next_action, 'ASK_PLZ');
});

test('unified flow: address fallback sets active_brain to vnr', () => {
  const sessionId = `${SESSION}-fallback`;
  runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'Postleitzahl',
  });
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: '41372' });
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: '100' });
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: '16.03.1956' });
  runUnifiedVerificationBrain({
    session_id: sessionId,
    get_customer_by_plz_geb_result: 'not_found',
  } as Record<string, unknown>);
  runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: 'ja' });
  const secondLookup = runUnifiedVerificationBrain({
    session_id: sessionId,
    get_customer_by_plz_geb_result: 'not_found',
  } as Record<string, unknown>);

  assert.equal(secondLookup.next_action, 'FALLBACK_TO_VNR');
  assert.equal(secondLookup.active_brain, 'vnr');
  assert.match(secondLookup.say, /Versicherungsnummer/i);

  const next = runUnifiedVerificationBrain({
    session_id: sessionId,
    latest_customer_input: 'E207064360',
  });
  assert.equal(next.next_action, 'CONFIRM_VNR');
});
