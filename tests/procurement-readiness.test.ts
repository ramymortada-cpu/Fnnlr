import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  PROCUREMENT_BASELINE,
  PROCUREMENT_PACKET_REQUIREMENTS,
  findUnsafeProcurementClaims,
  reviewProcurementChecklist,
  reviewProcurementReadiness,
  type ProcurementQuestion,
} from '../modules/enterprise/src/procurement-readiness.js';

function procurementChecklist() {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'PROCUREMENT_CHECKLIST.md'), 'utf8');
}

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

test('procurement checklist links every required enterprise buyer packet artifact', () => {
  const review = reviewProcurementChecklist(procurementChecklist());

  assert.equal(review.decision, 'PROCUREMENT_CHECKLIST_READY', JSON.stringify(review, null, 2));
  assert.deepEqual(review.missing, []);
  assert.deepEqual(review.unsafeClaims, []);
  assert.equal(review.present.length, PROCUREMENT_PACKET_REQUIREMENTS.length);
});

test('procurement checklist reports missing packet artifacts', () => {
  const review = reviewProcurementChecklist('Only TRUST_CENTER_INDEX.md is linked.');

  assert.equal(review.decision, 'PROCUREMENT_CHECKLIST_HAS_GAPS');
  assert.ok(review.missing.includes('customer_agreement'));
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('CUSTOMER_AGREEMENT_DRAFT.md')));
});

test('procurement checklist blocks unsafe enterprise sales claims', () => {
  const unsafe = findUnsafeProcurementClaims([
    'SOC 2 certified for every buyer.',
    'Enterprise-ready today.',
    'Payment processing is ready.',
    'Guaranteed revenue.',
  ].join('\n'));

  assert.deepEqual(unsafe.sort(), ['enterprise_ready', 'guaranteed_revenue', 'payment_processing_ready', 'soc2_certified']);
});

test('procurement checklist permits roadmap and gap-labeled language', () => {
  const safe = findUnsafeProcurementClaims([
    'SOC2 is roadmap only.',
    'Enterprise readiness is limited until hosted proof closes.',
    'No guaranteed revenue.',
    'Payment processing is not part of GA v1.',
  ].join('\n'));

  assert.deepEqual(safe, []);
});
