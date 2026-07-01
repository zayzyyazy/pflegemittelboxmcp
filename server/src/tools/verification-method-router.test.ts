import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMethodChoiceIntro,
  buildMethodChoiceQuestion,
  runVerificationMethodRouter,
} from './verification-method-router.js';

const SESSION = 'router-test-session-001';

test('phone_lookup_found=true chooses phone path immediately with empty say', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-phone',
    phone_lookup_found: true,
  });

  assert.equal(result.active_brain, 'phone');
  assert.equal(result.next_brain, 'pmb_verification_phone_brain');
  assert.equal(result.say, '');
  assert.equal(result.requires_followup_mcp_call, true);
  assert.equal(result.session_id_received, true);
});

test('phone_lookup_found=true never asks method choice question', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-phone-no-ask',
    phone_lookup_found: true,
    latest_customer_input: 'Postleitzahl bitte',
  });

  assert.equal(result.active_brain, 'phone');
  assert.equal(result.say, '');
  assert.equal(result.next_brain, 'pmb_verification_phone_brain');
});

test('no phone match and no input asks method choice question', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-ask',
    phone_lookup_found: false,
  });

  assert.equal(result.active_brain, null);
  assert.equal(result.next_brain, null);
  assert.match(result.say, /Versichertennummer/);
  assert.match(result.say, /Postleitzahl/);
  assert.match(result.say, /Gerne, ich helfe Ihnen dabei/);
});

test('box-change intent uses warmer box wording', () => {
  const intro = buildMethodChoiceIntro('box_change');
  const question = buildMethodChoiceQuestion('boxwechsel');

  assert.match(intro, /Box zu ändern/);
  assert.match(question, /Box zu ändern/);
  assert.match(question, /Versichertennummer/);
});

test('delivery intent uses warmer delivery wording', () => {
  const intro = buildMethodChoiceIntro('delivery_status');
  const question = buildMethodChoiceQuestion('Wo ist meine Box?');

  assert.match(intro, /wo Ihre Box ist/);
  assert.match(question, /wo Ihre Box ist/);
});

test('customer chooses VNR via latest_customer_input', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-vnr-choice',
    phone_lookup_found: false,
    latest_customer_input: 'Ich möchte lieber mit der Versichertennummer',
  });

  assert.equal(result.active_brain, 'vnr');
  assert.equal(result.next_brain, 'pmb_verification_vnr_brain');
});

test('customer chooses address via PLZ keyword', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-address-choice',
    phone_lookup_found: false,
    latest_customer_input: 'Über die Postleitzahl bitte',
  });

  assert.equal(result.active_brain, 'address');
  assert.equal(result.next_brain, 'pmb_verification_address_brain');
});

test('spoken PLZ selects address path', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-plz-digits',
    phone_lookup_found: false,
    latest_customer_input: '41372',
  });

  assert.equal(result.active_brain, 'address');
});

test('spoken VNR candidate selects vnr path', () => {
  const result = runVerificationMethodRouter({
    session_id: SESSION + '-vnr-digits',
    phone_lookup_found: false,
    latest_customer_input: 'L039359923',
  });

  assert.equal(result.active_brain, 'vnr');
});

test('stored path is returned on subsequent router calls', () => {
  const sessionId = SESSION + '-persist';
  runVerificationMethodRouter({
    session_id: sessionId,
    phone_lookup_found: false,
    latest_customer_input: 'Versichertennummer',
  });

  const again = runVerificationMethodRouter({
    session_id: sessionId,
    phone_lookup_found: false,
    latest_customer_input: 'Postleitzahl',
  });

  assert.equal(again.active_brain, 'vnr');
  assert.equal(again.next_brain, 'pmb_verification_vnr_brain');
});

test('missing session_id runs in stateless mode', () => {
  const result = runVerificationMethodRouter({
    phone_lookup_found: false,
  });

  assert.equal(result.session_id_received, false);
  assert.equal(result.session_mode, 'stateless');
});
