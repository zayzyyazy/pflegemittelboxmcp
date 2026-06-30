import test from 'node:test';
import assert from 'node:assert/strict';
import { runDebugEchoSession, runDebugEchoSessionOnly } from './debug-echo-session.js';

test('pmb_debug_echo_session echoes bound session_id and fields', () => {
  const result = runDebugEchoSession({
    session_id: 'a1b2c3d4e5f6789012345678abcdef01',
    latest_customer_input: '41372',
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });

  assert.equal(result.ok, true);
  assert.equal(result.session_id_received, true);
  assert.equal(result.received_session_id, 'a1b2c3d4e5f6789012345678abcdef01');
  assert.equal(result.latest_customer_input, '41372');
  assert.deepEqual(result.received_fields, {
    session_id: 'a1b2c3d4e5f6789012345678abcdef01',
    latest_customer_input: '41372',
    plz: '41372',
    hnr: '100',
    bday: '1956-03-16',
  });
});

test('pmb_debug_echo_session reports missing session_id', () => {
  const result = runDebugEchoSession({ latest_customer_input: 'hello' });

  assert.equal(result.session_id_received, false);
  assert.equal(result.received_session_id, null);
  assert.equal(result.received_fields.session_id, null);
});

test('pmb_debug_echo_session_only echoes bound session_id only', () => {
  const result = runDebugEchoSessionOnly({
    session_id: 'a1b2c3d4e5f6789012345678abcdef01',
  });

  assert.equal(result.ok, true);
  assert.equal(result.session_id_received, true);
  assert.equal(result.received_session_id, 'a1b2c3d4e5f6789012345678abcdef01');
  assert.equal(Object.keys(result).length, 3);
});

test('pmb_debug_echo_session_only reports missing session_id', () => {
  const result = runDebugEchoSessionOnly({});

  assert.equal(result.session_id_received, false);
  assert.equal(result.received_session_id, null);
});
