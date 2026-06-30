import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROCUREMENT_BASELINE,
  reviewProcurementReadiness,
  type ProcurementQuestion,
} from '../modules/enterprise/src/procurement-readiness.js';

test('procurement baseline is buyer-safe but honestly gap-labeled', () => {
  const review = reviewProcurementReadiness();

  assert.equal(review.decision, 'BUYER_SAFE_WITH_GAPS');
  assert.deepEqual(review.unsafeAnswers, []);
  assert.ok(review.gapAnswers.includes('tenant_isolation'));
  assert.ok(review.gapAnswers.includes('data_residency'));
  assert.ok(review.gapAnswers.includes('sso'));
  assert.ok(review.gapAnswers.includes('soc2'));
  assert.ok(review.buyerSafeAnswers.includes('payment_processing'));
  assert.ok(review.actions.every((action) => action.evidenceRequired.includes('proof') || action.evidenceRequired.includes('attestation') || action.evidenceRequired.includes('roadmap')));
});

test('procurement packet cannot be sent when an answer has no evidence', () => {
  const questions: ProcurementQuestion[] = PROCUREMENT_BASELINE.map((question) =>
    question.id === 'monitoring'
      ? { ...question, evidence: [] }
      : question,
  );

  const review = reviewProcurementReadiness(questions);

  assert.equal(review.decision, 'DO_NOT_SEND_PACKET');
  assert.deepEqual(review.unsafeAnswers, ['monitoring']);
  assert.ok(review.actions.some((action) => action.action.includes('Fix unsafe procurement answer')));
});

test('procurement packet cannot be sent when buyer-safe wording is false', () => {
  const questions: ProcurementQuestion[] = PROCUREMENT_BASELINE.map((question) =>
    question.id === 'data_residency'
      ? { ...question, buyerSafe: false, answer: 'Yes, unconditional regional residency is guaranteed.' }
      : question,
  );

  const review = reviewProcurementReadiness(questions);

  assert.equal(review.decision, 'DO_NOT_SEND_PACKET');
  assert.deepEqual(review.unsafeAnswers, ['data_residency']);
  assert.ok(review.actions.some((action) => action.owner === 'Founder/legal'));
});

test('procurement packet is ready only when all questions are ready, not applicable, and evidenced', () => {
  const questions: ProcurementQuestion[] = PROCUREMENT_BASELINE.map((question) => ({
    ...question,
    status: question.status === 'NOT_APPLICABLE' ? 'NOT_APPLICABLE' : 'READY',
    evidence: [`evidence/${question.id}.md`],
    buyerSafe: true,
  }));

  const review = reviewProcurementReadiness(questions);

  assert.equal(review.decision, 'BUYER_SAFE_PACKET_READY');
  assert.deepEqual(review.gapAnswers, []);
  assert.deepEqual(review.unsafeAnswers, []);
  assert.equal(review.buyerSafeAnswers.length, questions.length);
});
