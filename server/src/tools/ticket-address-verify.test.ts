import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeGermanPlz,
  ortMatchesPlzLocalities,
  formatPlzOrtMismatchReason,
} from './german-plz-ort.js';
import { runTicketAddressVerify } from './ticket-address-verify.js';

test('normalizeGermanPlz accepts 5-digit codes', () => {
  assert.equal(normalizeGermanPlz('41372'), '41372');
  assert.equal(normalizeGermanPlz('41 372'), '41372');
  assert.equal(normalizeGermanPlz('4137'), null);
});

test('ortMatchesPlzLocalities matches municipality variants', () => {
  const localities = [
    {
      postalCode: '41372',
      name: 'Niederkrüchten',
      municipalityName: 'Niederkrüchten',
      districtName: 'Viersen',
      federalStateName: 'Nordrhein-Westfalen',
    },
  ];
  assert.equal(ortMatchesPlzLocalities('Niederkrüchten', localities), true);
  assert.equal(ortMatchesPlzLocalities('Kirchhellen', localities), false);
});

test('runTicketAddressVerify fails fast on PLZ/Ort mismatch', async () => {
  const result = await runTicketAddressVerify(
    { plz: '41372', ort: 'München', street: 'Hauptstraße 1' },
    {
      lookupPlz: async () => [
        {
          postalCode: '41372',
          name: 'Niederkrüchten',
          municipalityName: 'Niederkrüchten',
          districtName: 'Viersen',
          federalStateName: 'Nordrhein-Westfalen',
        },
      ],
      geocodeStreet: async () => {
        throw new Error('should not be called');
      },
    }
  );

  assert.equal(result.status, 'NOT_SAFE');
  assert.equal(result.checks.plz_ort, 'fail');
  assert.equal(result.checks.street, 'skipped');
  assert.match(result.reason ?? '', /41372/);
});

test('runTicketAddressVerify returns SAFE when street geocoder is confident', async () => {
  const result = await runTicketAddressVerify(
    { plz: '41372', ort: 'Niederkrüchten', street: 'Hauptstraße 1' },
    {
      lookupPlz: async () => [
        {
          postalCode: '41372',
          name: 'Niederkrüchten',
          municipalityName: 'Niederkrüchten',
          districtName: 'Viersen',
          federalStateName: 'Nordrhein-Westfalen',
        },
      ],
      geocodeStreet: async () => ({
        found: true,
        confident: true,
        reason: null,
        provider: 'nominatim',
        matched_display_name: 'Hauptstraße 1, Niederkrüchten',
      }),
    }
  );

  assert.equal(result.status, 'SAFE');
  assert.equal(result.reason, null);
  assert.equal(result.checks.street, 'pass');
});

test('runTicketAddressVerify returns NOT_SAFE on uncertain geocoder match', async () => {
  const result = await runTicketAddressVerify(
    { plz: '41372', ort: 'Niederkrüchten', street: 'Fantasieweg 99' },
    {
      lookupPlz: async () => [
        {
          postalCode: '41372',
          name: 'Niederkrüchten',
          municipalityName: 'Niederkrüchten',
          districtName: null,
          federalStateName: null,
        },
      ],
      geocodeStreet: async () => ({
        found: false,
        confident: false,
        reason: "Street 'Fantasieweg 99' not found in PLZ 41372",
        provider: 'nominatim',
        matched_display_name: null,
      }),
    }
  );

  assert.equal(result.status, 'NOT_SAFE');
  assert.match(formatPlzOrtMismatchReason('99999', 'Nowhere', []), /not a known German postal code/);
});
