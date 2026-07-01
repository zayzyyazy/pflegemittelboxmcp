import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceVerificationVnrBrainInput,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLeapingVerificationBrainResponse } from './verification-brain-response.js';

const SESSION = 'vnr-auth-flow-test';

test('VNR confirmed then lookup found asks for birthday', () => {
  const sessionId = `${SESSION}-ask-birthday`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const lookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: { id: '107484', birthday: '1956-03-16' },
      birthday_customer: '1956-03-16',
      birthday_system_available: true,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(lookup);

  assert.equal(lookup.next_action, 'ASK_BIRTHDAY');
  assert.equal(leaping.action_type, 'SAY_ONLY');
  assert.equal(leaping.transition_name, null);
  assert.notEqual(leaping.function_name, 'check_birthday');
});

test('VNR lookup found alone never transitions weiter', () => {
  const sessionId = `${SESSION}-no-weiter`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const lookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: 'found',
      check_birthday_result: true,
      birthday_customer: '1956-03-16',
      birthday_system_available: true,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(lookup);

  assert.notEqual(lookup.next_action, 'TRANSITION_WEITER');
  assert.notEqual(leaping.transition_name, 'weiter');
  assert.equal(lookup.next_action, 'ASK_BIRTHDAY');
});

test('VNR lookup found then customer birthday returns CALL_FUNCTION check_birthday', () => {
  const sessionId = `${SESSION}-call-check`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: 'found',
    })
  );

  const check = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });
  const leaping = toLeapingVerificationBrainResponse(check);

  assert.equal(check.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.equal(check.function_to_call, 'check_birthday');
  assert.equal(leaping.action_type, 'CALL_FUNCTION');
  assert.equal(leaping.function_name, 'check_birthday');
  assert.deepEqual(leaping.function_arguments, { birthday: '1956-03-16' });
});

test('VNR check_birthday success transitions weiter', () => {
  const sessionId = `${SESSION}-weiter`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    get_customer_by_insurance_number_result: 'found',
  });
  runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '16.03.1956',
    birthday_system_available: true,
  });

  const done = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'success',
    })
  );
  const leaping = toLeapingVerificationBrainResponse(done);

  assert.equal(done.next_action, 'TRANSITION_WEITER');
  assert.equal(done.transition_to, 'weiter');
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'weiter');
});

test('VNR does not call check_birthday before customer lookup found', () => {
  const result = runVerificationVnrBrain({
    session_id: `${SESSION}-before-lookup`,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });

  assert.equal(result.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.notEqual(result.function_to_call, 'check_birthday');
});

test('VNR full Leaping callback sequence: lookup CRM object then birthday auth', () => {
  const sessionId = `${SESSION}-leaping-seq`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'E027064360',
    vnr_confirmed: true,
  });

  const afterLookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      vnr_candidate: 'E027064360',
      vnr_confirmed: true,
      get_customer_by_insurance_number_result: {
        id: '107484',
        birthday: '1956-03-16',
        mail: 'secret@example.com',
      },
      birthday_system_available: true,
    })
  );
  assert.equal(afterLookup.next_action, 'ASK_BIRTHDAY');

  const afterBirthday = runVerificationVnrBrain({
    session_id: sessionId,
    latest_customer_input: '16. März 1956',
    birthday_system_available: true,
  });
  assert.equal(afterBirthday.next_action, 'CALL_CHECK_BIRTHDAY');
  assert.deepEqual(afterBirthday.function_arguments, { birthday: '1956-03-16' });

  const afterCheck = runVerificationVnrBrain({
    session_id: sessionId,
    check_birthday_result: 'success',
  });
  assert.equal(afterCheck.next_action, 'TRANSITION_WEITER');
});
