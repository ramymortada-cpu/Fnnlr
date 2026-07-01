import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ONBOARDING_SEGMENTATION_BASELINE,
  ONBOARDING_GOAL_WORKFLOW_MAP,
  buildOnboardingActivationPlan,
  reviewOnboardingSegmentationInput,
  reviewOnboardingSegmentationReadiness,
  type OnboardingSegmentationCapability,
} from '../modules/activation/src/onboarding-readiness.js';

test('onboarding segmentation baseline is contract-ready with honest product gaps', () => {
  const review = reviewOnboardingSegmentationReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_ONBOARDING_GAPS');
  assert.equal(review.tailoredOnboardingClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('activation_event_capture'));
  assert.ok(review.readyCapabilities.includes('goal_workflow_mapping'));
  assert.ok(review.readyCapabilities.includes('negative_validation_tests'));
  assert.ok(review.readyCapabilities.includes('industry_template_mapping'));
  assert.ok(review.gapCapabilities.includes('hosted_onboarding_proof'));
  assert.ok(review.gapCapabilities.includes('industry_selection_field'));
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

test('onboarding segmentation input maps industry and goal to a first activation plan', () => {
  const review = reviewOnboardingSegmentationInput({
    industry: 'real-estate',
    goal: 'improve whatsapp conversion',
  });

  assert.equal(review.ok, true);
  assert.equal(review.normalizedIndustry, 'real_estate');
  assert.equal(review.normalizedGoal, 'improve_whatsapp_conversion');
  assert.equal(review.plan?.templateId, 'industry-real-estate-v1');
  assert.equal(review.plan?.firstWorkflow, ONBOARDING_GOAL_WORKFLOW_MAP.improve_whatsapp_conversion.firstWorkflow);
  assert.equal(review.plan?.primaryMetric, 'time_to_first_lead_action');
});

test('onboarding segmentation input rejects unsupported industry and goal safely', () => {
  const review = reviewOnboardingSegmentationInput({
    industry: 'generic',
    goal: 'guaranteed revenue',
  });

  assert.equal(review.ok, false);
  assert.equal(review.plan, null);
  assert.deepEqual(review.errors, ['unsupported industry: generic', 'unsupported goal: guaranteed revenue']);
});

test('each supported goal has a workflow, metric, and support prompt', () => {
  for (const goal of Object.keys(ONBOARDING_GOAL_WORKFLOW_MAP) as Array<keyof typeof ONBOARDING_GOAL_WORKFLOW_MAP>) {
    const plan = buildOnboardingActivationPlan('ecommerce', goal);

    assert.equal(plan.templateId, 'industry-ecommerce-v1');
    assert.ok(plan.firstWorkflow.length > 5);
    assert.ok(plan.supportPrompt.length > 10);
    assert.match(plan.primaryMetric, /time_to_first_|first_signal_received/);
  }
});
