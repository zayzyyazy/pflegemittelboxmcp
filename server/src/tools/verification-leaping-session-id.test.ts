import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerificationAddressBrain } from './verification-method-brains.js';

const LEAPING_CONVERSATION_UUID = 'a1b2c3d4-e5f6-7890-1234-5678abcdef01';
const LEAPING_CONVERSATION_HEX = 'a1b2c3d4e5f6789012345678abcdef01';
const LEAPING_CONVERSATION_HEX_B = 'b2c3d4e5f6789012345678abcdef0123';

test('1. session_id accepts UUID-style leaping_conversation_id', () => {
  const result = runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_UUID,
    phone_lookup_found: false,
    latest_customer_input: '41372',
  });

  assert.equal(result.session_mode, 'session');
  assert.equal(result.session_id_received, true);
  assert.equal(result.session_id, LEAPING_CONVERSATION_UUID);
  assert.equal(result.stored_values?.plz, '41372');
});

test('2. session_id accepts hex-style leaping_conversation_id_hex', () => {
  const result = runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_HEX,
    phone_lookup_found: false,
    latest_customer_input: '41372',
  });

  assert.equal(result.session_mode, 'session');
  assert.equal(result.session_id_received, true);
  assert.equal(result.session_id, LEAPING_CONVERSATION_HEX);
  assert.equal(result.stored_values?.plz, '41372');
});

test('3. same hex session persists address values across PLZ → HNR → birthday', () => {
  const sessionId = 'c0ffee00000000000000000000000003';
  const first = runVerificationAddressBrain({
    session_id: sessionId,
    phone_lookup_found: false,
    latest_customer_input: 'vier eins drei sieben zwei',
  });
  const second = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: 'einhundert',
  });
  const third = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: '16.03.1956',
  });

  assert.equal(first.stored_values?.plz, '41372');
  assert.equal(second.stored_values?.plz, '41372');
  assert.equal(second.stored_values?.house_number, '100');
  assert.equal(third.stored_values?.plz, '41372');
  assert.equal(third.stored_values?.house_number, '100');
  assert.equal(third.stored_values?.birthday_customer, '1956-03-16');
  assert.equal(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
});

test('4. different hex sessions stay isolated', () => {
  runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_HEX,
    latest_customer_input: '41372',
  });
  runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_HEX_B,
    latest_customer_input: '22765',
  });

  const a = runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_HEX,
    latest_customer_input: '100',
  });
  const b = runVerificationAddressBrain({
    session_id: LEAPING_CONVERSATION_HEX_B,
    latest_customer_input: '14',
  });

  assert.equal(a.stored_values?.plz, '41372');
  assert.equal(a.stored_values?.house_number, '100');
  assert.equal(b.stored_values?.plz, '22765');
  assert.equal(b.stored_values?.house_number, '14');
});

test('5. missing session_id returns stateless + missing_session_id', () => {
  const result = runVerificationAddressBrain({
    phone_lookup_found: false,
    latest_customer_input: '41372',
  });

  assert.equal(result.session_mode, 'stateless');
  assert.equal(result.session_id_received, false);
  assert.ok(result.safety_flags.includes('missing_session_id'));
  assert.equal(result.session_id, undefined);
});

test('6. changing tool-call-like IDs call_1/call_2/call_3 does not merge state', () => {
  runVerificationAddressBrain({ session_id: 'call_1', latest_customer_input: '41372' });
  runVerificationAddressBrain({ session_id: 'call_2', latest_customer_input: '100' });
  const third = runVerificationAddressBrain({
    session_id: 'call_3',
    latest_customer_input: '16.03.1956',
  });

  assert.notEqual(third.next_action, 'CALL_GET_CUSTOMER_BY_PLZ_GEB');
  assert.equal(third.stored_values?.plz, null);
  assert.equal(third.stored_values?.house_number, null);
  assert.equal(third.stored_values?.birthday_customer, null);
});

test('7. response exposes session_id_received=true when session_id exists', () => {
  const result = runVerificationAddressBrain({
    session_id: 'c0ffee00000000000000000000000007',
    latest_customer_input: '41372',
  });

  assert.equal(result.session_id_received, true);
  assert.equal(result.session_mode, 'session');
});

test('8. response exposes the exact received session_id', () => {
  const sessionId = 'c0ffee00000000000000000000000008';
  const result = runVerificationAddressBrain({
    session_id: sessionId,
    latest_customer_input: '41372',
  });

  assert.equal(result.session_id, sessionId);
});

test('9. known_values_required_next_call is empty in stateful mode', () => {
  const result = runVerificationAddressBrain({
    session_id: 'c0ffee00000000000000000000000009',
    latest_customer_input: '41372',
  });

  assert.deepEqual(result.known_values_required_next_call, {});
});

test('10. known_values_required_next_call is populated in stateless mode', () => {
  const result = runVerificationAddressBrain({
    latest_customer_input: '41372',
  });

  assert.equal(result.session_mode, 'stateless');
  assert.equal(result.known_values_required_next_call?.plz, '41372');
  assert.ok(Object.keys(result.known_values_required_next_call ?? {}).length > 0);
});
