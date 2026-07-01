import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVnrUtterance } from './verification-vnr-parser.js';
import { runVerificationVnrBrain } from './verification-method-brains.js';

const SESSION = 'vnr-letter-merge-test';

test('parseVnrUtterance stores nine digits awaiting letter', () => {
  const parsed = parseVnrUtterance('null zwei sieben null sechs vier drei sechs null', null);
  assert.equal(parsed.digits_only, '027064360');
  assert.equal(parsed.awaiting_letter, true);
  assert.equal(parsed.valid_shape, false);
});

test('parseVnrUtterance merges stored digits with E wie Emil', () => {
  const parsed = parseVnrUtterance('E wie Emil', '027064360');
  assert.equal(parsed.candidate, 'E027064360');
  assert.equal(parsed.valid_shape, true);
});

test('parseVnrUtterance normalizes lowercase c with digits in one utterance', () => {
  const parsed = parseVnrUtterance('c null zwei sieben null sechs vier drei sechs null', null);
  assert.equal(parsed.candidate, 'C027064360');
  assert.equal(parsed.valid_shape, true);
});

test('VNR sequence: digits then letter then confirm', () => {
  const sessionId = SESSION + '-sequence';

  const stepA = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'null zwei sieben null sechs vier drei sechs null',
  });
  assert.equal(stepA.next_action, 'ASK_VNR_LETTER');
  assert.equal(stepA.stored_values?.vnr_digits_candidate, '027064360');

  const stepB = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'E wie Emil',
  });
  assert.equal(stepB.next_action, 'CONFIRM_VNR');
  assert.match(stepB.say, /E027064360/);

  const stepC = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'ja korrekt',
  });
  assert.equal(stepC.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.equal(stepC.function_arguments?.insurance_number, 'E027064360');
});

test('VNR sequence: c prefix with digits confirms C027064360', () => {
  const sessionId = SESSION + '-c-prefix';
  const stepA = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: 'c null zwei sieben null sechs vier drei sechs null',
  });
  assert.equal(stepA.next_action, 'CONFIRM_VNR');
  assert.match(stepA.say, /C027064360/);
});
