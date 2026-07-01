import test from 'node:test';
import assert from 'node:assert/strict';
import { toSafeLookupSummaryForDisplay } from './lookup-result-sanitize.js';
import { sanitizeVerificationBrainInput } from './verification-brain-sanitize.js';
import {
  runVerificationAddressBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLoggedVerificationBrainResponse } from './verification-brain-response.js';
import { outputContainsRawCustomerRecord } from './verification-brain-sanitize.js';
import { isLookupFound } from './lookup-result-sanitize.js';

const CRM_CUSTOMER = {
  id: '107484',
  birthday: '1956-03-16',
  mail: 'secret@example.com',
  name: 'Max Mustermann',
  vip: true,
  box_contents: ['gloves'],
};

test('address lookup found CRM object sanitizes to safe summary', () => {
  const internal = runVerificationAddressBrain({
    session_id: 'safe-address-001',
    plz: '41372',
    house_number: '100',
    birthday_customer: '1956-03-16',
    get_customer_by_plz_geb_result: CRM_CUSTOMER,
  });

  assert.equal(isLookupFound(internal.stored_values?.get_customer_by_plz_geb_result), true);
  const stored = internal.stored_values?.get_customer_by_plz_geb_result;
  assert.equal(typeof stored, 'object');
  assert.deepEqual(stored, { found: true, id: '107484', birthday_present: true });

  const logged = toLoggedVerificationBrainResponse(internal);
  assert.deepEqual(logged.debug.stored_values?.get_customer_by_plz_geb_result, {
    found: true,
    id: '107484',
    birthday_present: true,
  });
  assert.equal(outputContainsRawCustomerRecord(logged), false);

  const sanitizedInput = sanitizeVerificationBrainInput({
    get_customer_by_plz_geb_result: CRM_CUSTOMER,
  });
  assert.deepEqual(sanitizedInput, {
    get_customer_by_plz_geb_result: { found: true, id: '107484', birthday_present: true },
  });
});

test('VNR lookup found CRM object sanitizes to safe summary', () => {
  const internal = runVerificationVnrBrain({
    session_id: 'safe-vnr-001',
    vnr_candidate: 'L039359923',
    vnr_confirmed: true,
    get_customer_by_insurance_number_result: CRM_CUSTOMER,
  });

  assert.equal(internal.next_action, 'ASK_BIRTHDAY');
  assert.deepEqual(internal.stored_values?.get_customer_by_insurance_number_result, {
    found: true,
    id: '107484',
    birthday_present: true,
  });
  assert.deepEqual(toSafeLookupSummaryForDisplay(CRM_CUSTOMER), {
    found: true,
    id: '107484',
    birthday_present: true,
  });
});
