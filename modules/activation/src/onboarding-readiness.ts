export type OnboardingSegmentationCapabilityId =
  | 'industry_selection_field'
  | 'goal_selection_field'
  | 'industry_template_mapping'
  | 'goal_workflow_mapping'
  | 'activation_event_capture'
  | 'abandonment_reason_capture'
  | 'negative_validation_tests'
  | 'hosted_onboarding_proof';

export type SupportedOnboardingIndustry =
  | 'real_estate'
  | 'clinics'
  | 'education'
  | 'agencies'
  | 'ecommerce';

export type SupportedOnboardingGoal =
  | 'get_more_leads'
  | 'improve_whatsapp_conversion'
  | 'reduce_payment_drop_off'
  | 'launch_new_offer'
  | 'improve_follow_up'
  | 'diagnose_revenue_leaks';

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

export type OnboardingSegmentationInput = {
  industry: string;
  goal: string;
};

export type OnboardingActivationPlan = {
  industry: SupportedOnboardingIndustry;
  goal: SupportedOnboardingGoal;
  templateId: string;
  firstWorkflow: string;
  primaryMetric: 'time_to_first_workflow' | 'time_to_first_publish' | 'time_to_first_lead_action' | 'first_signal_received';
  supportPrompt: string;
};

export type OnboardingSegmentationInputReview = {
  ok: boolean;
  normalizedIndustry: SupportedOnboardingIndustry | null;
  normalizedGoal: SupportedOnboardingGoal | null;
  errors: string[];
  plan: OnboardingActivationPlan | null;
};

export const SUPPORTED_ONBOARDING_INDUSTRIES: SupportedOnboardingIndustry[] = [
  'real_estate',
  'clinics',
  'education',
  'agencies',
  'ecommerce',
];

export const SUPPORTED_ONBOARDING_GOALS: SupportedOnboardingGoal[] = [
  'get_more_leads',
  'improve_whatsapp_conversion',
  'reduce_payment_drop_off',
  'launch_new_offer',
  'improve_follow_up',
  'diagnose_revenue_leaks',
];

export const ONBOARDING_GOAL_WORKFLOW_MAP: Record<SupportedOnboardingGoal, {
  firstWorkflow: string;
  primaryMetric: OnboardingActivationPlan['primaryMetric'];
  supportPrompt: string;
}> = {
  get_more_leads: workflow('lead_capture_followup', 'first_signal_received', 'Verify first traffic source and first lead capture path.'),
  improve_whatsapp_conversion: workflow('whatsapp_response_loop', 'time_to_first_lead_action', 'Review first WhatsApp handoff and unanswered lead queue.'),
  reduce_payment_drop_off: workflow('payment_state_recovery', 'time_to_first_lead_action', 'Confirm payment-state instructions and waiting-payment follow-up.'),
  launch_new_offer: workflow('offer_publish_launch', 'time_to_first_publish', 'Confirm offer page, CTA, and first publish evidence.'),
  improve_follow_up: workflow('follow_up_recovery', 'time_to_first_lead_action', 'Review overdue follow-up tasks and human approval path.'),
  diagnose_revenue_leaks: workflow('revenue_leak_diagnosis', 'time_to_first_workflow', 'Run first leak diagnosis after enough observed signals exist.'),
};

export const ONBOARDING_INDUSTRY_TEMPLATE_MAP: Record<SupportedOnboardingIndustry, string> = {
  real_estate: 'industry-real-estate-v1',
  clinics: 'industry-clinics-v1',
  education: 'industry-education-v1',
  agencies: 'industry-agencies-v1',
  ecommerce: 'industry-ecommerce-v1',
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
  cap('goal_workflow_mapping', 'Goal selection maps to activation workflow outcomes', 'mapping', 'CONTRACT_READY', 'Product', [
    'modules/activation/src/onboarding-readiness.ts',
    'tests/onboarding-readiness.test.ts',
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
  cap('negative_validation_tests', 'Invalid or missing segment choices are rejected safely', 'input', 'CONTRACT_READY', 'Engineering', [
    'modules/activation/src/onboarding-readiness.ts',
    'tests/onboarding-readiness.test.ts',
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

export function reviewOnboardingSegmentationInput(
  input: OnboardingSegmentationInput,
): OnboardingSegmentationInputReview {
  const normalizedIndustry = normalizeIndustry(input.industry);
  const normalizedGoal = normalizeGoal(input.goal);
  const errors: string[] = [];

  if (!normalizedIndustry) {
    errors.push(`unsupported industry: ${input.industry || 'missing'}`);
  }
  if (!normalizedGoal) {
    errors.push(`unsupported goal: ${input.goal || 'missing'}`);
  }

  return {
    ok: errors.length === 0,
    normalizedIndustry,
    normalizedGoal,
    errors,
    plan: normalizedIndustry && normalizedGoal ? buildOnboardingActivationPlan(normalizedIndustry, normalizedGoal) : null,
  };
}

export function buildOnboardingActivationPlan(
  industry: SupportedOnboardingIndustry,
  goal: SupportedOnboardingGoal,
): OnboardingActivationPlan {
  const goalWorkflow = ONBOARDING_GOAL_WORKFLOW_MAP[goal];
  return {
    industry,
    goal,
    templateId: ONBOARDING_INDUSTRY_TEMPLATE_MAP[industry],
    firstWorkflow: goalWorkflow.firstWorkflow,
    primaryMetric: goalWorkflow.primaryMetric,
    supportPrompt: goalWorkflow.supportPrompt,
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

function normalizeIndustry(value: string): SupportedOnboardingIndustry | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SUPPORTED_ONBOARDING_INDUSTRIES.includes(normalized as SupportedOnboardingIndustry)
    ? normalized as SupportedOnboardingIndustry
    : null;
}

function normalizeGoal(value: string): SupportedOnboardingGoal | null {
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SUPPORTED_ONBOARDING_GOALS.includes(normalized as SupportedOnboardingGoal)
    ? normalized as SupportedOnboardingGoal
    : null;
}

function workflow(
  firstWorkflow: string,
  primaryMetric: OnboardingActivationPlan['primaryMetric'],
  supportPrompt: string,
) {
  return { firstWorkflow, primaryMetric, supportPrompt };
}
