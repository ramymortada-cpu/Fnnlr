import { activationCohortSummary, type ActivationMetrics } from './metrics.js';

export type ActivationCohortStatus = 'HEALTHY' | 'WATCH' | 'RESCUE';

export type ActivationCohortThresholds = {
  minFirstWorkflowRate: number;
  minFirstPublishRate: number;
  minLeadActionRate: number;
  maxAbandonmentRate: number;
  maxMedianFirstWorkflowMinutes: number;
};

export type ActivationCohortProfile = {
  period: string;
  segment: string;
  industry: string;
  acquisitionSource: string;
};

export type ActivationCohortAction = {
  owner: 'Product' | 'Support' | 'Engineering' | 'Sales';
  action: string;
  evidenceRequired: string;
};

export type ActivationCohortReview = {
  profile: ActivationCohortProfile;
  status: ActivationCohortStatus;
  workspaceCount: number;
  rates: {
    firstWorkflow: number;
    firstPublish: number;
    firstLeadAction: number;
    abandonment: number;
  };
  medianTimeToFirstWorkflowMinutes: number | null;
  medianTimeToFirstPublishMinutes: number | null;
  topAbandonmentSteps: Array<{ value: string; count: number }>;
  topAbandonmentReasons: Array<{ value: string; count: number }>;
  blockers: string[];
  actions: ActivationCohortAction[];
};

export const DEFAULT_ACTIVATION_COHORT_THRESHOLDS: ActivationCohortThresholds = {
  minFirstWorkflowRate: 0.75,
  minFirstPublishRate: 0.6,
  minLeadActionRate: 0.4,
  maxAbandonmentRate: 0.2,
  maxMedianFirstWorkflowMinutes: 45,
};

export function createActivationCohortReview(
  profile: ActivationCohortProfile,
  metrics: ActivationMetrics[],
  thresholds: ActivationCohortThresholds = DEFAULT_ACTIVATION_COHORT_THRESHOLDS,
): ActivationCohortReview {
  const summary = activationCohortSummary(metrics);
  const rates = {
    firstWorkflow: rate(summary.activatedWorkflows, summary.workspaces),
    firstPublish: rate(summary.published, summary.workspaces),
    firstLeadAction: rate(summary.leadActionActivated, summary.workspaces),
    abandonment: rate(summary.abandoned, summary.workspaces),
  };
  const blockers = activationCohortBlockers(rates, summary.medianTimeToFirstWorkflowMinutes, thresholds);
  const status = activationCohortStatus(blockers);

  return {
    profile,
    status,
    workspaceCount: summary.workspaces,
    rates,
    medianTimeToFirstWorkflowMinutes: summary.medianTimeToFirstWorkflowMinutes,
    medianTimeToFirstPublishMinutes: summary.medianTimeToFirstPublishMinutes,
    topAbandonmentSteps: summary.topAbandonmentSteps,
    topAbandonmentReasons: summary.topAbandonmentReasons,
    blockers,
    actions: activationCohortActions(blockers, summary.topAbandonmentSteps, summary.topAbandonmentReasons),
  };
}

function activationCohortBlockers(
  rates: ActivationCohortReview['rates'],
  medianTimeToFirstWorkflowMinutes: number | null,
  thresholds: ActivationCohortThresholds,
) {
  const blockers: string[] = [];
  if (rates.firstWorkflow < thresholds.minFirstWorkflowRate) blockers.push('first_workflow_rate_below_threshold');
  if (rates.firstPublish < thresholds.minFirstPublishRate) blockers.push('first_publish_rate_below_threshold');
  if (rates.firstLeadAction < thresholds.minLeadActionRate) blockers.push('first_lead_action_rate_below_threshold');
  if (rates.abandonment > thresholds.maxAbandonmentRate) blockers.push('abandonment_rate_above_threshold');
  if (medianTimeToFirstWorkflowMinutes === null) blockers.push('missing_first_workflow_time_evidence');
  if (
    medianTimeToFirstWorkflowMinutes !== null &&
    medianTimeToFirstWorkflowMinutes > thresholds.maxMedianFirstWorkflowMinutes
  ) {
    blockers.push('median_first_workflow_time_above_threshold');
  }
  return blockers;
}

function activationCohortStatus(blockers: string[]): ActivationCohortStatus {
  if (blockers.length >= 3 || blockers.includes('missing_first_workflow_time_evidence')) return 'RESCUE';
  if (blockers.length > 0) return 'WATCH';
  return 'HEALTHY';
}

function activationCohortActions(
  blockers: string[],
  topAbandonmentSteps: ActivationCohortReview['topAbandonmentSteps'],
  topAbandonmentReasons: ActivationCohortReview['topAbandonmentReasons'],
): ActivationCohortAction[] {
  const actions = new Map<string, ActivationCohortAction>();
  const add = (action: ActivationCohortAction) => actions.set(`${action.owner}:${action.action}`, action);
  const topStep = topAbandonmentSteps[0]?.value ?? 'unknown onboarding step';
  const topReason = topAbandonmentReasons[0]?.value ?? 'unknown reason';

  for (const blocker of blockers) {
    if (blocker.includes('workflow')) {
      add({
        owner: 'Product',
        action: 'Review onboarding steps and default template selection for the cohort.',
        evidenceRequired: 'Updated cohort notes with before/after first-workflow rate.',
      });
      add({
        owner: 'Support',
        action: 'Contact non-activated workspaces with assisted setup offer.',
        evidenceRequired: 'Support outreach log linked to workspace ids.',
      });
    }
    if (blocker.includes('publish')) {
      add({
        owner: 'Engineering',
        action: 'Inspect publish path failures and missing integration prerequisites.',
        evidenceRequired: 'Publish failure sample and fixed/backlogged root cause.',
      });
    }
    if (blocker.includes('lead_action')) {
      add({
        owner: 'Sales',
        action: 'Audit whether the selected template maps to a real sales follow-up action.',
        evidenceRequired: 'Template-to-lead-action review note.',
      });
    }
    if (blocker.includes('abandonment')) {
      add({
        owner: 'Product',
        action: `Review top abandonment step "${topStep}" and remove the highest-friction setup question.`,
        evidenceRequired: `Abandonment reason table naming "${topReason}" and product/support decision for next cohort.`,
      });
      add({
        owner: 'Support',
        action: `Create recovery outreach for customers stuck at "${topStep}".`,
        evidenceRequired: `Support log references the top reason "${topReason}" and the follow-up outcome.`,
      });
    }
  }

  return [...actions.values()];
}

function rate(part: number, whole: number) {
  if (whole <= 0) return 0;
  return round(part / whole);
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
