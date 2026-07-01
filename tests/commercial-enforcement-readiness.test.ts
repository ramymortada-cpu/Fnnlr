import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMIT_ENFORCEMENT_BASELINE,
  reviewLimitEnforcementReadiness,
  type LimitEnforcementCapability,
} from '../modules/commercial/src/enforcement-readiness.js';

test('limit enforcement baseline is contract-ready with route-level gaps', () => {
  const review = reviewLimitEnforcementReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_ROUTE_GAPS');
  assert.equal(review.enforcementClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('plan_limit_source'));
  assert.ok(review.readyCapabilities.includes('negative_overage_tests'));
  assert.ok(review.gapCapabilities.includes('seat_enforcement_point'));
  assert.ok(review.gapCapabilities.includes('workflow_enforcement_point'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('limit enforcement readiness blocks claims when evidence is missing', () => {
  const capabilities: LimitEnforcementCapability[] = LIMIT_ENFORCEMENT_BASELINE.map((capability) =>
    capability.id === 'plan_limit_source'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewLimitEnforcementReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_ENFORCEMENT_READY');
  assert.equal(review.enforcementClaimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['plan_limit_source']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach limit enforcement evidence')));
});

test('limit enforcement readiness allows enforcement-ready only when every required capability is evidenced and ready', () => {
  const capabilities: LimitEnforcementCapability[] = LIMIT_ENFORCEMENT_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/limits/${capability.id}.md`],
  }));

  const review = reviewLimitEnforcementReadiness(capabilities);

  assert.equal(review.decision, 'ENFORCEMENT_READY');
  assert.equal(review.enforcementClaimAllowed, true);
  assert.equal(review.readyCapabilities.length, capabilities.length);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('limit enforcement readiness keeps optional future resources from blocking the base claim', () => {
  const capabilities: LimitEnforcementCapability[] = LIMIT_ENFORCEMENT_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/limits/${capability.id}.md`],
  }));
  capabilities.push({
    id: 'support_tier_mapping',
    label: 'Premium add-on support queue',
    status: 'ROADMAP',
    owner: 'Support',
    evidence: ['docs/SUPPORT_WORKFLOW.md'],
    requiredForEnforcementClaim: false,
  });

  const review = reviewLimitEnforcementReadiness(capabilities);

  assert.equal(review.decision, 'ENFORCEMENT_READY');
  assert.equal(review.enforcementClaimAllowed, true);
  assert.ok(review.gapCapabilities.includes('support_tier_mapping'));
});
