import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTemplatePerformanceReview,
  DEFAULT_TEMPLATE_PERFORMANCE_THRESHOLDS,
  TEMPLATE_PERFORMANCE_BASELINE,
  reviewTemplatePerformanceReadiness,
  type TemplatePerformanceCapability,
  type TemplatePerformanceSignal,
} from '../modules/activation/src/template-performance.js';

const profile = {
  industry: 'real-estate',
  templateId: 'real-estate-v1',
  version: '1.0.0',
  period: '2026-W26',
};

test('template performance promotes high-signal repeatable templates', () => {
  const signals: TemplatePerformanceSignal[] = Array.from({ length: 10 }, (_, index) => ({
    templateId: 'real-estate-v1',
    selected: true,
    published: true,
    firstSignalReceived: index < 9,
    firstLeadAction: index < 7,
    recommendationDecided: true,
    recommendationWorked: index < 6,
  }));

  const review = createTemplatePerformanceReview(profile, signals);

  assert.equal(review.decision, 'PROMOTE');
  assert.equal(review.metrics.selectedCount, 10);
  assert.equal(review.metrics.publishRate, 1);
  assert.equal(review.metrics.firstLeadActionRate, 0.7);
  assert.equal(review.metrics.recommendationCaptureRate, 0.6);
  assert.deepEqual(review.blockers, []);
  assert.deepEqual(review.actions, []);
});

test('template performance does not pass templates with too little evidence', () => {
  const review = createTemplatePerformanceReview(profile, [
    {
      templateId: 'real-estate-v1',
      selected: true,
      published: true,
      firstSignalReceived: true,
      firstLeadAction: true,
      recommendationDecided: true,
      recommendationWorked: true,
    },
  ]);

  assert.equal(review.decision, 'INSUFFICIENT_EVIDENCE');
  assert.ok(review.blockers.includes('insufficient_selection_evidence'));
  assert.ok(review.actions.some((action) => action.owner === 'Sales'));
});

test('template performance retires templates with broad operational failure', () => {
  const signals: TemplatePerformanceSignal[] = Array.from({ length: 5 }, () => ({
    templateId: 'real-estate-v1',
    selected: true,
    published: false,
    firstSignalReceived: false,
    firstLeadAction: false,
    recommendationDecided: true,
    recommendationWorked: false,
    supportIssueOpened: true,
  }));

  const review = createTemplatePerformanceReview(profile, signals);

  assert.equal(review.decision, 'RETIRE');
  assert.deepEqual(review.blockers, [
    'publish_rate_below_threshold',
    'first_signal_rate_below_threshold',
    'first_lead_action_rate_below_threshold',
    'recommendation_capture_rate_below_threshold',
    'support_issue_rate_above_threshold',
  ]);
  assert.ok(review.actions.some((action) => action.owner === 'Product'));
  assert.ok(review.actions.some((action) => action.owner === 'Support'));
});

test('template performance revises when recommendation capture evidence is missing', () => {
  const signals: TemplatePerformanceSignal[] = Array.from({ length: 5 }, () => ({
    templateId: 'real-estate-v1',
    selected: true,
    published: true,
    firstSignalReceived: true,
    firstLeadAction: true,
  }));

  const review = createTemplatePerformanceReview(profile, signals);

  assert.equal(review.decision, 'REVISE');
  assert.deepEqual(review.blockers, ['missing_recommendation_capture_evidence']);
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('Recommendation outcome sample')));
});

test('default template thresholds are strict enough for repeatability reviews', () => {
  assert.deepEqual(DEFAULT_TEMPLATE_PERFORMANCE_THRESHOLDS, {
    minSelectedCount: 5,
    minPublishRate: 0.6,
    minFirstSignalRate: 0.4,
    minLeadActionRate: 0.25,
    minRecommendationCaptureRate: 0.35,
    maxSupportIssueRate: 0.2,
  });
});

test('template performance readiness is contract-ready with hosted cohort gap', () => {
  const review = reviewTemplatePerformanceReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_HOSTED_GAPS');
  assert.equal(review.templateLoopClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('template_signal_schema'));
  assert.ok(review.readyCapabilities.includes('revise_retire_actions'));
  assert.ok(review.gapCapabilities.includes('hosted_template_cohort_evidence'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('template performance readiness blocks claims when evidence is missing', () => {
  const capabilities = TEMPLATE_PERFORMANCE_BASELINE.map((capability) =>
    capability.id === 'recommendation_outcome_capture'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewTemplatePerformanceReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_TEMPLATE_LOOP_READY');
  assert.deepEqual(review.blockedCapabilities, ['recommendation_outcome_capture']);
});

test('template performance loop can become ready when every capability has proof', () => {
  const capabilities: TemplatePerformanceCapability[] = TEMPLATE_PERFORMANCE_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['template-loop-proof.md'],
  }));

  const review = reviewTemplatePerformanceReadiness(capabilities);

  assert.equal(review.decision, 'TEMPLATE_LOOP_READY');
  assert.equal(review.templateLoopClaimAllowed, true);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});
