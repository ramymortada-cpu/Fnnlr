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

export type NextBestActionCandidate = {
  id: string;
  label: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: 'operational' | 'revenue' | 'growth' | 'support';
  requiresMutation: boolean;
  humanApprovalRequired: boolean;
  evidenceStrength: 'direct' | 'indirect' | 'missing';
  sampleSize: number;
  locale: 'ar' | 'global';
};

export type RankedNextBestAction = NextBestActionCandidate & {
  rank: number;
  confidence: 'high' | 'medium' | 'low' | 'blocked';
  reason: string;
};

export type FollowUpQualityInput = {
  hasClearNextStep: boolean;
  hasLocalArabicTone: boolean;
  avoidsFalseUrgency: boolean;
  hasHonestPaymentOrSupportBoundary: boolean;
  hasMeasurableCta: boolean;
};

export type FollowUpQualityScore = {
  score: number;
  grade: 'excellent' | 'usable' | 'needs_revision';
  missing: Array<keyof FollowUpQualityInput>;
};

export type LeadQualificationInput = {
  hasExplicitNeed: boolean;
  hasBudgetOrPaymentReadiness: boolean;
  hasTimeUrgency: boolean;
  hasAuthoritySignal: boolean;
  matchesSupportedIndustryTemplate: boolean;
};

export type LeadQualificationConfidence = {
  score: number;
  confidence: 'high' | 'medium' | 'low';
  missing: Array<keyof LeadQualificationInput>;
  nextAction: 'qualify_now' | 'confirm_missing_signals' | 'route_to_discovery';
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

export function scoreLeadQualificationConfidence(input: LeadQualificationInput): LeadQualificationConfidence {
  const weights: Record<keyof LeadQualificationInput, number> = {
    hasExplicitNeed: 25,
    hasBudgetOrPaymentReadiness: 25,
    hasTimeUrgency: 15,
    hasAuthoritySignal: 20,
    matchesSupportedIndustryTemplate: 15,
  };
  const entries = Object.entries(input) as Array<[keyof LeadQualificationInput, boolean]>;
  const missing = entries.filter(([, present]) => !present).map(([key]) => key);
  const score = entries.reduce((sum, [key, present]) => sum + (present ? weights[key] : 0), 0);

  return {
    score,
    confidence: score >= 80 ? 'high' : score >= 50 ? 'medium' : 'low',
    missing,
    nextAction: score >= 80 ? 'qualify_now' : score >= 50 ? 'confirm_missing_signals' : 'route_to_discovery',
  };
}

export function rankNextBestActions(candidates: NextBestActionCandidate[]): RankedNextBestAction[] {
  return candidates
    .map((candidate) => ({
      ...candidate,
      confidence: actionConfidence(candidate),
      reason: actionReason(candidate),
    }))
    .sort((a, b) => actionScore(b) - actionScore(a))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function scoreFollowUpQuality(input: FollowUpQualityInput): FollowUpQualityScore {
  const entries = Object.entries(input) as Array<[keyof FollowUpQualityInput, boolean]>;
  const missing = entries.filter(([, present]) => !present).map(([key]) => key);
  const score = Math.round(((entries.length - missing.length) / entries.length) * 100);

  return {
    score,
    grade: score >= 90 ? 'excellent' : score >= 70 ? 'usable' : 'needs_revision',
    missing,
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

function actionScore(candidate: NextBestActionCandidate & Pick<RankedNextBestAction, 'confidence'>): number {
  if (candidate.confidence === 'blocked') return -1_000;
  const priorityScore = { P0: 400, P1: 300, P2: 200, P3: 100 }[candidate.priority];
  const categoryScore = candidate.category === 'operational' ? 40 : 0;
  const evidenceScore = { direct: 40, indirect: 20, missing: -120 }[candidate.evidenceStrength];
  const sampleScore = Math.min(candidate.sampleSize, 20);
  const localeScore = candidate.locale === 'ar' ? 5 : 0;
  return priorityScore + categoryScore + evidenceScore + sampleScore + localeScore;
}

function actionConfidence(candidate: NextBestActionCandidate): RankedNextBestAction['confidence'] {
  if (candidate.requiresMutation && !candidate.humanApprovalRequired) return 'blocked';
  if (candidate.evidenceStrength === 'missing') return 'low';
  if (candidate.sampleSize < 5) return 'low';
  if (candidate.evidenceStrength === 'direct' && candidate.sampleSize >= 20) return 'high';
  return 'medium';
}

function actionReason(candidate: NextBestActionCandidate): string {
  if (candidate.requiresMutation && !candidate.humanApprovalRequired) {
    return 'Blocked: mutating actions require human approval before recommendation.';
  }
  if (candidate.evidenceStrength === 'missing') return 'Low confidence: evidence is missing.';
  if (candidate.sampleSize < 5) return 'Low confidence: sample size is below the v1 threshold.';
  if (candidate.priority === 'P0') return 'P0 operational issue ranked before growth suggestions.';
  if (candidate.evidenceStrength === 'direct') return 'Direct workflow or lead evidence supports the recommendation.';
  return 'Indirect evidence supports the recommendation.';
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
