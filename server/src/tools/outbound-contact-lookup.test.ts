import test from 'node:test';
import assert from 'node:assert/strict';
import {
  coerceOutboundContactLookupInput,
  runKrankenkasseContactLookup,
  runProviderContactLookup,
} from './outbound-contact-lookup.js';

test('matches TK to Techniker Krankenkasse official contact number', () => {
  const result = runKrankenkasseContactLookup(
    coerceOutboundContactLookupInput({ spoken_name: 'TK' })
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, 'Techniker Krankenkasse');
  assert.equal(result.phone_number, '0800 285 85 85');
  assert.match(result.source_url ?? '', /tk\.de/);
});

test('matches spoken Techniker variant to Techniker Krankenkasse', () => {
  const result = runKrankenkasseContactLookup(
    coerceOutboundContactLookupInput({ name: 'Techniker' })
  );

  assert.equal(result.ok, true);
  assert.equal(result.matched_name, 'Techniker Krankenkasse');
});

test('returns ambiguous for generic AOK without region', () => {
  const result = runKrankenkasseContactLookup(
    coerceOutboundContactLookupInput({ spoken_name: 'AOK' })
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.phone_number, null);
  assert.match(result.reason, /ambiguous/i);
});

test('matches provider name variant to PubliCare official contact number', () => {
  const result = runProviderContactLookup(
    coerceOutboundContactLookupInput({ spoken_name: 'Public Care' })
  );

  assert.equal(result.ok, true);
  assert.equal(result.status, 'found');
  assert.equal(result.matched_name, 'PubliCare GmbH');
  assert.equal(result.phone_number, '0800 7090490');
  assert.match(result.source_url ?? '', /publicare-gmbh\.de/);
});
