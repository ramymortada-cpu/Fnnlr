export type CustomerHealthStatus = 'healthy' | 'watch' | 'at_risk' | 'blocked';

export type CustomerHealthSignal = {
  activationLaunchReady: boolean;
  setupStuck: boolean;
  weeklyWorkflowActivity: number;
  liveSignals: number;
  recommendationsCompleted: number;
  recommendationsIgnored: number;
  unresolvedCriticalIssues: number;
  supportP0P1Overdue: number;
  aiCapExceeded: boolean;
  aiDegradedEvents: number;
};

export type CustomerHealthScore = {
  status: CustomerHealthStatus;
  score: number;
  positiveSignals: string[];
  riskSignals: string[];
  owner: 'none' | 'support' | 'engineering' | 'founder_legal' | 'customer_success';
  nextAction: string | null;
};

export function scoreCustomerHealth(signal: CustomerHealthSignal): CustomerHealthScore {
  const positiveSignals: string[] = [];
  const riskSignals: string[] = [];
  let score = 50;

  if (signal.activationLaunchReady) {
    score += 15;
    positiveSignals.push('activation_launch_ready');
  } else if (signal.setupStuck) {
    score -= 20;
    riskSignals.push('setup_stuck');
  } else {
    score -= 8;
    riskSignals.push('activation_incomplete');
  }

  if (signal.weeklyWorkflowActivity > 0) {
    score += Math.min(15, signal.weeklyWorkflowActivity * 3);
    positiveSignals.push('weekly_workflow_activity');
  } else {
    score -= 15;
    riskSignals.push('no_weekly_activity');
  }

  if (signal.liveSignals > 0) {
    score += Math.min(10, signal.liveSignals);
    positiveSignals.push('instrumentation_working');
  } else {
    score -= 12;
    riskSignals.push('no_live_signals');
  }

  if (signal.recommendationsCompleted > 0) {
    score += Math.min(10, signal.recommendationsCompleted * 2);
    positiveSignals.push('recommendations_completed');
  }
  if (signal.recommendationsIgnored > 0) {
    score -= Math.min(12, signal.recommendationsIgnored * 3);
    riskSignals.push('recommendations_ignored');
  }

  if (signal.unresolvedCriticalIssues > 0) {
    score -= 35;
    riskSignals.push('unresolved_critical_issue');
  }
  if (signal.supportP0P1Overdue > 0) {
    score -= 25;
    riskSignals.push('support_p0_p1_overdue');
  }

  if (signal.aiCapExceeded) {
    score -= 15;
    riskSignals.push('ai_cap_exceeded');
  }
  if (signal.aiDegradedEvents > 0) {
    score -= Math.min(10, signal.aiDegradedEvents * 2);
    riskSignals.push('ai_degraded');
  }

  const bounded = Math.max(0, Math.min(100, score));
  const status = classifyHealth(bounded, signal);
  const owner = ownerFor(status, signal);
  return {
    status,
    score: bounded,
    positiveSignals,
    riskSignals,
    owner,
    nextAction: nextHealthAction(status, signal),
  };
}

function classifyHealth(score: number, signal: CustomerHealthSignal): CustomerHealthStatus {
  if (signal.unresolvedCriticalIssues > 0 || signal.supportP0P1Overdue > 0) return 'blocked';
  if (score >= 75) return 'healthy';
  if (score >= 55) return 'watch';
  return 'at_risk';
}

function ownerFor(status: CustomerHealthStatus, signal: CustomerHealthSignal): CustomerHealthScore['owner'] {
  if (status === 'healthy') return 'none';
  if (signal.unresolvedCriticalIssues > 0 || signal.aiCapExceeded || signal.aiDegradedEvents > 2) return 'engineering';
  if (signal.supportP0P1Overdue > 0) return 'support';
  if (signal.setupStuck || signal.liveSignals === 0) return 'customer_success';
  return 'support';
}

function nextHealthAction(status: CustomerHealthStatus, signal: CustomerHealthSignal): string | null {
  if (status === 'healthy') return null;
  if (signal.unresolvedCriticalIssues > 0) return 'Assign engineering owner and clear the critical blocker before expansion.';
  if (signal.supportP0P1Overdue > 0) return 'Resolve overdue P0/P1 support issue with owner, due date, and evidence link.';
  if (signal.setupStuck) return 'Run activation recovery and identify the exact missing setup step.';
  if (signal.liveSignals === 0) return 'Drive or verify first traffic signal so instrumentation is proven.';
  if (signal.weeklyWorkflowActivity === 0) return 'Schedule a customer success review to create or publish the next workflow.';
  if (signal.recommendationsIgnored > 0) return 'Review ignored recommendations and convert one into a human-approved action.';
  if (signal.aiCapExceeded || signal.aiDegradedEvents > 0) return 'Review AI cap/degradation and confirm fallback behavior with the operator.';
  return 'Review customer health signals and assign a next action.';
}
