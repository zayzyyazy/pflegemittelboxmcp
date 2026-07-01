import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inferPhoneLookupFoundFromLeapingInput,
  inferVnrInsuranceLookupResult,
} from './leaping-field-bindings.js';
import { coercePhoneLookupFound } from './lookup-result-sanitize.js';
import { coerceVerificationMethodRouterInput, runVerificationMethodRouter } from './verification-method-router.js';
import {
  coerceVerificationVnrBrainInput,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLeapingVerificationBrainResponse, toLoggedVerificationBrainResponse } from './verification-brain-response.js';
import { outputContainsRawCustomerRecord } from './verification-brain-sanitize.js';

test('coercePhoneLookupFound treats Kein Kunde gefunden as not found', () => {
  assert.equal(coercePhoneLookupFound('Kein Kunde gefunden'), false);
  assert.equal(coercePhoneLookupFound('not_found'), false);
  assert.equal(coercePhoneLookupFound('107484'), true);
});

test('inferPhoneLookupFoundFromLeapingInput uses id_phone', () => {
  assert.equal(inferPhoneLookupFoundFromLeapingInput({ id_phone: '107484' }), true);
});

test('inferPhoneLookupFoundFromLeapingInput uses id after phone lookup', () => {
  assert.equal(inferPhoneLookupFoundFromLeapingInput({ id: '107484' }), true);
});

test('inferPhoneLookupFoundFromLeapingInput rejects phone lookup error', () => {
  assert.equal(
    inferPhoneLookupFoundFromLeapingInput({ get_customer_by_phone_result: 'Kein Kunde gefunden' }),
    false
  );
});

test('router id_phone routes directly to phone brain', () => {
  const result = runVerificationMethodRouter(
    coerceVerificationMethodRouterInput({
      session_id: 'router-id-phone',
      id_phone: '107484',
    })
  );
  assert.equal(result.active_brain, 'phone');
  assert.equal(result.next_brain, 'pmb_verification_phone_brain');
});

test('router phone lookup error keeps method choice', () => {
  const result = runVerificationMethodRouter(
    coerceVerificationMethodRouterInput({
      session_id: 'router-phone-error',
      get_customer_by_phone_result: 'Kein Kunde gefunden',
      phone_lookup_found: 'Kein Kunde gefunden',
    })
  );
  assert.equal(result.active_brain, null);
  assert.match(result.say, /Postleitzahl/);
});

test('inferVnrInsuranceLookupResult uses id and birthday_system fallback', () => {
  const inferred = inferVnrInsuranceLookupResult(
    { id: '107484', birthday_system: '1956-03-16' },
    { vnr_awaiting_insurance_lookup_result: true }
  );
  assert.deepEqual(inferred, { found: true, id: '107484', birthday_present: true });
});

test('VNR Leaping fallback id + birthday_system asks birthday', () => {
  const sessionId = 'vnr-leaping-fallback';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const afterLookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      id: '107484',
      birthday_system: '1956-03-16',
      birthday_system_available: true,
    })
  );
  const leaping = toLeapingVerificationBrainResponse(afterLookup);

  assert.equal(afterLookup.next_action, 'ASK_BIRTHDAY');
  assert.equal(leaping.action_type, 'SAY_ONLY');
  assert.notEqual(leaping.transition_name, 'weiter');
});

test('VNR fallback lookup stores sanitized summary without raw CRM payload', () => {
  const sessionId = 'vnr-sanitize-fallback';
  runVerificationVnrBrain({
    session_id: sessionId,
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
  });

  const afterLookup = runVerificationVnrBrain(
    coerceVerificationVnrBrainInput({
      session_id: sessionId,
      get_customer_by_insurance_number_result: {
        id: '107484',
        birthday: '1956-03-16',
        mail: 'secret@example.com',
      },
    })
  );
  const logged = toLoggedVerificationBrainResponse(afterLookup);

  assert.deepEqual(afterLookup.stored_values?.get_customer_by_insurance_number_result, {
    found: true,
    id: '107484',
    birthday_present: true,
  });
  assert.equal(outputContainsRawCustomerRecord(logged), false);
  assert.equal(outputContainsRawCustomerRecord(toLeapingVerificationBrainResponse(afterLookup)), false);
});
