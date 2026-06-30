import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkflowIntelligenceMetrics,
  rankNextBestActions,
  scoreFollowUpQuality,
  scoreLeadQualificationConfidence,
  workflowIntelligenceReadiness,
  type NextBestActionCandidate,
  type WorkflowIntelligenceEvent,
} from '../modules/ai-ops/src/workflow-intelligence.js';
import {
  createAISpendReview,
  DEFAULT_AI_SPEND_REVIEW_THRESHOLDS,
} from '../modules/ai-ops/src/spend-review.js';
import {
  AI_OPERATIONS_SURFACES,
  reviewAIOperationsReadiness,
  type AIOperationsSurface,
} from '../modules/ai-ops/src/dashboard-readiness.js';

const base = {
  tenantId: 'tenant_1',
  brain: 'command',
  status: 'allowed' as const,
};

test('workflow intelligence computes AI margin and resilience metrics', () => {
  const events: WorkflowIntelligenceEvent[] = [
    { ...base, workflowId: 'wf_1', outcomeId: 'out_1', outcomeStatus: 'successful', actualCostUsd: 0.10 },
    { ...base, workflowId: 'wf_1', outcomeId: 'out_2', outcomeStatus: 'failed', estimatedCostUsd: 0.05 },
    { ...base, workflowId: 'wf_2', outcomeId: 'out_3', outcomeStatus: 'successful', actualCostUsd: 0.15 },
    { ...base, workflowId: 'wf_2', status: 'degraded', degradationReason: 'ai kill switch enabled', estimatedCostUsd: 0.02 },
  ];

  const metrics = computeWorkflowIntelligenceMetrics(events);

  assert.equal(metrics.totalAiRequests, 4);
  assert.equal(metrics.totalCostUsd, 0.32);
  assert.equal(metrics.workflowsTouched, 2);
  assert.equal(metrics.successfulActions, 2);
  assert.equal(metrics.degradedFallbacks, 1);
  assert.equal(metrics.costPerWorkflow, 0.16);
  assert.equal(metrics.costPerSuccessfulAction, 0.16);
  assert.equal(metrics.degradedFallbackRate, 0.25);
});

test('workflow intelligence is honest when linkage evidence is missing', () => {
  const metrics = computeWorkflowIntelligenceMetrics([{ ...base, estimatedCostUsd: 0.30 }]);
  const readiness = workflowIntelligenceReadiness([{ ...base, estimatedCostUsd: 0.30 }]);

  assert.equal(metrics.costPerWorkflow, null);
  assert.equal(metrics.costPerSuccessfulAction, null);
  assert.equal(readiness.ready, false);
  assert.deepEqual(readiness.missing, ['workflow_id', 'outcome_status']);
});

test('workflow intelligence readiness passes with workflow and outcome evidence', () => {
  const readiness = workflowIntelligenceReadiness([
    { ...base, workflowId: 'wf_1' },
    { ...base, outcomeStatus: 'successful' },
  ]);

  assert.deepEqual(readiness, { ready: true, missing: [] });
});

test('AI spend review passes only when cost, outcomes, and degradation stay controlled', () => {
  const review = createAISpendReview(
    { start: '2026-06-01', end: '2026-06-30' },
    [
      { ...base, workflowId: 'wf_1', outcomeStatus: 'successful', actualCostUsd: 0.08 },
      { ...base, workflowId: 'wf_2', outcomeStatus: 'successful', actualCostUsd: 0.12 },
      { ...base, workflowId: 'wf_3', outcomeStatus: 'failed', actualCostUsd: 0.04 },
    ],
    { ...DEFAULT_AI_SPEND_REVIEW_THRESHOLDS, monthlyBudgetUsd: 10 },
  );

  assert.equal(review.status, 'IN_BUDGET');
  assert.equal(review.totalCostUsd, 0.24);
  assert.equal(review.budgetUtilizationRate, 0.024);
  assert.equal(review.costPerSuccessfulActionUsd, 0.12);
  assert.equal(review.degradedFallbackRate, 0);
  assert.deepEqual(review.blockers, []);
  assert.deepEqual(review.actions, []);
});

test('AI spend review creates owner actions for budget, margin, and fallback problems', () => {
  const review = createAISpendReview(
    { start: '2026-06-01', end: '2026-06-30' },
    [
      { ...base, workflowId: 'wf_1', outcomeStatus: 'successful', actualCostUsd: 1.1 },
      { ...base, workflowId: 'wf_2', outcomeStatus: 'failed', actualCostUsd: 0.8 },
      {
        ...base,
        workflowId: 'wf_3',
        status: 'degraded',
        degradationReason: 'AI kill switch enabled',
        estimatedCostUsd: 0.2,
      },
    ],
    {
      monthlyBudgetUsd: 1,
      maxCostPerSuccessfulActionUsd: 0.35,
      maxDegradedFallbackRate: 0.1,
      maxKillSwitchActivations: 0,
    },
  );

  assert.equal(review.status, 'COST_RESCUE');
  assert.deepEqual(review.blockers, [
    'monthly_budget_exceeded',
    'cost_per_successful_action_above_threshold',
    'degraded_fallback_rate_above_threshold',
    'kill_switch_activation_detected',
  ]);
  assert.ok(review.actions.some((action) => action.owner === 'Finance/ops'));
  assert.ok(review.actions.some((action) => action.owner === 'Product'));
  assert.ok(review.actions.some((action) => action.owner === 'Engineering'));
  assert.ok(review.actions.some((action) => action.owner === 'Support'));
});

test('AI spend review treats missing successful-action cost evidence as rescue', () => {
  const review = createAISpendReview(
    { start: '2026-06-01', end: '2026-06-30' },
    [{ ...base, workflowId: 'wf_1', outcomeStatus: 'unknown', actualCostUsd: 0.05 }],
  );

  assert.equal(review.status, 'COST_RESCUE');
  assert.deepEqual(review.blockers, ['missing_successful_action_cost_evidence']);
  assert.ok(review.actions.some((action) => action.owner === 'Product'));
});

test('next-best-action ranks P0 operational evidence before growth suggestions', () => {
  const candidates: NextBestActionCandidate[] = [
    {
      id: 'growth_1',
      label: 'Launch a new campaign variant',
      priority: 'P2',
      category: 'growth',
      requiresMutation: false,
      humanApprovalRequired: false,
      evidenceStrength: 'direct',
      sampleSize: 50,
      locale: 'ar',
    },
    {
      id: 'ops_1',
      label: 'Fix webhook failure alerts',
      priority: 'P0',
      category: 'operational',
      requiresMutation: false,
      humanApprovalRequired: false,
      evidenceStrength: 'direct',
      sampleSize: 8,
      locale: 'global',
    },
  ];

  const ranked = rankNextBestActions(candidates);

  assert.equal(ranked[0].id, 'ops_1');
  assert.equal(ranked[0].rank, 1);
  assert.equal(ranked[0].confidence, 'medium');
  assert.match(ranked[0].reason, /P0 operational/);
});

test('next-best-action blocks mutating actions that lack human approval', () => {
  const ranked = rankNextBestActions([
    {
      id: 'auto_send',
      label: 'Auto-send WhatsApp recovery message',
      priority: 'P1',
      category: 'revenue',
      requiresMutation: true,
      humanApprovalRequired: false,
      evidenceStrength: 'direct',
      sampleSize: 30,
      locale: 'ar',
    },
  ]);

  assert.equal(ranked[0].confidence, 'blocked');
  assert.match(ranked[0].reason, /human approval/);
});

test('follow-up quality score rewards Arabic-safe measurable copy', () => {
  const excellent = scoreFollowUpQuality({
    hasClearNextStep: true,
    hasLocalArabicTone: true,
    avoidsFalseUrgency: true,
    hasHonestPaymentOrSupportBoundary: true,
    hasMeasurableCta: true,
  });
  const weak = scoreFollowUpQuality({
    hasClearNextStep: true,
    hasLocalArabicTone: false,
    avoidsFalseUrgency: false,
    hasHonestPaymentOrSupportBoundary: true,
    hasMeasurableCta: false,
  });

  assert.equal(excellent.score, 100);
  assert.equal(excellent.grade, 'excellent');
  assert.equal(weak.score, 40);
  assert.equal(weak.grade, 'needs_revision');
  assert.deepEqual(weak.missing, ['hasLocalArabicTone', 'avoidsFalseUrgency', 'hasMeasurableCta']);
});

test('lead qualification confidence is high only when core fit signals are present', () => {
  const confidence = scoreLeadQualificationConfidence({
    hasExplicitNeed: true,
    hasBudgetOrPaymentReadiness: true,
    hasTimeUrgency: true,
    hasAuthoritySignal: true,
    matchesSupportedIndustryTemplate: true,
  });

  assert.equal(confidence.score, 100);
  assert.equal(confidence.confidence, 'high');
  assert.equal(confidence.nextAction, 'qualify_now');
  assert.deepEqual(confidence.missing, []);
});

test('lead qualification confidence routes partial evidence to missing-signal confirmation', () => {
  const confidence = scoreLeadQualificationConfidence({
    hasExplicitNeed: true,
    hasBudgetOrPaymentReadiness: true,
    hasTimeUrgency: false,
    hasAuthoritySignal: false,
    matchesSupportedIndustryTemplate: true,
  });

  assert.equal(confidence.score, 65);
  assert.equal(confidence.confidence, 'medium');
  assert.equal(confidence.nextAction, 'confirm_missing_signals');
  assert.deepEqual(confidence.missing, ['hasTimeUrgency', 'hasAuthoritySignal']);
});

test('lead qualification confidence sends weak leads to discovery instead of fabricating confidence', () => {
  const confidence = scoreLeadQualificationConfidence({
    hasExplicitNeed: false,
    hasBudgetOrPaymentReadiness: false,
    hasTimeUrgency: true,
    hasAuthoritySignal: false,
    matchesSupportedIndustryTemplate: false,
  });

  assert.equal(confidence.score, 15);
  assert.equal(confidence.confidence, 'low');
  assert.equal(confidence.nextAction, 'route_to_discovery');
  assert.deepEqual(confidence.missing, [
    'hasExplicitNeed',
    'hasBudgetOrPaymentReadiness',
    'hasAuthoritySignal',
    'matchesSupportedIndustryTemplate',
  ]);
});

test('AI operations dashboard readiness is contract-ready but gap-labeled for cap UI', () => {
  const review = reviewAIOperationsReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_GAPS');
  assert.equal(review.dashboardReady, false);
  assert.equal(review.tenantCapUiReady, false);
  assert.ok(review.readySurfaces.includes('tenant_cost_summary'));
  assert.ok(review.readySurfaces.includes('workflow_cost_breakdown'));
  assert.ok(review.gapSurfaces.includes('tenant_cap_display'));
  assert.ok(review.gapSurfaces.includes('tenant_cap_change_request'));
  assert.deepEqual(review.blockedSurfaces, []);
});

test('AI operations readiness blocks ready claims when evidence is missing', () => {
  const surfaces: AIOperationsSurface[] = AI_OPERATIONS_SURFACES.map((surface) =>
    surface.id === 'tenant_cost_summary'
      ? { ...surface, evidence: [] }
      : surface,
  );

  const review = reviewAIOperationsReadiness(surfaces);

  assert.equal(review.decision, 'DO_NOT_CLAIM_READY');
  assert.deepEqual(review.blockedSurfaces, ['tenant_cost_summary']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach AI operations evidence')));
});

test('AI operations readiness becomes operator-ready only when every surface is evidenced and ready', () => {
  const surfaces: AIOperationsSurface[] = AI_OPERATIONS_SURFACES.map((surface) => ({
    ...surface,
    status: 'READY',
    evidence: [`evidence/ai-ops/${surface.id}.md`],
  }));

  const review = reviewAIOperationsReadiness(surfaces);

  assert.equal(review.decision, 'OPERATOR_READY');
  assert.equal(review.dashboardReady, true);
  assert.equal(review.tenantCapUiReady, true);
  assert.deepEqual(review.gapSurfaces, []);
  assert.deepEqual(review.blockedSurfaces, []);
});
