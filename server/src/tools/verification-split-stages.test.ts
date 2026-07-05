import test from 'node:test';
import assert from 'node:assert/strict';
import { runVerificationMethodRouter } from './verification-method-router.js';
import {
  runVerificationAddressBrain,
  runVerificationPhoneBrain,
  runVerificationVnrBrain,
} from './verification-method-brains.js';
import { toLeapingVerificationBrainResponse } from './verification-brain-response.js';

const SESSION = 'split-stage-test-session';

test('split flow: phone caller skips method question and phone stage asks birthday', () => {
  const router = runVerificationMethodRouter({
    session_id: SESSION,
    customer_intent: 'lieferstatus',
    id_phone: '107484',
  });

  assert.equal(router.active_brain, 'phone');
  assert.equal(router.say, '');
  assert.equal(router.next_brain, 'pmb_verification_phone_brain');

  const phone = runVerificationPhoneBrain({
    session_id: SESSION,
    id_phone: '107484',
  } as Record<string, unknown>);

  assert.equal(phone.next_action, 'ASK_BIRTHDAY');
  assert.match(phone.say, /Geburtsdatum/i);
});

test('split flow: no phone match asks method then routes to VNR stage', () => {
  const routerAsk = runVerificationMethodRouter({
    session_id: `${SESSION}-vnr`,
    customer_intent: 'boxwechsel',
    get_customer_by_phone_result: 'not_found',
  });

  assert.equal(routerAsk.active_brain, null);
  assert.match(routerAsk.say, /Versichertennummer|Postleitzahl/i);

  const routerPick = runVerificationMethodRouter({
    session_id: `${SESSION}-vnr`,
    latest_customer_input: 'Versichertennummer bitte',
  });

  assert.equal(routerPick.active_brain, 'vnr');
  assert.equal(routerPick.next_brain, 'pmb_verification_vnr_brain');

  const vnr = runVerificationVnrBrain({
    session_id: `${SESSION}-vnr`,
  });

  assert.equal(vnr.next_action, 'ASK_VNR');
});

test('split flow: method choice address routes to PLZ stage', () => {
  const routerPick = runVerificationMethodRouter({
    session_id: `${SESSION}-plz`,
    latest_customer_input: 'Postleitzahl',
  });

  assert.equal(routerPick.active_brain, 'address');

  const plz = runVerificationAddressBrain({
    session_id: `${SESSION}-plz`,
  });

  assert.equal(plz.next_action, 'ASK_PLZ');
});

test('split flow: phone stage returns Leaping transition on success', () => {
  const sid = `${SESSION}-done`;
  runVerificationPhoneBrain({ session_id: sid, phone_lookup_found: true });
  runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    birthday_system_available: true,
  });
  const done = runVerificationPhoneBrain({
    session_id: sid,
    phone_lookup_found: true,
    birthday_customer: '1956-03-16',
    check_birthday_result: 'success',
  });

  const leaping = toLeapingVerificationBrainResponse(done);
  assert.equal(leaping.action_type, 'TRANSITION');
  assert.equal(leaping.transition_name, 'weiter');
});
