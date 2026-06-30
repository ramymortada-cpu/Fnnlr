import {
  computeWorkflowIntelligenceMetrics,
  type WorkflowIntelligenceEvent,
} from './workflow-intelligence.js';

export type AISpendReviewStatus = 'IN_BUDGET' | 'WATCH' | 'COST_RESCUE';

export type AISpendReviewPeriod = {
  start: string;
  end: string;
};

export type AISpendReviewThresholds = {
  monthlyBudgetUsd: number;
  maxCostPerSuccessfulActionUsd: number;
  maxDegradedFallbackRate: number;
  maxKillSwitchActivations: number;
};

export type AISpendReviewAction = {
  owner: 'Finance/ops' | 'Engineering' | 'Product' | 'Support';
  action: string;
  evidenceRequired: string;
};

export type AISpendReview = {
  period: AISpendReviewPeriod;
  status: AISpendReviewStatus;
  totalCostUsd: number;
  budgetUtilizationRate: number;
  costPerWorkflowUsd: number | null;
  costPerSuccessfulActionUsd: number | null;
  degradedFallbackRate: number;
  killSwitchActivations: number;
  blockers: string[];
  actions: AISpendReviewAction[];
};

export const DEFAULT_AI_SPEND_REVIEW_THRESHOLDS: AISpendReviewThresholds = {
  monthlyBudgetUsd: 500,
  maxCostPerSuccessfulActionUsd: 0.35,
  maxDegradedFallbackRate: 0.1,
  maxKillSwitchActivations: 0,
};

export function createAISpendReview(
  period: AISpendReviewPeriod,
  events: WorkflowIntelligenceEvent[],
  thresholds: AISpendReviewThresholds = DEFAULT_AI_SPEND_REVIEW_THRESHOLDS,
): AISpendReview {
  const metrics = computeWorkflowIntelligenceMetrics(events);
  const killSwitchActivations = events.filter((event) =>
    (event.degradationReason ?? '').toLowerCase().includes('kill switch'),
  ).length;
  const budgetUtilizationRate = thresholds.monthlyBudgetUsd > 0
    ? roundRate(metrics.totalCostUsd / thresholds.monthlyBudgetUsd)
    : 1;
  const blockers = aiSpendBlockers(metrics, killSwitchActivations, thresholds, budgetUtilizationRate);

  return {
    period,
    status: aiSpendStatus(blockers),
    totalCostUsd: metrics.totalCostUsd,
    budgetUtilizationRate,
    costPerWorkflowUsd: metrics.costPerWorkflow,
    costPerSuccessfulActionUsd: metrics.costPerSuccessfulAction,
    degradedFallbackRate: metrics.degradedFallbackRate,
    killSwitchActivations,
    blockers,
    actions: aiSpendActions(blockers),
  };
}

function aiSpendBlockers(
  metrics: ReturnType<typeof computeWorkflowIntelligenceMetrics>,
  killSwitchActivations: number,
  thresholds: AISpendReviewThresholds,
  budgetUtilizationRate: number,
) {
  const blockers: string[] = [];
  if (metrics.totalCostUsd > thresholds.monthlyBudgetUsd) blockers.push('monthly_budget_exceeded');
  if (budgetUtilizationRate >= 0.85 && metrics.totalCostUsd <= thresholds.monthlyBudgetUsd) {
    blockers.push('monthly_budget_near_limit');
  }
  if (metrics.costPerSuccessfulAction === null) blockers.push('missing_successful_action_cost_evidence');
  if (
    metrics.costPerSuccessfulAction !== null &&
    metrics.costPerSuccessfulAction > thresholds.maxCostPerSuccessfulActionUsd
  ) {
    blockers.push('cost_per_successful_action_above_threshold');
  }
  if (metrics.degradedFallbackRate > thresholds.maxDegradedFallbackRate) {
    blockers.push('degraded_fallback_rate_above_threshold');
  }
  if (killSwitchActivations > thresholds.maxKillSwitchActivations) {
    blockers.push('kill_switch_activation_detected');
  }
  return blockers;
}

function aiSpendStatus(blockers: string[]): AISpendReviewStatus {
  if (
    blockers.includes('monthly_budget_exceeded') ||
    blockers.includes('missing_successful_action_cost_evidence') ||
    blockers.length >= 3
  ) {
    return 'COST_RESCUE';
  }
  if (blockers.length > 0) return 'WATCH';
  return 'IN_BUDGET';
}

function aiSpendActions(blockers: string[]): AISpendReviewAction[] {
  const actions = new Map<string, AISpendReviewAction>();
  const add = (action: AISpendReviewAction) => actions.set(`${action.owner}:${action.action}`, action);

  for (const blocker of blockers) {
    if (blocker.includes('budget')) {
      add({
        owner: 'Finance/ops',
        action: 'Review tenant/global AI caps before the next billing cycle.',
        evidenceRequired: 'Updated cap decision with cost forecast and owner sign-off.',
      });
    }
    if (blocker.includes('successful_action')) {
      add({
        owner: 'Product',
        action: 'Audit workflows with high AI cost and low successful-action evidence.',
        evidenceRequired: 'Workflow list with keep/optimize/disable decisions.',
      });
    }
    if (blocker.includes('degraded') || blocker.includes('kill_switch')) {
      add({
        owner: 'Engineering',
        action: 'Inspect provider health, budget guard, fallback behavior, and model routing.',
        evidenceRequired: 'Incident note or tuning PR linked to degraded usage events.',
      });
      add({
        owner: 'Support',
        action: 'Prepare customer-safe communication for impacted AI degradation windows.',
        evidenceRequired: 'Support note proving affected tenants and message decision.',
      });
    }
  }

  return [...actions.values()];
}

function roundRate(value: number) {
  return Math.round(value * 1_000) / 1_000;
}
