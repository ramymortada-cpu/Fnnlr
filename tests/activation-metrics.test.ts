import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activationCohortSummary,
  computeActivationMetrics,
  type ActivationEvent,
} from '../modules/activation/src/metrics.js';
import {
  createActivationCohortReview,
  DEFAULT_ACTIVATION_COHORT_THRESHOLDS,
} from '../modules/activation/src/cohort-review.js';

const base = {
  tenantId: 'tenant_1',
  workspaceId: 'workspace_1',
  businessId: 'business_1',
};

test('activation metrics compute time-to-value from observed events only', () => {
  const events: ActivationEvent[] = [
    { ...base, eventName: 'workspace_created', occurredAt: '2026-06-01T10:00:00.000Z' },
    {
      ...base,
      eventName: 'template_selected',
      occurredAt: '2026-06-01T10:05:00.000Z',
      templateId: 'real-estate',
      industry: 'real-estate',
      goal: 'improve WhatsApp conversion',
    },
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
  assert.deepEqual(metrics.selectedIndustries, ['real-estate']);
  assert.deepEqual(metrics.selectedGoals, ['improve WhatsApp conversion']);
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
    topAbandonmentSteps: [],
    topAbandonmentReasons: [],
    medianTimeToFirstWorkflowMinutes: 40,
    medianTimeToFirstPublishMinutes: 60,
  });
});

test('activation cohort review marks healthy cohorts with no required actions', () => {
  const profile = {
    period: '2026-W25',
    segment: 'pilot',
    industry: 'real-estate',
    acquisitionSource: 'founder-led',
  };
  const days = ['2026-06-01', '2026-06-02', '2026-06-03'];
  const metrics = ['workspace_1', 'workspace_2', 'workspace_3'].map((workspaceId, index) =>
    computeActivationMetrics(workspaceId, [
      { ...base, workspaceId, eventName: 'workspace_created', occurredAt: `${days[index]}T10:00:00.000Z` },
      { ...base, workspaceId, eventName: 'first_workflow_created', occurredAt: `${days[index]}T10:20:00.000Z` },
      { ...base, workspaceId, eventName: 'first_publish', occurredAt: `${days[index]}T10:35:00.000Z` },
      { ...base, workspaceId, eventName: 'first_lead_action', occurredAt: `${days[index]}T11:00:00.000Z` },
    ]),
  );

  const review = createActivationCohortReview(profile, metrics);

  assert.equal(review.status, 'HEALTHY');
  assert.deepEqual(review.rates, {
    firstWorkflow: 1,
    firstPublish: 1,
    firstLeadAction: 1,
    abandonment: 0,
  });
  assert.deepEqual(review.blockers, []);
  assert.deepEqual(review.actions, []);
});

test('activation cohort review turns weak cohorts into owner-driven rescue actions', () => {
  const profile = {
    period: '2026-W26',
    segment: 'trial',
    industry: 'clinics',
    acquisitionSource: 'paid-social',
  };
  const activated = computeActivationMetrics('workspace_1', [
    { ...base, workspaceId: 'workspace_1', eventName: 'workspace_created', occurredAt: '2026-06-10T10:00:00.000Z' },
    { ...base, workspaceId: 'workspace_1', eventName: 'first_workflow_created', occurredAt: '2026-06-10T12:00:00.000Z' },
  ]);
  const abandoned = ['workspace_2', 'workspace_3'].map((workspaceId) =>
    computeActivationMetrics(workspaceId, [
      { ...base, workspaceId, eventName: 'workspace_created', occurredAt: '2026-06-10T10:00:00.000Z' },
      {
        ...base,
        workspaceId,
        eventName: 'onboarding_abandoned',
        occurredAt: '2026-06-10T10:15:00.000Z',
        abandonmentStep: 'integration',
        abandonmentReason: 'missing WhatsApp account',
      },
    ]),
  );

  const review = createActivationCohortReview(profile, [activated, ...abandoned]);

  assert.equal(review.status, 'RESCUE');
  assert.deepEqual(review.blockers, [
    'first_workflow_rate_below_threshold',
    'first_publish_rate_below_threshold',
    'first_lead_action_rate_below_threshold',
    'abandonment_rate_above_threshold',
    'median_first_workflow_time_above_threshold',
  ]);
  assert.deepEqual(review.topAbandonmentSteps, [{ value: 'integration', count: 2 }]);
  assert.deepEqual(review.topAbandonmentReasons, [{ value: 'missing WhatsApp account', count: 2 }]);
  assert.ok(review.actions.some((action) => action.owner === 'Product'));
  assert.ok(review.actions.some((action) => action.owner === 'Support'));
  assert.ok(review.actions.some((action) => action.owner === 'Engineering'));
  assert.ok(review.actions.some((action) => action.owner === 'Sales'));
  assert.ok(review.actions.some((action) => action.action.includes('"integration"')));
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('"missing WhatsApp account"')));
  assert.ok(review.actions.every((action) => action.evidenceRequired.length > 10));
});

test('default activation cohort thresholds keep the weekly review measurable', () => {
  assert.deepEqual(DEFAULT_ACTIVATION_COHORT_THRESHOLDS, {
    minFirstWorkflowRate: 0.75,
    minFirstPublishRate: 0.6,
    minLeadActionRate: 0.4,
    maxAbandonmentRate: 0.2,
    maxMedianFirstWorkflowMinutes: 45,
  });
});
