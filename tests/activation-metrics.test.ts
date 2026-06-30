import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activationCohortSummary,
  computeActivationMetrics,
  type ActivationEvent,
} from '../modules/activation/src/metrics.js';

const base = {
  tenantId: 'tenant_1',
  workspaceId: 'workspace_1',
  businessId: 'business_1',
};

test('activation metrics compute time-to-value from observed events only', () => {
  const events: ActivationEvent[] = [
    { ...base, eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    { ...base, eventName: 'template_selected', occurredAt: '2026-06-01T10:05:00.000Z', templateId: 'real-estate' },
    { ...base, eventName: 'first_workflow_created', occurredAt: '2026-06-01T10:20:00.000Z' },
    { ...base, eventName: 'first_publish', occurredAt: '2026-06-01T11:00:00.000Z' },
    { ...base, eventName: 'first_signal_received', occurredAt: '2026-06-01T11:10:00.000Z' },
    { ...base, eventName: 'first_lead_action', occurredAt: '2026-06-01T11:30:00.000Z' },
  ];

  const metrics = computeActivationMetrics('workspace_1', events);

  assert.equal(metrics.timeToFirstWorkflowMinutes, 20);
  assert.equal(metrics.timeToFirstPublishMinutes, 60);
  assert.equal(metrics.timeToFirstLeadActionMinutes, 90);
  assert.equal(metrics.firstSignalReceived, true);
  assert.deepEqual(metrics.selectedTemplateIds, ['real-estate']);
  assert.deepEqual(metrics.missingEvidence, []);
});

test('activation metrics expose missing evidence instead of fabricating activation', () => {
  const metrics = computeActivationMetrics('workspace_1', [
    { ...base, eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    {
      ...base,
      eventName: 'onboarding_abandoned',
      occurredAt: '2026-06-01T10:15:00.000Z',
      abandonmentStep: 'industry',
      abandonmentReason: 'missing WhatsApp owner',
    },
  ]);

  assert.equal(metrics.timeToFirstWorkflowMinutes, null);
  assert.equal(metrics.timeToFirstPublishMinutes, null);
  assert.equal(metrics.timeToFirstLeadActionMinutes, null);
  assert.equal(metrics.onboardingAbandoned, true);
  assert.equal(metrics.abandonmentStep, 'industry');
  assert.equal(metrics.abandonmentReason, 'missing WhatsApp owner');
  assert.deepEqual(metrics.missingEvidence, ['first_workflow_created', 'first_publish', 'first_lead_action']);
});

test('activation cohort summary measures repeatability across workspaces', () => {
  const one = computeActivationMetrics('workspace_1', [
    { ...base, workspaceId: 'workspace_1', eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    { ...base, workspaceId: 'workspace_1', eventName: 'first_workflow_created', occurredAt: '2026-06-01T10:20:00.000Z' },
    { ...base, workspaceId: 'workspace_1', eventName: 'first_publish', occurredAt: '2026-06-01T11:00:00.000Z' },
  ]);
  const two = computeActivationMetrics('workspace_2', [
    { ...base, workspaceId: 'workspace_2', eventName: 'workspace_created', occurredAt: '2026-06-02T10:00:00.000Z' },
    { ...base, workspaceId: 'workspace_2', eventName: 'first_workflow_created', occurredAt: '2026-06-02T11:00:00.000Z' },
    { ...base, workspaceId: 'workspace_2', eventName: 'onboarding_abandoned', occurredAt: '2026-06-02T11:10:00.000Z' },
  ]);

  assert.deepEqual(activationCohortSummary([one, two]), {
    workspaces: 2,
    activatedWorkflows: 2,
    published: 1,
    leadActionActivated: 0,
    abandoned: 1,
    medianTimeToFirstWorkflowMinutes: 40,
    medianTimeToFirstPublishMinutes: 60,
  });
});
