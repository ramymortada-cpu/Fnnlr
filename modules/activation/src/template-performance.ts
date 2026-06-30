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
