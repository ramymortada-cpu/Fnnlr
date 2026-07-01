import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  adminOnboardingChecklistReadiness,
  createOnboardingRecoveryPlan,
  RECOVERY_GUARDRAILS,
} from '../modules/activation/src/recovery-readiness.js';
import { computeActivationMetrics, type ActivationEvent } from '../modules/activation/src/metrics.js';

const base = {
  tenantId: 'tenant_1',
  workspaceId: 'workspace_1',
  businessId: 'business_1',
};

test('onboarding recovery plan creates guarded email and support actions from missing setup evidence', () => {
  const metrics = computeActivationMetrics('workspace_1', [
    { ...base, eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    { ...base, eventName: 'template_selected', occurredAt: '2026-06-01T10:05:00.000Z', templateId: 'real-estate' },
  ] satisfies ActivationEvent[]);

  const plan = createOnboardingRecoveryPlan(metrics);

  assert.equal(plan.status, 'RECOVERY_READY');
  assert.equal(plan.adminChecklistRequired, true);
  assert.deepEqual(plan.steps.map((step) => step.trigger), [
    'no_industry_selected',
    'no_goal_selected',
    'template_not_customized',
    'workflow_not_created',
  ]);
  assert.ok(plan.steps.some((step) => step.channel === 'email'));
  assert.ok(plan.steps.some((step) => step.channel === 'support_task'));
  assert.ok(plan.steps.every((step) => step.guardrails === RECOVERY_GUARDRAILS));
});

test('published workspace without first signal routes to operator review', () => {
  const metrics = computeActivationMetrics('workspace_1', [
    {
      ...base,
      eventName: 'workspace_created',
      occurredAt: '2026-06-01T10:00:00.000Z',
      industry: 'real-estate',
      goal: 'improve follow-up',
    },
    { ...base, eventName: 'first_workflow_created', occurredAt: '2026-06-01T10:15:00.000Z' },
    { ...base, eventName: 'first_publish', occurredAt: '2026-06-01T10:30:00.000Z' },
  ] satisfies ActivationEvent[]);

  const plan = createOnboardingRecoveryPlan(metrics);

  assert.equal(plan.status, 'OPERATOR_REVIEW_REQUIRED');
  assert.deepEqual(plan.steps.map((step) => step.trigger), ['no_first_signal_after_publish']);
  assert.equal(plan.steps[0].owner, 'Engineering');
});

test('abandoned onboarding preserves last step and reason in recovery evidence', () => {
  const metrics = computeActivationMetrics('workspace_1', [
    { ...base, eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    {
      ...base,
      eventName: 'onboarding_abandoned',
      occurredAt: '2026-06-01T10:08:00.000Z',
      abandonmentStep: 'payment',
      abandonmentReason: 'missing manual transfer instructions',
    },
  ] satisfies ActivationEvent[]);

  const plan = createOnboardingRecoveryPlan(metrics);

  assert.ok(plan.steps.some((step) => step.trigger === 'onboarding_abandoned'));
  assert.match(plan.steps.find((step) => step.trigger === 'onboarding_abandoned')?.evidenceRequired ?? '', /payment/);
  assert.match(plan.steps.find((step) => step.trigger === 'onboarding_abandoned')?.evidenceRequired ?? '', /manual transfer/);
});

test('admin onboarding checklist stays incomplete until every evidence item is present', () => {
  const review = adminOnboardingChecklistReadiness({
    industrySelected: true,
    goalSelected: true,
    ownerUserCreated: true,
    businessCreated: true,
    templateSelected: true,
    workflowCreated: true,
    workflowPublished: false,
    trackedLinkCreated: false,
    smokeSignalRecorded: false,
    supportOwnerAssigned: true,
    dailyCheckScheduled: false,
  });

  assert.equal(review.status, 'CHECKLIST_INCOMPLETE');
  assert.deepEqual(review.missing, [
    'workflowPublished',
    'trackedLinkCreated',
    'smokeSignalRecorded',
    'dailyCheckScheduled',
  ]);
  assert.ok(review.evidenceRequired.every((item) => item.includes('Attach evidence')));
});

test('admin onboarding checklist completes only with full proof', () => {
  const review = adminOnboardingChecklistReadiness({
    industrySelected: true,
    goalSelected: true,
    ownerUserCreated: true,
    businessCreated: true,
    templateSelected: true,
    workflowCreated: true,
    workflowPublished: true,
    trackedLinkCreated: true,
    smokeSignalRecorded: true,
    supportOwnerAssigned: true,
    dailyCheckScheduled: true,
  });

  assert.deepEqual(review, {
    status: 'CHECKLIST_COMPLETE',
    missing: [],
    evidenceRequired: [],
  });
});
