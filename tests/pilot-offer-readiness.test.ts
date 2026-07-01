import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PILOT_OFFER_BASELINE,
  findUnsafePilotClaims,
  reviewPilotOfferReadiness,
  type PilotOfferCapability,
} from '../modules/sales-ops/src/pilot-offer-readiness.js';

test('pilot offer is contract-ready but not repeatable until hosted pilot evidence exists', () => {
  const review = reviewPilotOfferReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_HOSTED_GAPS');
  assert.equal(review.repeatablePilotAllowed, false);
  assert.ok(review.readyCapabilities.includes('target_icp'));
  assert.ok(review.readyCapabilities.includes('success_criteria'));
  assert.ok(review.gapCapabilities.includes('hosted_pilot_evidence'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('pilot offer readiness blocks unsafe revenue, auto-send, payment, billing, and fake GA claims', () => {
  const review = reviewPilotOfferReadiness(PILOT_OFFER_BASELINE, [
    { section: 'headline', copy: 'Guaranteed ROI in the first week.' },
    { section: 'scope', copy: 'We auto-send WhatsApp for you.' },
    { section: 'payments', copy: 'fnnlr processes payments and moves money.' },
    { section: 'billing', copy: 'Automatic billing is included.' },
    { section: 'trust', copy: 'GateForge approved this for GA.' },
  ]);

  assert.equal(review.decision, 'DO_NOT_OFFER_PILOT');
  assert.deepEqual(
    review.unsafeClaims.map((claim) => claim.claim).sort(),
    ['auto_send', 'ga_approval', 'guaranteed_revenue', 'payment_processing', 'self_serve_billing'],
  );
});

test('pilot unsafe claim detector permits explicit boundary copy', () => {
  const findings = findUnsafePilotClaims([
    { section: 'limits', copy: 'No guaranteed revenue, no auto-send, no payment processing, and no automatic billing.' },
    { section: 'limits-ar', copy: 'لا نضمن مبيعات ولا نعالج الدفع.' },
  ]);

  assert.deepEqual(findings, []);
});

test('pilot offer readiness blocks when success criteria evidence is missing', () => {
  const capabilities: PilotOfferCapability[] = PILOT_OFFER_BASELINE.map((capability) =>
    capability.id === 'success_criteria'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewPilotOfferReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_OFFER_PILOT');
  assert.deepEqual(review.blockedCapabilities, ['success_criteria']);
});

test('pilot offer can become repeatable only when all capabilities are ready and copy is safe', () => {
  const capabilities: PilotOfferCapability[] = PILOT_OFFER_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['hosted-pilot-proof.md'],
  }));

  const review = reviewPilotOfferReadiness(capabilities, [
    { section: 'scope', copy: 'Assisted setup, first workflow launch, and first-week evidence review.' },
  ]);

  assert.equal(review.decision, 'REPEATABLE_PILOT_READY');
  assert.equal(review.repeatablePilotAllowed, true);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
  assert.deepEqual(review.unsafeClaims, []);
});
