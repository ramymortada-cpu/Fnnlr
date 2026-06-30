import type { AIUsageEvent } from '../../../packages/ai-core/src/gateway.js';

export type WorkflowOutcomeStatus = 'successful' | 'failed' | 'neutral' | 'unknown';

export type WorkflowIntelligenceEvent = AIUsageEvent & {
  workflowId?: string;
  outcomeId?: string;
  outcomeStatus?: WorkflowOutcomeStatus;
};

export type WorkflowIntelligenceMetrics = {
  totalAiRequests: number;
  totalCostUsd: number;
  workflowsTouched: number;
  successfulActions: number;
  degradedFallbacks: number;
  costPerWorkflow: number | null;
  costPerSuccessfulAction: number | null;
  degradedFallbackRate: number;
};

export function computeWorkflowIntelligenceMetrics(events: WorkflowIntelligenceEvent[]): WorkflowIntelligenceMetrics {
  const totalAiRequests = events.length;
  const totalCostUsd = roundMoney(events.reduce((sum, event) => sum + eventCost(event), 0));
  const workflowsTouched = new Set(events.map((event) => event.workflowId).filter(Boolean)).size;
  const successfulActions = events.filter((event) => event.outcomeStatus === 'successful').length;
  const degradedFallbacks = events.filter((event) => event.status === 'degraded').length;

  return {
    totalAiRequests,
    totalCostUsd,
    workflowsTouched,
    successfulActions,
    degradedFallbacks,
    costPerWorkflow: workflowsTouched > 0 ? roundMoney(totalCostUsd / workflowsTouched) : null,
    costPerSuccessfulAction: successfulActions > 0 ? roundMoney(totalCostUsd / successfulActions) : null,
    degradedFallbackRate: totalAiRequests > 0 ? roundRate(degradedFallbacks / totalAiRequests) : 0,
  };
}

export function workflowIntelligenceReadiness(events: WorkflowIntelligenceEvent[]): {
  ready: boolean;
  missing: Array<'workflow_id' | 'outcome_status'>;
} {
  const missing = new Set<'workflow_id' | 'outcome_status'>();
  if (!events.some((event) => event.workflowId)) missing.add('workflow_id');
  if (!events.some((event) => event.outcomeStatus && event.outcomeStatus !== 'unknown')) missing.add('outcome_status');
  return { ready: missing.size === 0, missing: [...missing] };
}

function eventCost(event: WorkflowIntelligenceEvent): number {
  const cost = event.actualCostUsd ?? event.estimatedCostUsd ?? 0;
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

function roundMoney(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function roundRate(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
