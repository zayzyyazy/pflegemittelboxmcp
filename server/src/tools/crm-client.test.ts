import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarieCrmGetUrl,
  getCustomerByInsuranceNumber,
  getCustomerByPlzGeb,
  type MarieCrmClientConfig,
} from '../crm-client.js';

const TEST_CONFIG: MarieCrmClientConfig = {
  baseUrl: 'https://pflegemittelbox.de/api_leapingai',
  token: 'test-token',
  vnrEndpoint: 'kunde_vnr.php',
  plzGebEndpoint: 'kunde_plzb.php',
  vnrParam: 'insurance_number',
  plzParam: 'plz',
  hnrParam: 'hnr',
  bdayParam: 'bday',
};

test('buildMarieCrmGetUrl adds token and query params for VNR lookup', () => {
  const url = buildMarieCrmGetUrl(
    TEST_CONFIG.vnrEndpoint,
    { insurance_number: 'L039359923' },
    TEST_CONFIG
  );
  const parsed = new URL(url);
  assert.equal(parsed.origin + parsed.pathname, 'https://pflegemittelbox.de/api_leapingai/kunde_vnr.php');
  assert.equal(parsed.searchParams.get('token'), 'test-token');
  assert.equal(parsed.searchParams.get('insurance_number'), 'L039359923');
});

test('buildMarieCrmGetUrl adds PLZ lookup params', () => {
  const url = buildMarieCrmGetUrl(
    TEST_CONFIG.plzGebEndpoint,
    { plz: '41372', hnr: '100', bday: '1956-03-16' },
    TEST_CONFIG
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/api_leapingai/kunde_plzb.php');
  assert.equal(parsed.searchParams.get('plz'), '41372');
  assert.equal(parsed.searchParams.get('hnr'), '100');
  assert.equal(parsed.searchParams.get('bday'), '1956-03-16');
});

test('getCustomerByInsuranceNumber uses GET against kunde_vnr.php', async () => {
  let requestedUrl = '';
  const fetchFn = async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: '107484', birthday: '1956-03-16', mail: 'secret@x.y' }),
    } as Response;
  };

  const result = await getCustomerByInsuranceNumber('L039359923', TEST_CONFIG, fetchFn);
  assert.match(requestedUrl, /kunde_vnr\.php\?/);
  assert.match(requestedUrl, /token=test-token/);
  assert.match(requestedUrl, /insurance_number=L039359923/);
  assert.deepEqual(result, { id: '107484', birthday: '1956-03-16', mail: 'secret@x.y' });
});

test('getCustomerByPlzGeb uses GET against kunde_plzb.php', async () => {
  let requestedUrl = '';
  const fetchFn = async (input: string | URL | Request) => {
    requestedUrl = String(input);
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ id: '999', birthday: '1956-03-16' }),
    } as Response;
  };

  await getCustomerByPlzGeb(
    { plz: '41372', house_number: '100', birthday: '1956-03-16' },
    TEST_CONFIG,
    fetchFn
  );
  assert.match(requestedUrl, /kunde_plzb\.php\?/);
  assert.match(requestedUrl, /plz=41372/);
  assert.match(requestedUrl, /hnr=100/);
  assert.match(requestedUrl, /bday=1956-03-16/);
});
