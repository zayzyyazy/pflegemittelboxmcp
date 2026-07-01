import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceVerificationVnrBrainInput,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLeapingVerificationBrainResponse, toLoggedVerificationBrainResponse } from './verification-brain-response.js';
import { outputContainsRawCustomerRecord } from './verification-brain-sanitize.js';

const SESSION = 'vnr-auth-flow-test';

const VNR_BIRTHDAY_FIRST_ASK_SAY =
  'Bitte nennen Sie mir zur Verifizierung Ihr Geburtsdatum.';

const VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY =
  'Das Geburtsdatum konnte ich leider nicht bestätigen. Bitte nennen Sie mir Ihr Geburtsdatum noch einmal vollständig mit Tag, Monat und Jahr.';

function setupVnrLookupFoundAskBirthday(sessionId: string) {
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  const ask = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: 'found',
    })
  );
  assert.equal(ask.next_action, 'ASK_BIRTHDAY');
  assert.equal(ask.say, VNR_BIRTHDAY_FIRST_ASK_SAY);
}

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

test('VNR full CRM lookup callback sanitizes and asks birthday not VNR', () => {
  const sessionId = `${SESSION}-crm-callback-regression`;
  const crmPayload = {
    id: '107484',
    birthday: '1956-03-16',
    mail: 'secret@example.com',
    name: 'Max Mustermann',
    vip: true,
    box_contents: ['handschuhe'],
    tracking: 'DHL123',
  };

  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'E027064360',
    vnr_confirmed: true,
  });

  const callback = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: crmPayload,
      birthday_system: '1956-03-16',
      birthday_system_available: true,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(callback);
  const logged = toLoggedVerificationBrainResponse(callback);

  assert.equal(callback.next_action, 'ASK_BIRTHDAY');
  assert.equal(callback.say, VNR_BIRTHDAY_FIRST_ASK_SAY);
  assert.notEqual(callback.next_action, 'ASK_VNR');
  assert.equal(leaping.action_type, 'SAY_ONLY');
  assert.equal(leaping.transition_name, null);
  assert.deepEqual(callback.stored_values?.get_customer_by_insurance_number_result, {
    found: true,
    id: '107484',
    birthday_present: true,
  });
  assert.equal(outputContainsRawCustomerRecord(leaping), false);
  assert.equal(outputContainsRawCustomerRecord(logged), false);
  assert.equal(JSON.stringify(logged).includes('secret@example.com'), false);
});

test('VNR CRM lookup callback asks birthday even when vnr fields omitted on input', () => {
  const sessionId = `${SESSION}-crm-callback-no-vnr-input`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const callback = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: {
        id: '107484',
        birthday: '1956-03-16',
        mail: 'secret@example.com',
      },
    })
  );

  assert.equal(callback.next_action, 'ASK_BIRTHDAY');
  assert.equal(callback.stored_values?.vnr_candidate, 'L039359923');
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

test('VNR lookup found calls native get_customer_by_insurance_number', () => {
  const sessionId = `${SESSION}-native-lookup`;
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const lookup = runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });
  const leaping = toLeapingVerificationBrainResponse(lookup);

  assert.equal(lookup.next_action, 'CALL_GET_CUSTOMER_BY_INSURANCE_NUMBER');
  assert.equal(lookup.function_to_call, 'get_customer_by_insurance_number');
  assert.equal(leaping.function_name, 'get_customer_by_insurance_number');
});

test('VNR minimal callback session_id plus check_birthday_result true transitions weiter', () => {
  const sessionId = `${SESSION}-minimal-true-callback`;
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
      check_birthday_result: true,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(done);

  assert.equal(done.next_action, 'TRANSITION_WEITER');
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'weiter');
  assert.equal(leaping.requires_followup_mcp_call, false);
});

test('VNR after birthday auth success does not ask birthday or call check_birthday again', () => {
  const sessionId = `${SESSION}-no-repeat-birthday`;
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
  runVerificationVnrBrain({
    session_id: sessionId,
    check_birthday_result: 'success',
  });

  const again = runVerificationVnrBrain({ session_id: sessionId });
  const leaping = toLeapingVerificationBrainResponse(again);

  assert.equal(again.next_action, 'TRANSITION_WEITER');
  assert.equal(leaping.transition_name, 'weiter');
  assert.notEqual(again.next_action, 'ASK_BIRTHDAY');
  assert.notEqual(again.function_to_call, 'check_birthday');
});

test('VNR failed birthday check does not transition weiter', () => {
  const sessionId = `${SESSION}-birthday-failed`;
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

  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );
  const leaping = toLeapingVerificationBrainResponse(failed);

  assert.notEqual(failed.next_action, 'TRANSITION_WEITER');
  assert.equal(leaping.transition_name, null);
  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
  assert.equal(failed.say, VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY);
});

test('VNR minimal failed callback after lookup returns smart retry not first-time ask', () => {
  const sessionId = `${SESSION}-minimal-failed-smart-retry`;
  setupVnrLookupFoundAskBirthday(sessionId);

  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: false,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(failed);
  const logged = toLoggedVerificationBrainResponse(failed);

  assert.equal(failed.next_action, 'ASK_BIRTHDAY');
  assert.equal(failed.say, VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY);
  assert.notEqual(failed.say, VNR_BIRTHDAY_FIRST_ASK_SAY);
  assert.ok(failed.safety_flags.includes('birthday_retry'));
  assert.equal(leaping.action_type, 'SAY_ONLY');
  assert.equal(leaping.transition_name, null);
  assert.equal(JSON.stringify(leaping).includes('birthday_system'), false);
  assert.equal(JSON.stringify(logged).includes('birthday_system'), false);
  assert.equal(failed.say.includes('1956'), false);
});

test('VNR minimal failed callback increments birthday_check_attempts', () => {
  const sessionId = `${SESSION}-minimal-failed-attempts`;
  setupVnrLookupFoundAskBirthday(sessionId);

  const failed = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );

  assert.equal(failed.attempts?.birthday_check_attempts, 1);
});

test('VNR repeated minimal failed callbacks eventually transition nicht identifiziert', () => {
  const sessionId = `${SESSION}-minimal-failed-escalation`;
  setupVnrLookupFoundAskBirthday(sessionId);

  const first = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );
  assert.equal(first.next_action, 'ASK_BIRTHDAY');
  assert.equal(first.say, VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY);

  const second = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );
  assert.equal(second.next_action, 'ASK_BIRTHDAY');
  assert.equal(second.say, VNR_BIRTHDAY_CHECK_FAILED_RETRY_SAY);

  const third = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );
  const leaping = toLeapingVerificationBrainResponse(third);

  assert.equal(third.next_action, 'TRANSITION_NICHT_IDENTIFIZIERT');
  assert.equal(third.transition_to, 'nicht_identifiziert');
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'nicht_identifiziert');
  assert.equal(third.attempts?.birthday_check_attempts, 3);
});

test('VNR success path still transitions weiter after minimal failed retry flow', () => {
  const sessionId = `${SESSION}-success-after-failed-retry`;
  setupVnrLookupFoundAskBirthday(sessionId);

  runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      check_birthday_result: 'failed',
    })
  );

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
