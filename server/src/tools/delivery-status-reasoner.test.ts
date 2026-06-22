import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeliveryStatusReasoner } from './delivery-status-reasoner.js';

test('returns insufficient data when required delivery inputs are missing', () => {
  const result = runDeliveryStatusReasoner({});
  assert.equal(result.delivery_status, 'INSUFFICIENT_DATA');
  assert.equal(result.ok, false);
});

test('returns customer not active when status is not aktiv', () => {
  const result = runDeliveryStatusReasoner({
    status: 'inaktiv',
    box_genehmigt: 'genehmigt',
    requested_month: 'März',
  });
  assert.equal(result.delivery_status, 'CUSTOMER_NOT_ACTIVE');
});

test('returns box not approved when box_genehmigt is not genehmigt', () => {
  const result = runDeliveryStatusReasoner({
    status: 'aktiv',
    box_genehmigt: 'offen',
    requested_month: 'März',
  });
  assert.equal(result.delivery_status, 'BOX_NOT_APPROVED');
});

test('returns no valid approval when approval start dates are missing', () => {
  const result = runDeliveryStatusReasoner({
    status: 'aktiv',
    box_genehmigt: 'genehmigt',
    requested_month: 'März',
  });
  assert.equal(result.delivery_status, 'NO_VALID_APPROVAL');
});

test('returns shipped when requested month appears in shipment history', () => {
  const result = runDeliveryStatusReasoner({
    status: 'aktiv',
    box_genehmigt: 'genehmigt',
    requested_month: 'März',
    gen_pg54_ab: '2024-01-01',
    letzte_box: ['Februar 2024', 'März 2024'],
  });
  assert.equal(result.delivery_status, 'ACTIVE_AND_SHIPPED');
});

test('returns not shipped when requested month does not appear in shipment history', () => {
  const result = runDeliveryStatusReasoner({
    status: 'aktiv',
    box_genehmigt: 'genehmigt',
    requested_month: 'März',
    gen_pg51_ab: '2024-01-01',
    letzte_box: ['Februar 2024'],
  });
  assert.equal(result.delivery_status, 'ACTIVE_NOT_SHIPPED');
  assert.match(result.say, /keine versendete Pflegebox/i);
});
