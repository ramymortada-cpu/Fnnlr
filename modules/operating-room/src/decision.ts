import type { Incident, OperatingEvidence } from './incidents.js';
import { highestSeverity } from './incidents.js';

/**
 * Decision gate — PURE. Given the operating evidence + classified incidents,
 * returns a go/hold/rollback decision with confidence, blockers, warnings, and
 * the next action. It never claims a customer is ready when a P0/P1 or missing
 * configuration says otherwise.
 */

export type Decision = 'CONTINUE' | 'HOLD' | 'ROLLBACK_OR_DISABLE' | 'NEEDS_CONFIGURATION';

export interface DecisionResult {
  decision: Decision;
  confidence: 'low' | 'medium' | 'high';
  blockers: string[];
  warnings: string[];
  nextAction: string;
}

export function decideGate(e: OperatingEvidence, incidents: Incident[]): DecisionResult {
  const sev = highestSeverity(incidents);
  const p0 = incidents.filter((i) => i.severity === 'P0');
  const p1 = incidents.filter((i) => i.severity === 'P1');
  const p2 = incidents.filter((i) => i.severity === 'P2');
  const warnings = p2.map((i) => `${i.code}: ${i.reason}`);

  // 1) P0 → rollback / disable (security, availability, corruption)
  if (p0.length) {
    return {
      decision: 'ROLLBACK_OR_DISABLE',
      confidence: 'high',
      blockers: p0.map((i) => `${i.code}: ${i.reason}`),
      warnings,
      nextAction: p0[0].safeRollback ?? 'Disable the deployment and resolve the P0.',
    };
  }

  // 2) missing configuration → NEEDS_CONFIGURATION (customer can't get a signal)
  const missingConfig: string[] = [];
  if (e.activation && !e.activation.launchReady) {
    if (e.activation.blockingReason) missingConfig.push(e.activation.blockingReason);
    else missingConfig.push('activation is not launch-ready');
  }
  if (missingConfig.length) {
    return {
      decision: 'NEEDS_CONFIGURATION',
      confidence: 'high',
      blockers: missingConfig,
      warnings,
      nextAction: e.activation?.blockingReason ?? 'Complete activation setup (page, link, payment).',
    };
  }

  // 3) P1 → hold (launch-ready but a real flow is broken)
  if (p1.length) {
    return {
      decision: 'HOLD',
      confidence: 'medium',
      blockers: p1.map((i) => `${i.code}: ${i.reason}`),
      warnings,
      nextAction: p1[0].suggestedFix,
    };
  }

  // 4) launch-ready, no P0/P1. If signals are flowing → continue (high);
  //    if launch-ready but no traffic yet → continue with low confidence.
  const hasSignal = e.signals.pageViews > 0 || e.signals.whatsappClicks > 0 || e.signals.leads > 0;
  return {
    decision: 'CONTINUE',
    confidence: hasSignal ? 'high' : 'low',
    blockers: [],
    warnings,
    nextAction: hasSignal ? 'System healthy and signals flowing — keep monitoring.' : 'Launch-ready; drive first traffic and keep monitoring.',
  };
}
