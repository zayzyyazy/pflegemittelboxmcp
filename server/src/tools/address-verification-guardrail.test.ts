import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAddressVerificationGuardrail } from './address-verification-guardrail.js';

const baseInput = {
  known_plz: null,
  known_house_number: null,
  known_birthday: null,
  attempt: 1,
};

test('normalizes numeric house number suffixes down to digits only', () => {
  const result = parseAddressVerificationGuardrail({
    ...baseInput,
    raw_text: 'Hausnummer 14a',
  });

  assert.equal(result.house_number, '14');
});

test('parses spoken split house number with suffix and preserves known values for lookup', () => {
  const result = parseAddressVerificationGuardrail({
    raw_text: 'vierzehn alpha',
    known_plz: '22765',
    known_house_number: null,
    known_birthday: '1948-05-03',
    attempt: 1,
  });

  assert.equal(result.house_number, '14');
  assert.deepEqual(result.missing_fields, []);
  assert.equal(result.safe_to_lookup, true);
  assert.equal(result.next_action, 'lookup');
});

test('parses hundred variants for house numbers', () => {
  const cases = [
    ['Hausnummer hundert', '100'],
    ['Hausnummer einhundert', '100'],
    ['Hausnummer eins null null', '100'],
    ['Hausnummer eins-null-null', '100'],
    ['Hausnummer ein hundert', '100'],
    ['Hausnummer zweiundzwanzig', '22'],
    ['Hausnummer hundertdreizehn', '113'],
    ['Hausnummer einhundertdreizehn', '113'],
    ['14a', '14'],
    ['vierzehn a', '14'],
  ] as const;

  for (const [raw_text, expected] of cases) {
    const result = parseAddressVerificationGuardrail({
      ...baseInput,
      raw_text,
    });

    assert.equal(result.house_number, expected, raw_text);
  }
});

test('ready lookup response uses lookup next action when last clear house number arrives', () => {
  const result = parseAddressVerificationGuardrail({
    raw_text: 'Hausnummer hundertdreizehn',
    known_plz: '22765',
    known_house_number: null,
    known_birthday: '1948-05-03',
    attempt: 1,
  });

  assert.deepEqual(result, {
    plz: '22765',
    house_number: '113',
    birthday: '1948-05-03',
    missing_fields: [],
    confidence: 'high',
    safe_to_lookup: true,
    next_action: 'lookup',
    say_hint: 'Danke, ich prüfe das jetzt.',
    reason: 'Missing field was provided and known fields were preserved.',
  });
});
