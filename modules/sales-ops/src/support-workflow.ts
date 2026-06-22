import type { IssueSeverity } from '../../execution/src/issues.js';

/**
 * Sales-ops — support workflow. A thin, repeatable process on top of the existing
 * issue log (Sprint 41/42). It does NOT add a ticket system: it shapes an intake,
 * classifies severity, requires an owner + next action for P0/P1, and produces a
 * record ready for the issue log and the week review. The actual persistence is
 * the existing audit-backed issue log.
 */

export interface SupportIntake {
  summary: string;
  source: string;             // e.g. 'customer', 'daily-check', 'go-live'
  severity: IssueSeverity;
  evidence: string;
  owner?: 'platform' | 'support' | 'customer';
  nextAction?: string;
}

export interface SupportRecord {
  summary: string;
  source: string;
  severity: IssueSeverity;
  evidence: string;
  owner: 'platform' | 'support' | 'customer';
  nextAction: string;
  safeRollback: string | null;
  status: 'open';
}

/**
 * Validate + shape a support intake into a record. Mirrors the issue-log guard:
 * a P0/P1 MUST have an owner and a next action, or it is rejected.
 */
export function intakeSupportIssue(intake: SupportIntake): { ok: boolean; record?: SupportRecord; errors: string[] } {
  const errors: string[] = [];
  if (!intake.summary?.trim()) errors.push('summary is required');
  if (!intake.evidence?.trim()) errors.push('evidence is required');
  const critical = intake.severity === 'P0' || intake.severity === 'P1';
  if (critical && !intake.owner) errors.push(`a ${intake.severity} issue requires an owner`);
  if (critical && !intake.nextAction?.trim()) errors.push(`a ${intake.severity} issue requires a next action`);
  if (errors.length) return { ok: false, errors };

  const safeRollback = intake.severity === 'P0'
    ? 'consider pausing the affected connection/jobs while investigating (see triage)'
    : null;

  return {
    ok: true,
    errors: [],
    record: {
      summary: intake.summary.trim(),
      source: intake.source,
      severity: intake.severity,
      evidence: intake.evidence.trim(),
      owner: intake.owner ?? 'support',
      nextAction: intake.nextAction?.trim() || 'triage and assign',
      safeRollback,
      status: 'open',
    },
  };
}

/** Summarize open issues for the week review — counts by severity + unresolved blockers. */
export function reviewSupport(issues: { severity: string; status: string; nextAction: string; owner: string; source: string }[]): {
  counts: Record<string, number>; openBlockers: { severity: string; nextAction: string; owner: string }[]; allCriticalOwned: boolean;
} {
  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const openBlockers: { severity: string; nextAction: string; owner: string }[] = [];
  let allCriticalOwned = true;
  for (const i of issues) {
    counts[i.severity] = (counts[i.severity] ?? 0) + 1;
    if (i.status === 'open' && (i.severity === 'P0' || i.severity === 'P1')) {
      openBlockers.push({ severity: i.severity, nextAction: i.nextAction, owner: i.owner });
      if (!i.owner) allCriticalOwned = false;
    }
  }
  return { counts, openBlockers, allCriticalOwned };
}
