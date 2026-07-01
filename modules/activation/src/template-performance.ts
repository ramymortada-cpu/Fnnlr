export type TemplatePerformanceDecision = 'PROMOTE' | 'KEEP' | 'REVISE' | 'RETIRE' | 'INSUFFICIENT_EVIDENCE';

export type TemplatePerformanceProfile = {
  industry: string;
  templateId: string;
  version: string;
  period: string;
};

export type TemplatePerformanceSignal = {
  templateId: string;
  selected: boolean;
  published?: boolean;
  firstSignalReceived?: boolean;
  firstLeadAction?: boolean;
  recommendationWorked?: boolean;
  recommendationDecided?: boolean;
  supportIssueOpened?: boolean;
};

export type TemplatePerformanceThresholds = {
  minSelectedCount: number;
  minPublishRate: number;
  minFirstSignalRate: number;
  minLeadActionRate: number;
  minRecommendationCaptureRate: number;
  maxSupportIssueRate: number;
};

export type TemplatePerformanceAction = {
  owner: 'Product' | 'Support' | 'Sales';
  action: string;
  evidenceRequired: string;
};

export type TemplatePerformanceCapabilityId =
  | 'template_signal_schema'
  | 'promotion_thresholds'
  | 'revise_retire_actions'
  | 'recommendation_outcome_capture'
  | 'support_issue_feedback'
  | 'hosted_template_cohort_evidence';

export type TemplatePerformanceCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type TemplatePerformanceCapability = {
  id: TemplatePerformanceCapabilityId;
  label: string;
  status: TemplatePerformanceCapabilityStatus;
  owner: 'Product' | 'Support' | 'Sales';
  evidence: string[];
  requiredForTemplateLoopClaim: boolean;
};

export type TemplatePerformanceReadinessReview = {
  decision:
    | 'TEMPLATE_LOOP_READY'
    | 'CONTRACT_READY_WITH_HOSTED_GAPS'
    | 'DO_NOT_CLAIM_TEMPLATE_LOOP_READY';
  templateLoopClaimAllowed: boolean;
  readyCapabilities: TemplatePerformanceCapabilityId[];
  gapCapabilities: TemplatePerformanceCapabilityId[];
  blockedCapabilities: TemplatePerformanceCapabilityId[];
  actions: Array<{
    owner: TemplatePerformanceCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export type TemplatePerformanceReview = {
  profile: TemplatePerformanceProfile;
  decision: TemplatePerformanceDecision;
  metrics: {
    selectedCount: number;
    publishedCount: number;
    firstSignalCount: number;
    firstLeadActionCount: number;
    recommendationCaptureRate: number | null;
    supportIssueCount: number;
    publishRate: number;
    firstSignalRate: number;
    firstLeadActionRate: number;
    supportIssueRate: number;
  };
  blockers: string[];
  actions: TemplatePerformanceAction[];
};

export const DEFAULT_TEMPLATE_PERFORMANCE_THRESHOLDS: TemplatePerformanceThresholds = {
  minSelectedCount: 5,
  minPublishRate: 0.6,
  minFirstSignalRate: 0.4,
  minLeadActionRate: 0.25,
  minRecommendationCaptureRate: 0.35,
  maxSupportIssueRate: 0.2,
};

export const TEMPLATE_PERFORMANCE_BASELINE: TemplatePerformanceCapability[] = [
  performanceCap('template_signal_schema', 'Template signal schema captures selection, publish, first signal, lead action, recommendations, and support issues', 'CONTRACT_READY', 'Product', [
    'modules/activation/src/template-performance.ts',
    'tests/template-performance.test.ts',
  ], true),
  performanceCap('promotion_thresholds', 'Promotion thresholds require selection count, publish rate, lead-action rate, and recommendation capture', 'CONTRACT_READY', 'Product', [
    'modules/activation/src/template-performance.ts',
    'docs/TEMPLATE_PERFORMANCE_REVIEW.md',
    'tests/template-performance.test.ts',
  ], true),
  performanceCap('revise_retire_actions', 'Weak templates produce owner-driven revise or retire actions', 'CONTRACT_READY', 'Product', [
    'modules/activation/src/template-performance.ts',
    'tests/template-performance.test.ts',
  ], true),
  performanceCap('recommendation_outcome_capture', 'Recommendation outcome evidence is required before templates pass', 'CONTRACT_READY', 'Product', [
    'modules/activation/src/template-performance.ts',
    'tests/template-performance.test.ts',
  ], true),
  performanceCap('support_issue_feedback', 'Template-related support issues feed revise/retire actions', 'CONTRACT_READY', 'Support', [
    'modules/activation/src/template-performance.ts',
    'tests/template-performance.test.ts',
  ], true),
  performanceCap('hosted_template_cohort_evidence', 'Hosted cohort review proves the template loop on real customer workspaces', 'HOSTED_PROOF_PENDING', 'Sales', [
    'docs/TEMPLATE_PERFORMANCE_REVIEW.md',
  ], true),
];

export function createTemplatePerformanceReview(
  profile: TemplatePerformanceProfile,
  signals: TemplatePerformanceSignal[],
  thresholds: TemplatePerformanceThresholds = DEFAULT_TEMPLATE_PERFORMANCE_THRESHOLDS,
): TemplatePerformanceReview {
  const scoped = signals.filter((signal) => signal.templateId === profile.templateId && signal.selected);
  const selectedCount = scoped.length;
  const publishedCount = scoped.filter((signal) => signal.published).length;
  const firstSignalCount = scoped.filter((signal) => signal.firstSignalReceived).length;
  const firstLeadActionCount = scoped.filter((signal) => signal.firstLeadAction).length;
  const recommendationDecided = scoped.filter((signal) => signal.recommendationDecided).length;
  const recommendationWorked = scoped.filter((signal) => signal.recommendationDecided && signal.recommendationWorked).length;
  const supportIssueCount = scoped.filter((signal) => signal.supportIssueOpened).length;
  const metrics = {
    selectedCount,
    publishedCount,
    firstSignalCount,
    firstLeadActionCount,
    recommendationCaptureRate: recommendationDecided > 0 ? roundRate(recommendationWorked / recommendationDecided) : null,
    supportIssueCount,
    publishRate: rate(publishedCount, selectedCount),
    firstSignalRate: rate(firstSignalCount, selectedCount),
    firstLeadActionRate: rate(firstLeadActionCount, selectedCount),
    supportIssueRate: rate(supportIssueCount, selectedCount),
  };
  const blockers = templatePerformanceBlockers(metrics, thresholds);

  return {
    profile,
    decision: templatePerformanceDecision(metrics, blockers, thresholds),
    metrics,
    blockers,
    actions: templatePerformanceActions(blockers),
  };
}

export function reviewTemplatePerformanceReadiness(
  capabilities: TemplatePerformanceCapability[] = TEMPLATE_PERFORMANCE_BASELINE,
): TemplatePerformanceReadinessReview {
  const readyCapabilities = capabilities.filter(isPerformanceReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isPerformanceGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isPerformanceBlocked).map((capability) => capability.id);
  const templateLoopClaimAllowed = capabilities
    .filter((capability) => capability.requiredForTemplateLoopClaim)
    .every(isPerformanceReady);

  return {
    decision: templateReadinessDecision(blockedCapabilities, templateLoopClaimAllowed),
    templateLoopClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: templateReadinessActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function templatePerformanceBlockers(
  metrics: TemplatePerformanceReview['metrics'],
  thresholds: TemplatePerformanceThresholds,
) {
  const blockers: string[] = [];
  if (metrics.selectedCount < thresholds.minSelectedCount) blockers.push('insufficient_selection_evidence');
  if (metrics.publishRate < thresholds.minPublishRate) blockers.push('publish_rate_below_threshold');
  if (metrics.firstSignalRate < thresholds.minFirstSignalRate) blockers.push('first_signal_rate_below_threshold');
  if (metrics.firstLeadActionRate < thresholds.minLeadActionRate) blockers.push('first_lead_action_rate_below_threshold');
  if (metrics.recommendationCaptureRate === null) blockers.push('missing_recommendation_capture_evidence');
  if (
    metrics.recommendationCaptureRate !== null &&
    metrics.recommendationCaptureRate < thresholds.minRecommendationCaptureRate
  ) {
    blockers.push('recommendation_capture_rate_below_threshold');
  }
  if (metrics.supportIssueRate > thresholds.maxSupportIssueRate) blockers.push('support_issue_rate_above_threshold');
  return blockers;
}

function templatePerformanceDecision(
  metrics: TemplatePerformanceReview['metrics'],
  blockers: string[],
  thresholds: TemplatePerformanceThresholds,
): TemplatePerformanceDecision {
  if (blockers.includes('insufficient_selection_evidence')) return 'INSUFFICIENT_EVIDENCE';
  const operationalBlockers = blockers.filter((blocker) => blocker !== 'missing_recommendation_capture_evidence');
  if (operationalBlockers.length >= 4 || metrics.publishRate === 0) return 'RETIRE';
  if (operationalBlockers.length > 0 || blockers.includes('missing_recommendation_capture_evidence')) return 'REVISE';
  if (
    metrics.selectedCount >= thresholds.minSelectedCount * 2 &&
    metrics.publishRate >= 0.8 &&
    metrics.firstLeadActionRate >= 0.5
  ) {
    return 'PROMOTE';
  }
  return 'KEEP';
}

function templatePerformanceActions(blockers: string[]): TemplatePerformanceAction[] {
  const actions = new Map<string, TemplatePerformanceAction>();
  const add = (action: TemplatePerformanceAction) => actions.set(`${action.owner}:${action.action}`, action);

  for (const blocker of blockers) {
    if (blocker.includes('insufficient')) {
      add({
        owner: 'Sales',
        action: 'Keep the template in controlled pilots until selection evidence reaches threshold.',
        evidenceRequired: 'Pilot cohort list with selected workspace ids.',
      });
    }
    if (blocker.includes('publish') || blocker.includes('signal') || blocker.includes('lead_action')) {
      add({
        owner: 'Product',
        action: 'Review template steps, copy, and default workflow assumptions.',
        evidenceRequired: 'Before/after template version note with activation metric target.',
      });
    }
    if (blocker.includes('recommendation')) {
      add({
        owner: 'Product',
        action: 'Audit recommendations produced by this template against observed outcomes.',
        evidenceRequired: 'Recommendation outcome sample with keep/rewrite/remove decisions.',
      });
    }
    if (blocker.includes('support')) {
      add({
        owner: 'Support',
        action: 'Cluster template-related support issues and write a setup fix.',
        evidenceRequired: 'Support issue cluster linked to revised setup guidance.',
      });
    }
  }

  return [...actions.values()];
}

function rate(part: number, whole: number) {
  if (whole <= 0) return 0;
  return roundRate(part / whole);
}

function roundRate(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

function performanceCap(
  id: TemplatePerformanceCapabilityId,
  label: string,
  status: TemplatePerformanceCapabilityStatus,
  owner: TemplatePerformanceCapability['owner'],
  evidence: string[],
  requiredForTemplateLoopClaim: boolean,
): TemplatePerformanceCapability {
  return { id, label, status, owner, evidence, requiredForTemplateLoopClaim };
}

function isPerformanceReady(capability: TemplatePerformanceCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isPerformanceGap(capability: TemplatePerformanceCapability) {
  return capability.status === 'HOSTED_PROOF_PENDING';
}

function isPerformanceBlocked(capability: TemplatePerformanceCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function templateReadinessDecision(
  blockedCapabilities: TemplatePerformanceCapabilityId[],
  templateLoopClaimAllowed: boolean,
): TemplatePerformanceReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_TEMPLATE_LOOP_READY';
  return templateLoopClaimAllowed ? 'TEMPLATE_LOOP_READY' : 'CONTRACT_READY_WITH_HOSTED_GAPS';
}

function templateReadinessActions(
  capabilities: TemplatePerformanceCapability[],
  blockedCapabilities: TemplatePerformanceCapabilityId[],
  gapCapabilities: TemplatePerformanceCapabilityId[],
): TemplatePerformanceReadinessReview['actions'] {
  const actions: TemplatePerformanceReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach template performance evidence for ${capability.label}.`,
        evidenceRequired: 'Code, test, review output, support cluster, or hosted cohort evidence proving the template loop capability.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until hosted cohort evidence exists.`,
        evidenceRequired: 'Hosted cohort review with selected workspaces, template version, decision, owner action, and follow-up evidence link.',
      });
    }
  }
  return actions;
}
