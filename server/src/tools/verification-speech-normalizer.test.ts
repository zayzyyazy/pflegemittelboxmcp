import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyVerificationMethodChoice,
  methodChoiceClarificationSay,
} from './verification-speech-normalizer.js';
import { runUnifiedVerificationBrain } from './verification-orchestrator.js';

test('classifyVerificationMethodChoice accepts Post as PLZ', () => {
  const result = classifyVerificationMethodChoice('Post');
  assert.equal(result.path, 'address');
  assert.equal(result.confidence, 'medium');
});

test('classifyVerificationMethodChoice accepts versichern as VNR', () => {
  const result = classifyVerificationMethodChoice('Verischern');
  assert.equal(result.path, 'vnr');
});

test('classifyVerificationMethodChoice rejects unrelated words', () => {
  const result = classifyVerificationMethodChoice('Banane');
  assert.equal(result.path, null);
  assert.equal(result.confidence, 'low');
});

test('methodChoiceClarificationSay escalates without repeating full intro', () => {
  assert.match(methodChoiceClarificationSay(1), /Versichertennummer oder die Postleitzahl/i);
  assert.doesNotMatch(methodChoiceClarificationSay(1), /Gerne, ich helfe Ihnen dabei/i);
});

test('unified flow: Post selects address and asks PLZ', () => {
  const sessionId = 'speech-normalizer-post';
  runUnifiedVerificationBrain({ session_id: sessionId });
  const pick = runUnifiedVerificationBrain({ session_id: sessionId, latest_customer_input: 'Post' });
  assert.equal(pick.active_brain, 'address');
  assert.equal(pick.next_action, 'ASK_PLZ');
});
