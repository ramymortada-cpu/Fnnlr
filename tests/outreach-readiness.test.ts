import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OUTREACH_READINESS_BASELINE,
  findUnsafeOutreachClaims,
  reviewOutreachReadiness,
  type OutreachCapability,
} from '../modules/sales-ops/src/outreach-readiness.js';

test('outreach readiness requires compliance review before repeatable outreach', () => {
  const review = reviewOutreachReadiness();

  assert.equal(review.decision, 'COMPLIANCE_REVIEW_REQUIRED');
  assert.equal(review.repeatableOutreachAllowed, false);
  assert.ok(review.readyCapabilities.includes('icp_definition'));
  assert.ok(review.complianceCapabilities.includes('opt_out_language'));
  assert.ok(review.gapCapabilities.includes('source_tracking'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('outreach readiness blocks unsafe revenue, auto-send, payment, and fake GA claims', () => {
  const review = reviewOutreachReadiness(OUTREACH_READINESS_BASELINE, [
    { step: 'problem opener', copy: 'We guarantee revenue in 7 days.' },
    { step: 'proof opener', copy: 'fnnlr will auto-send WhatsApp replies.' },
    { step: 'pilot offer', copy: 'We process payments and move money for you.' },
    { step: 'follow-up', copy: 'GateForge approved this for GA already.' },
  ]);

  assert.equal(review.decision, 'DO_NOT_SEND_OUTREACH');
  assert.deepEqual(
    review.unsafeClaims.map((claim) => claim.claim).sort(),
    ['auto_send', 'ga_approved_without_evidence', 'guaranteed_revenue', 'payment_processing'],
  );
  assert.ok(review.actions.some((action) => /unsafe outreach claim/.test(action.action)));
});

test('unsafe claim detector permits explicit negated boundary copy', () => {
  const findings = findUnsafeOutreachClaims([
    { step: 'proof opener', copy: 'No guaranteed revenue, no auto-send, and fnnlr does not process payments.' },
    { step: 'guardrail', copy: 'لا نضمن مبيعات ولا نعالج الدفع.' },
  ]);

  assert.deepEqual(findings, []);
});

test('outreach readiness blocks when ICP evidence is missing', () => {
  const capabilities: OutreachCapability[] = OUTREACH_READINESS_BASELINE.map((capability) =>
    capability.id === 'icp_definition'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewOutreachReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_SEND_OUTREACH');
  assert.deepEqual(review.blockedCapabilities, ['icp_definition']);
});

test('outreach can become repeatable only when compliance, tracking, owner, and hosted proof are ready', () => {
  const capabilities: OutreachCapability[] = OUTREACH_READINESS_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['outreach-proof.md'],
  }));

  const review = reviewOutreachReadiness(capabilities, [
    { step: 'problem opener', copy: 'Missed WhatsApp follow-up can hide drop-offs; want a 20-minute workflow visibility demo?' },
  ]);

  assert.equal(review.decision, 'REPEATABLE_OUTREACH_READY');
  assert.equal(review.repeatableOutreachAllowed, true);
  assert.deepEqual(review.complianceCapabilities, []);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
  assert.deepEqual(review.unsafeClaims, []);
});
