import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceOutboundContactLookupInput,
  runKrankenkasseContactLookup,
  runProviderContactLookup,
} from './outbound-contact-lookup.js';

function insurerLookup(name: string) {
  return runKrankenkasseContactLookup(
    coerceOutboundContactLookupInput({ spoken_name: name })
  );
}

function providerLookup(name: string) {
  return runProviderContactLookup(
    coerceOutboundContactLookupInput({ spoken_name: name })
  );
}

function assertInsurerFound(
  spokenName: string,
  matchedName: string,
  phoneNumber: string
): void {
  const result = insurerLookup(spokenName);
  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, matchedName);
  assert.equal(result.phone_number, phoneNumber);
  assert.equal(result.normalized_input, spokenName.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'));
  assert.ok(result.matched_alias);
  assert.equal(result.candidates.length, 0);
}

test('matches TK to Techniker Krankenkasse official contact number', () => {
  const result = insurerLookup('TK');

  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, 'Techniker Krankenkasse');
  assert.equal(result.phone_number, '0800 285 85 85');
  assert.match(result.source_url ?? '', /tk\.de/);
  assert.equal(result.matched_alias, 'tk');
});

test('matches spoken Techniker variant to Techniker Krankenkasse', () => {
  assertInsurerFound('Techniker', 'Techniker Krankenkasse', '0800 285 85 85');
});

test('matches full Techniker Krankenkasse name', () => {
  assertInsurerFound('Techniker Krankenkasse', 'Techniker Krankenkasse', '0800 285 85 85');
});

test('matches BARMER uppercase variant', () => {
  assertInsurerFound('BARMER', 'BARMER', '0202 568 333 1010');
});

test('matches Barmer mixed-case variant', () => {
  assertInsurerFound('Barmer', 'BARMER', '0202 568 333 1010');
});

test('matches Vivida BKK', () => {
  assertInsurerFound('Vivida BKK', 'vivida bkk', '07720 9727-0');
});

test('matches spoken Vivida variant without BKK suffix', () => {
  assertInsurerFound('Vivida', 'vivida bkk', '07720 9727-0');
});

test('matches BKK Diakonie', () => {
  assertInsurerFound('BKK Diakonie', 'BKK Diakonie', '0521 329876 - 120');
});

test('matches Diakonie BKK placement variant', () => {
  assertInsurerFound('Diakonie BKK', 'BKK Diakonie', '0521 329876 - 120');
});

test('matches Audi BKK', () => {
  assertInsurerFound('Audi BKK', 'Audi BKK', '0841 887-0');
});

test('matches BAHN-BKK punctuation variant', () => {
  assertInsurerFound('BAHN-BKK', 'BAHN-BKK', '0800 22 46 255');
});

test('matches Bahn BKK spacing variant', () => {
  assertInsurerFound('Bahn BKK', 'BAHN-BKK', '0800 22 46 255');
});

test('matches AOK Bayern', () => {
  assertInsurerFound('AOK Bayern', 'AOK Bayern', '089 31 21 20');
});

test('matches AOK PLUS', () => {
  assertInsurerFound('AOK PLUS', 'AOK PLUS', '0800 1059000');
});

test('matches AOK Niedersachsen', () => {
  assertInsurerFound('AOK Niedersachsen', 'AOK Niedersachsen', '0800 0265637');
});

test('returns ambiguous for generic AOK without region', () => {
  const result = insurerLookup('AOK');

  assert.equal(result.ok, false);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.phone_number, null);
  assert.equal(result.normalized_input, 'aok');
  assert.equal(result.matched_alias, 'aok');
  assert.ok(result.candidates.includes('AOK Bayern'));
  assert.ok(result.candidates.includes('AOK PLUS'));
  assert.match(result.reason, /ambiguous/i);
});

test('returns ambiguous for generic IKK', () => {
  const result = insurerLookup('IKK');

  assert.equal(result.ok, false);
  assert.equal(result.status, 'ambiguous');
  assert.ok(result.candidates.includes('IKK classic'));
  assert.ok(result.candidates.includes('IKK gesund plus'));
});

test('returns not_found for an unknown insurer', () => {
  const result = insurerLookup('Mond Krankenkasse');

  assert.equal(result.ok, false);
  assert.equal(result.status, 'not_found');
  assert.equal(result.matched_name, null);
  assert.equal(result.phone_number, null);
  assert.equal(result.candidates.length, 0);
  assert.match(result.reason, /no trustworthy official contact number/i);
});

test('matches provider name variant to PubliCare official contact number', () => {
  const result = providerLookup('Public Care');

  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, 'PubliCare GmbH');
  assert.equal(result.phone_number, '0800 7090490');
  assert.match(result.source_url ?? '', /publicare-gmbh\.de/);
  assert.equal(result.matched_alias, 'public care');
});

test('matches provider punctuation variant to PAUL HARTMANN AG', () => {
  const result = providerLookup('Paul-Hartmann AG');

  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, 'PAUL HARTMANN AG');
  assert.equal(result.phone_number, '0800 000 52 55');
});
