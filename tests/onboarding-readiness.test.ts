import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_SEGMENTATION_BASELINE,
  reviewOnboardingSegmentationReadiness,
  type OnboardingSegmentationCapability,
} from '../modules/activation/src/onboarding-readiness.js';

test('onboarding segmentation baseline is contract-ready with honest product gaps', () => {
  const review = reviewOnboardingSegmentationReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_ONBOARDING_GAPS');
  assert.equal(review.tailoredOnboardingClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('activation_event_capture'));
  assert.ok(review.readyCapabilities.includes('industry_template_mapping'));
  assert.ok(review.gapCapabilities.includes('goal_workflow_mapping'));
  assert.ok(review.gapCapabilities.includes('hosted_onboarding_proof'));
  assert.equal(review.blockedCapabilities.length, 0);
  assert.ok(review.actions.every((action) => action.evidenceRequired.length > 20));
});

test('onboarding segmentation missing evidence blocks tailored onboarding claims', () => {
  const capabilities = ONBOARDING_SEGMENTATION_BASELINE.map((capability) =>
    capability.id === 'activation_event_capture'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewOnboardingSegmentationReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_TAILORED_ONBOARDING_READY');
  assert.equal(review.tailoredOnboardingClaimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['activation_event_capture']);
});

test('onboarding segmentation can become ready when every required capability has proof', () => {
  const capabilities: OnboardingSegmentationCapability[] = ONBOARDING_SEGMENTATION_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['hosted-proof.md'],
  }));

  const review = reviewOnboardingSegmentationReadiness(capabilities);

  assert.equal(review.decision, 'TAILORED_ONBOARDING_READY');
  assert.equal(review.tailoredOnboardingClaimAllowed, true);
  assert.equal(review.gapCapabilities.length, 0);
  assert.equal(review.blockedCapabilities.length, 0);
});

test('optional future onboarding capability does not block the required claim', () => {
  const optionalCapability: OnboardingSegmentationCapability = {
    id: 'hosted_onboarding_proof',
    label: 'Extra onboarding video proof',
    area: 'proof',
    status: 'ROADMAP',
    owner: 'Support',
    evidence: ['docs/ACTIVATION_METRICS_SPEC.md'],
    requiredForTailoredOnboardingClaim: false,
  };
  const capabilities = [...ONBOARDING_SEGMENTATION_BASELINE, optionalCapability].map((capability) =>
    capability.requiredForTailoredOnboardingClaim
      ? { ...capability, status: 'READY' as const, evidence: capability.evidence.length ? capability.evidence : ['proof.md'] }
      : capability,
  );

  const review = reviewOnboardingSegmentationReadiness(capabilities);

  assert.equal(review.decision, 'TAILORED_ONBOARDING_READY');
  assert.equal(review.tailoredOnboardingClaimAllowed, true);
  assert.ok(review.gapCapabilities.includes('hosted_onboarding_proof'));
});
