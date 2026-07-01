import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVerificationBirthday } from './verification-method-brains.js';

test('parseVerificationBirthday handles STT typo sechzen märz fünfzig', () => {
  const parsed = parseVerificationBirthday('sechzen märz fünfzig');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles sechzehn märz fünfzig', () => {
  const parsed = parseVerificationBirthday('sechzehn märz fünfzig');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles sechzehnter märz fünfzig', () => {
  const parsed = parseVerificationBirthday('sechzehnter märz fünfzig');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles sechzehnter märz neunzehnhundertfünfzig', () => {
  const parsed = parseVerificationBirthday('sechzehnter märz neunzehnhundertfünfzig');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles ordinal month sechzehnter dritter fünfzig', () => {
  const parsed = parseVerificationBirthday('sechzehnter dritter fünfzig');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles space-separated 16 3 50', () => {
  const parsed = parseVerificationBirthday('16 3 50');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday handles dotted 16.03.1950', () => {
  const parsed = parseVerificationBirthday('16.03.1950');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday maps fünfzig to 1950 not 2050', () => {
  const parsed = parseVerificationBirthday('16.03.50');
  assert.equal(parsed.status, 'complete');
  assert.equal(parsed.iso, '1950-03-16');
});

test('parseVerificationBirthday rejects future impossible birthday', () => {
  const parsed = parseVerificationBirthday('16.03.2030');
  assert.equal(parsed.status, 'impossible');
});
