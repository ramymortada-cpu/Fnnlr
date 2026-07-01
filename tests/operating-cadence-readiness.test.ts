import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OPERATING_CADENCE_BASELINE,
  reviewOperatingCadenceReadiness,
  type OperatingCadenceCapability,
} from '../modules/operating-room/src/readiness.js';

test('operating cadence baseline is contract-ready with hosted evidence gap', () => {
  const review = reviewOperatingCadenceReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_HOSTED_GAPS');
  assert.equal(review.operatingCadenceClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('customer_health_signal_model'));
  assert.ok(review.readyCapabilities.includes('support_triage_catalog'));
  assert.ok(review.readyCapabilities.includes('critical_issue_ownership'));
  assert.ok(review.gapCapabilities.includes('hosted_issue_log_evidence'));
  assert.deepEqual(review.blockedCapabilities, []);
  assert.ok(review.actions.every((action) => action.evidenceRequired.length > 20));
});

test('operating cadence readiness blocks claims when health evidence is missing', () => {
  const capabilities = OPERATING_CADENCE_BASELINE.map((capability) =>
    capability.id === 'customer_health_owner_action'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewOperatingCadenceReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_OPERATING_CADENCE_READY');
  assert.deepEqual(review.blockedCapabilities, ['customer_health_owner_action']);
});

test('operating cadence can become ready when every required capability has proof', () => {
  const capabilities: OperatingCadenceCapability[] = OPERATING_CADENCE_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['hosted-operating-proof.md'],
  }));

  const review = reviewOperatingCadenceReadiness(capabilities);

  assert.equal(review.decision, 'OPERATING_CADENCE_READY');
  assert.equal(review.operatingCadenceClaimAllowed, true);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});
