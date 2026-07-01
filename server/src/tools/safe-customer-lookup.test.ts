import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coerceSafeInsuranceLookupInput,
  coerceSafePlzGebLookupInput,
  runSafeGetCustomerByInsuranceNumber,
  runSafeGetCustomerByPlzGeb,
  toPublicSafeLookupResponse,
} from './safe-customer-lookup.js';

const CRM_CUSTOMER = {
  id: '107484',
  birthday: '1956-03-16',
  mail: 'secret@example.com',
  vip: true,
};

test('toPublicSafeLookupResponse strips CRM fields from found lookup', () => {
  assert.deepEqual(toPublicSafeLookupResponse(CRM_CUSTOMER), {
    found: true,
    id: '107484',
    birthday_present: true,
  });
});

test('toPublicSafeLookupResponse maps not found to found:false only', () => {
  assert.deepEqual(toPublicSafeLookupResponse({ error: 'Kein Kunde gefunden' }), { found: false });
  assert.deepEqual(toPublicSafeLookupResponse('not_found'), { found: false });
});

test('coerceSafePlzGebLookupInput accepts hnr and bday aliases', () => {
  assert.deepEqual(
    coerceSafePlzGebLookupInput({ plz: '41372', hnr: '100', bday: '1956-03-16' }),
    { plz: '41372', house_number: '100', birthday: '1956-03-16' }
  );
});

test('coerceSafeInsuranceLookupInput requires insurance_number', () => {
  assert.deepEqual(coerceSafeInsuranceLookupInput({ insurance_number: 'L039359923' }), {
    insurance_number: 'L039359923',
  });
  assert.throws(() => coerceSafeInsuranceLookupInput({}), /insurance_number/);
});

test('runSafeGetCustomerByPlzGeb proxies CRM and returns safe summary only', async () => {
  const fetchFn = async () =>
    ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(CRM_CUSTOMER),
    }) as Response;

  const result = await runSafeGetCustomerByPlzGeb(
    { plz: '41372', house_number: '100', birthday: '1956-03-16' },
    fetchFn,
    { baseUrl: 'https://crm.test' }
  );
  assert.deepEqual(result, { found: true, id: '107484', birthday_present: true });
});

test('runSafeGetCustomerByInsuranceNumber maps Kein Kunde gefunden to found:false', async () => {
  const fetchFn = async () =>
    ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ error: 'Kein Kunde gefunden' }),
    }) as Response;

  const result = await runSafeGetCustomerByInsuranceNumber(
    { insurance_number: 'L039359923' },
    fetchFn,
    { baseUrl: 'https://crm.test' }
  );
  assert.deepEqual(result, { found: false });
});
