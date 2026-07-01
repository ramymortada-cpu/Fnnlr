import type { ActivationMetrics } from './metrics.js';

export type OnboardingRecoveryTrigger =
  | 'no_industry_selected'
  | 'no_goal_selected'
  | 'template_not_customized'
  | 'workflow_not_created'
  | 'workflow_not_published'
  | 'no_first_signal_after_publish'
  | 'onboarding_abandoned';

export type RecoveryChannel = 'email' | 'support_task' | 'operator_review';

export type RecoveryStep = {
  trigger: OnboardingRecoveryTrigger;
  channel: RecoveryChannel;
  owner: 'Product' | 'Support' | 'Engineering';
  messageKey: string;
  guardrails: string[];
  evidenceRequired: string;
};

export type RecoveryPlan = {
  workspaceId: string;
  status: 'NO_RECOVERY_NEEDED' | 'RECOVERY_READY' | 'OPERATOR_REVIEW_REQUIRED';
  steps: RecoveryStep[];
  adminChecklistRequired: boolean;
};

export const RECOVERY_GUARDRAILS = [
  'no guaranteed revenue',
  'no auto-send claim',
  'no fake urgency',
  'Arabic-first language when customer market is Arabic',
];

export function createOnboardingRecoveryPlan(metrics: ActivationMetrics): RecoveryPlan {
  const steps: RecoveryStep[] = [];

  if (metrics.selectedIndustries.length === 0) {
    steps.push(recoveryStep('no_industry_selected', 'email', 'Product', 'industry_selection_prompt'));
  }
  if (metrics.selectedGoals.length === 0) {
    steps.push(recoveryStep('no_goal_selected', 'email', 'Product', 'goal_selection_prompt'));
  }
  if (metrics.selectedTemplateIds.length > 0 && metrics.timeToFirstWorkflowMinutes === null) {
    steps.push(recoveryStep('template_not_customized', 'support_task', 'Support', 'assisted_template_setup'));
  }
  if (metrics.missingEvidence.includes('first_workflow_created')) {
    steps.push(recoveryStep('workflow_not_created', 'support_task', 'Support', 'first_workflow_assist'));
  }
  if (metrics.timeToFirstWorkflowMinutes !== null && metrics.timeToFirstPublishMinutes === null) {
    steps.push(recoveryStep('workflow_not_published', 'email', 'Product', 'publish_blocker_checklist'));
  }
  if (metrics.timeToFirstPublishMinutes !== null && !metrics.firstSignalReceived) {
    steps.push(recoveryStep('no_first_signal_after_publish', 'operator_review', 'Engineering', 'tracking_and_traffic_check'));
  }
  if (metrics.onboardingAbandoned) {
    steps.push({
      ...recoveryStep('onboarding_abandoned', 'support_task', 'Support', 'abandonment_reason_followup'),
      evidenceRequired: `Last step: ${metrics.abandonmentStep ?? 'unknown'}; reason: ${metrics.abandonmentReason ?? 'unknown'}.`,
    });
  }

  return {
    workspaceId: metrics.workspaceId,
    status: recoveryStatus(steps),
    steps,
    adminChecklistRequired: steps.length > 0,
  };
}

export function adminOnboardingChecklistReadiness(evidence: {
  industrySelected: boolean;
  goalSelected: boolean;
  ownerUserCreated: boolean;
  businessCreated: boolean;
  templateSelected: boolean;
  workflowCreated: boolean;
  workflowPublished: boolean;
  trackedLinkCreated: boolean;
  smokeSignalRecorded: boolean;
  supportOwnerAssigned: boolean;
  dailyCheckScheduled: boolean;
}): {
  status: 'CHECKLIST_COMPLETE' | 'CHECKLIST_INCOMPLETE';
  missing: string[];
  evidenceRequired: string[];
} {
  const missing = Object.entries(evidence)
    .filter(([, present]) => !present)
    .map(([key]) => key);

  return {
    status: missing.length === 0 ? 'CHECKLIST_COMPLETE' : 'CHECKLIST_INCOMPLETE',
    missing,
    evidenceRequired: missing.map((item) => `Attach evidence for ${item} before closing assisted onboarding.`),
  };
}

function recoveryStep(
  trigger: OnboardingRecoveryTrigger,
  channel: RecoveryChannel,
  owner: RecoveryStep['owner'],
  messageKey: string,
): RecoveryStep {
  return {
    trigger,
    channel,
    owner,
    messageKey,
    guardrails: RECOVERY_GUARDRAILS,
    evidenceRequired: 'Recovery message/task log, owner, due date, and next activation metric snapshot.',
  };
}

function recoveryStatus(steps: RecoveryStep[]): RecoveryPlan['status'] {
  if (steps.length === 0) return 'NO_RECOVERY_NEEDED';
  if (steps.some((step) => step.channel === 'operator_review')) return 'OPERATOR_REVIEW_REQUIRED';
  return 'RECOVERY_READY';
}
