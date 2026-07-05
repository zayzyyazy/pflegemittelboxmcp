import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runVerificationLogicLayer,
  toVerificationLogicResponse,
} from './verification-logic-layer.js';
import { runUnifiedVerificationBrain } from './verification-orchestrator.js';

const SESSION = 'logic-layer-test';

test('logic layer: say is always empty and mode is logic_layer', () => {
  const result = runVerificationLogicLayer({
    session_id: `${SESSION}-empty-say`,
    customer_intent: 'boxwechsel',
  });
  assert.equal(result.mode, 'logic_layer');
  assert.equal(result.say, '');
  assert.equal(result.guidance.marie_generates_speech, true);
});

test('logic layer: method choice returns ALLOW_CLARIFY_METHOD with goal', () => {
  const sessionId = `${SESSION}-method`;
  runVerificationLogicLayer({ session_id: sessionId, customer_intent: 'boxwechsel' });
  const retry = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'Physician',
  });
  assert.equal(retry.action, 'ALLOW_CLARIFY_METHOD');
  assert.equal(retry.phase, 'method_choice');
  assert.equal(retry.guidance.goal, 'clarify_verification_method');
  assert.equal(retry.guidance.clarify_method, true);
  assert.equal(retry.say, '');
});

test('logic layer: STT typo Postleizahl selects address path with collect_plz goal', () => {
  const sessionId = `${SESSION}-typo-plz`;
  runVerificationLogicLayer({ session_id: sessionId });
  const pick = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'Postleizahl',
  });
  assert.equal(pick.active_path, 'address');
  assert.equal(pick.action, 'ALLOW_ASK_CUSTOMER');
  assert.equal(pick.phase, 'collect_plz');
  assert.equal(pick.guidance.goal, 'collect_postal_code');
});

test('logic layer: address birthday STT maps to ALLOW_CALL_FUNCTION', () => {
  const sessionId = `${SESSION}-bday-stt`;
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: 'Postleitzahl' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: '41372' });
  runVerificationLogicLayer({ session_id: sessionId, latest_customer_input: '100' });
  const bday = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'sechzenter märz neunzehnhundertsechundfünfzig',
  });
  assert.equal(bday.action, 'ALLOW_CALL_FUNCTION');
  assert.equal(bday.function_name, 'get_customer_by_plz_geb');
  assert.equal(bday.guidance.collected.birthday, '1965-03-16');
  assert.equal(bday.say, '');
});

test('logic layer: compact pasted VNR proceeds without say script', () => {
  const sessionId = `${SESSION}-vnr-paste`;
  runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'Versichertennummer',
  });
  runVerificationLogicLayer({ session_id: sessionId });
  const paste = runVerificationLogicLayer({
    session_id: sessionId,
    latest_customer_input: 'E207064360',
  });
  assert.equal(paste.say, '');
  assert.equal(paste.active_path, 'vnr');
  assert.notEqual(paste.guidance.goal, 'choose_verification_method');
});

test('toVerificationLogicResponse maps TRANSITION_WEITER to ALLOW_TRANSITION', () => {
  const brain = runUnifiedVerificationBrain({
    session_id: `${SESSION}-phone-complete`,
    phone_lookup_found: true,
    id_phone: '12345',
    latest_customer_input: '01.01.1990',
    check_birthday_result: 'success',
  });
  const mapped = toVerificationLogicResponse(brain);
  if (brain.next_action === 'TRANSITION_WEITER') {
    assert.equal(mapped.action, 'ALLOW_TRANSITION');
    assert.equal(mapped.transition_name, 'weiter');
    assert.equal(mapped.requires_followup_mcp_call, false);
  }
});
