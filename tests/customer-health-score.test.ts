import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCustomerHealth, type CustomerHealthSignal } from '../modules/operating-room/src/health-score.js';

const healthySignal: CustomerHealthSignal = {
  activationLaunchReady: true,
  setupStuck: false,
  weeklyWorkflowActivity: 4,
  liveSignals: 6,
  recommendationsCompleted: 3,
  recommendationsIgnored: 0,
  unresolvedCriticalIssues: 0,
  supportP0P1Overdue: 0,
  aiCapExceeded: false,
  aiDegradedEvents: 0,
};

test('customer health is healthy when activation, usage, signals, support, and AI are good', () => {
  const health = scoreCustomerHealth(healthySignal);

  assert.equal(health.status, 'healthy');
  assert.equal(health.owner, 'none');
  assert.equal(health.nextAction, null);
  assert.ok(health.score >= 75);
  assert.ok(health.positiveSignals.includes('activation_launch_ready'));
  assert.ok(health.positiveSignals.includes('instrumentation_working'));
});

test('customer health blocks on unresolved critical issues regardless of score', () => {
  const health = scoreCustomerHealth({ ...healthySignal, unresolvedCriticalIssues: 1 });

  assert.equal(health.status, 'blocked');
  assert.equal(health.owner, 'engineering');
  assert.ok(health.riskSignals.includes('unresolved_critical_issue'));
  assert.match(health.nextAction ?? '', /critical blocker/);
});

test('customer health is at risk when setup is stuck and no signals arrived', () => {
  const health = scoreCustomerHealth({
    activationLaunchReady: false,
    setupStuck: true,
    weeklyWorkflowActivity: 0,
    liveSignals: 0,
    recommendationsCompleted: 0,
    recommendationsIgnored: 2,
    unresolvedCriticalIssues: 0,
    supportP0P1Overdue: 0,
    aiCapExceeded: false,
    aiDegradedEvents: 0,
  });

  assert.equal(health.status, 'at_risk');
  assert.equal(health.owner, 'customer_success');
  assert.ok(health.riskSignals.includes('setup_stuck'));
  assert.ok(health.riskSignals.includes('no_live_signals'));
  assert.match(health.nextAction ?? '', /activation recovery/);
});

test('customer health watches AI degradation before it becomes a blocker', () => {
  const health = scoreCustomerHealth({
    ...healthySignal,
    weeklyWorkflowActivity: 2,
    liveSignals: 3,
    recommendationsCompleted: 1,
    aiCapExceeded: true,
    aiDegradedEvents: 2,
  });

  assert.equal(health.status, 'watch');
  assert.equal(health.owner, 'engineering');
  assert.ok(health.riskSignals.includes('ai_cap_exceeded'));
  assert.ok(health.riskSignals.includes('ai_degraded'));
});
