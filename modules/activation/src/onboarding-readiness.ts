export type OnboardingSegmentationCapabilityId =
  | 'industry_selection_field'
  | 'goal_selection_field'
  | 'industry_template_mapping'
  | 'goal_workflow_mapping'
  | 'activation_event_capture'
  | 'abandonment_reason_capture'
  | 'negative_validation_tests'
  | 'hosted_onboarding_proof';

export type OnboardingSegmentationStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'PARTIAL_CODE_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type OnboardingSegmentationCapability = {
  id: OnboardingSegmentationCapabilityId;
  label: string;
  area: 'input' | 'mapping' | 'measurement' | 'proof';
  status: OnboardingSegmentationStatus;
  owner: 'Engineering' | 'Product' | 'Support';
  evidence: string[];
  requiredForTailoredOnboardingClaim: boolean;
};

export type OnboardingSegmentationReadinessReview = {
  decision:
    | 'TAILORED_ONBOARDING_READY'
    | 'CONTRACT_READY_WITH_ONBOARDING_GAPS'
    | 'DO_NOT_CLAIM_TAILORED_ONBOARDING_READY';
  tailoredOnboardingClaimAllowed: boolean;
  readyCapabilities: OnboardingSegmentationCapabilityId[];
  gapCapabilities: OnboardingSegmentationCapabilityId[];
  blockedCapabilities: OnboardingSegmentationCapabilityId[];
  actions: Array<{
    owner: OnboardingSegmentationCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const ONBOARDING_SEGMENTATION_BASELINE: OnboardingSegmentationCapability[] = [
  cap('industry_selection_field', 'Industry selection captured during onboarding', 'input', 'PARTIAL_CODE_READY', 'Engineering', [
    'apps/web/onboarding.html',
    'docs/ACTIVATION_METRICS_SPEC.md',
  ], true),
  cap('goal_selection_field', 'Primary goal selection captured during onboarding', 'input', 'PARTIAL_CODE_READY', 'Engineering', [
    'apps/web/onboarding.html',
    'docs/ACTIVATION_METRICS_SPEC.md',
  ], true),
  cap('industry_template_mapping', 'Industry selection maps to reusable launch templates', 'mapping', 'CONTRACT_READY', 'Product', [
    'docs/industry-templates/real-estate.md',
    'docs/industry-templates/clinics.md',
    'docs/industry-templates/education.md',
    'docs/industry-templates/agencies.md',
    'docs/industry-templates/ecommerce.md',
  ], true),
  cap('goal_workflow_mapping', 'Goal selection maps to activation workflow outcomes', 'mapping', 'ROADMAP', 'Product', [
    'docs/ACTIVATION_METRICS_SPEC.md',
    'docs/ONBOARDING_PROMISE.md',
  ], true),
  cap('activation_event_capture', 'Activation metrics preserve selected industries and goals', 'measurement', 'CONTRACT_READY', 'Engineering', [
    'modules/activation/src/metrics.ts',
    'tests/activation-metrics.test.ts',
  ], true),
  cap('abandonment_reason_capture', 'Onboarding abandonment captures step and reason', 'measurement', 'CONTRACT_READY', 'Engineering', [
    'modules/activation/src/metrics.ts',
    'tests/activation-metrics.test.ts',
  ], true),
  cap('negative_validation_tests', 'Invalid or missing segment choices are rejected safely', 'input', 'ROADMAP', 'Engineering', [
    'tests/onboarding.test.ts',
  ], true),
  cap('hosted_onboarding_proof', 'Hosted onboarding run proves industry and goal persistence end-to-end', 'proof', 'HOSTED_PROOF_PENDING', 'Support', [
    'gateforge-audit/run-2026-06-23-1035/12_war_board.csv',
  ], true),
];

export function reviewOnboardingSegmentationReadiness(
  capabilities: OnboardingSegmentationCapability[] = ONBOARDING_SEGMENTATION_BASELINE,
): OnboardingSegmentationReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const tailoredOnboardingClaimAllowed = capabilities
    .filter((capability) => capability.requiredForTailoredOnboardingClaim)
    .every(isReady);

  return {
    decision: onboardingDecision(blockedCapabilities, tailoredOnboardingClaimAllowed),
    tailoredOnboardingClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: onboardingActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: OnboardingSegmentationCapabilityId,
  label: string,
  area: OnboardingSegmentationCapability['area'],
  status: OnboardingSegmentationStatus,
  owner: OnboardingSegmentationCapability['owner'],
  evidence: string[],
  requiredForTailoredOnboardingClaim: boolean,
): OnboardingSegmentationCapability {
  return { id, label, area, status, owner, evidence, requiredForTailoredOnboardingClaim };
}

function isReady(capability: OnboardingSegmentationCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: OnboardingSegmentationCapability) {
  return ['PARTIAL_CODE_READY', 'ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: OnboardingSegmentationCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function onboardingDecision(
  blockedCapabilities: OnboardingSegmentationCapabilityId[],
  tailoredOnboardingClaimAllowed: boolean,
): OnboardingSegmentationReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_TAILORED_ONBOARDING_READY';
  return tailoredOnboardingClaimAllowed ? 'TAILORED_ONBOARDING_READY' : 'CONTRACT_READY_WITH_ONBOARDING_GAPS';
}

function onboardingActions(
  capabilities: OnboardingSegmentationCapability[],
  blockedCapabilities: OnboardingSegmentationCapabilityId[],
  gapCapabilities: OnboardingSegmentationCapabilityId[],
): OnboardingSegmentationReadinessReview['actions'] {
  const actions: OnboardingSegmentationReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach tailored onboarding evidence for ${capability.label}.`,
        evidenceRequired: 'Code, UI route proof, event capture test, mapping document, hosted run output, or operator screenshot proving this onboarding capability.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until tailored onboarding proof exists.`,
        evidenceRequired: 'UI/route validation, goal-to-workflow mapping, negative test, and hosted persistence proof before claiming tailored onboarding readiness.',
      });
    }
  }
  return actions;
}
