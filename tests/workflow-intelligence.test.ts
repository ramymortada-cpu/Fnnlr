import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeWorkflowIntelligenceMetrics,
  workflowIntelligenceReadiness,
  type WorkflowIntelligenceEvent,
} from '../modules/ai-ops/src/workflow-intelligence.js';

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
