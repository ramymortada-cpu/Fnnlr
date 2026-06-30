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
  category?: SupportCategory;
  evidence: string;
  owner?: 'platform' | 'support' | 'customer';
  nextAction?: string;
  dueDate?: string;
  evidenceLink?: string;
}

export interface SupportRecord {
  summary: string;
  source: string;
  severity: IssueSeverity;
  category: SupportCategory;
  evidence: string;
  owner: 'platform' | 'support' | 'customer';
  nextAction: string;
  dueDate: string | null;
  evidenceLink: string | null;
  safeRollback: string | null;
  status: 'open';
}

export type SupportCategory =
  | 'tenant_isolation'
  | 'auth_mfa'
  | 'workflow_blocked'
  | 'email_deliverability'
  | 'webhook_failure'
  | 'ai_degraded'
  | 'data_lifecycle'
  | 'billing_commercial';

export type SupportOwner = 'platform' | 'support' | 'customer';

export const SUPPORT_TRIAGE_CATALOG: Record<SupportCategory, {
  label: string;
  severityTrigger: string;
  defaultOwner: SupportOwner;
  escalationOwner: SupportOwner;
}> = {
  tenant_isolation: {
    label: 'Tenant isolation',
    severityTrigger: 'Any cross-tenant suspicion',
    defaultOwner: 'platform',
    escalationOwner: 'platform',
  },
  auth_mfa: {
    label: 'Auth/MFA',
    severityTrigger: 'Admin access issue',
    defaultOwner: 'platform',
    escalationOwner: 'platform',
  },
  workflow_blocked: {
    label: 'Workflow blocked',
    severityTrigger: 'Customer cannot publish or run workflow',
    defaultOwner: 'support',
    escalationOwner: 'platform',
  },
  email_deliverability: {
    label: 'Email deliverability',
    severityTrigger: 'Verification/reset/admin alert failure',
    defaultOwner: 'support',
    escalationOwner: 'platform',
  },
  webhook_failure: {
    label: 'Webhook failure',
    severityTrigger: 'Signed provider event rejected incorrectly',
    defaultOwner: 'platform',
    escalationOwner: 'platform',
  },
  ai_degraded: {
    label: 'AI degraded',
    severityTrigger: 'Provider unavailable or budget capped',
    defaultOwner: 'support',
    escalationOwner: 'platform',
  },
  data_lifecycle: {
    label: 'Data export/delete',
    severityTrigger: 'Customer data lifecycle request',
    defaultOwner: 'support',
    escalationOwner: 'platform',
  },
  billing_commercial: {
    label: 'Billing/commercial',
    severityTrigger: 'Plan, agreement, or payment-state confusion',
    defaultOwner: 'support',
    escalationOwner: 'support',
  },
};

/**
 * Validate + shape a support intake into a record. Mirrors the issue-log guard:
 * a P0/P1 MUST have an owner and a next action, or it is rejected.
 */
export function intakeSupportIssue(intake: SupportIntake): { ok: boolean; record?: SupportRecord; errors: string[] } {
  const errors: string[] = [];
  if (!intake.summary?.trim()) errors.push('summary is required');
  if (!intake.evidence?.trim()) errors.push('evidence is required');
  const category = intake.category ?? inferSupportCategory(intake.summary);
  const critical = intake.severity === 'P0' || intake.severity === 'P1';
  if (critical && !intake.owner) errors.push(`a ${intake.severity} issue requires an owner`);
  if (critical && !intake.nextAction?.trim()) errors.push(`a ${intake.severity} issue requires a next action`);
  if (critical && !intake.dueDate?.trim()) errors.push(`a ${intake.severity} issue requires a due date`);
  if (critical && !intake.evidenceLink?.trim()) errors.push(`a ${intake.severity} issue requires an evidence link`);
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
      category,
      evidence: intake.evidence.trim(),
      owner: intake.owner ?? SUPPORT_TRIAGE_CATALOG[category].defaultOwner,
      nextAction: intake.nextAction?.trim() || 'triage and assign',
      dueDate: intake.dueDate?.trim() || null,
      evidenceLink: intake.evidenceLink?.trim() || null,
      safeRollback,
      status: 'open',
    },
  };
}

/** Summarize open issues for the week review — counts by severity + unresolved blockers. */
export function reviewSupport(issues: { severity: string; status: string; nextAction: string; owner: string; source: string; category?: SupportCategory; dueDate?: string | null; evidenceLink?: string | null }[]): {
  counts: Record<string, number>;
  categoryCounts: Record<SupportCategory, number>;
  openBlockers: { severity: string; category: SupportCategory | 'uncategorized'; nextAction: string; owner: string; dueDate: string | null; evidenceLink: string | null }[];
  allCriticalOwned: boolean;
} {
  const counts: Record<string, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  const categoryCounts = Object.fromEntries(Object.keys(SUPPORT_TRIAGE_CATALOG).map((category) => [category, 0])) as Record<SupportCategory, number>;
  const openBlockers: { severity: string; category: SupportCategory | 'uncategorized'; nextAction: string; owner: string; dueDate: string | null; evidenceLink: string | null }[] = [];
  let allCriticalOwned = true;
  for (const i of issues) {
    counts[i.severity] = (counts[i.severity] ?? 0) + 1;
    if (i.category) categoryCounts[i.category] = (categoryCounts[i.category] ?? 0) + 1;
    if (i.status === 'open' && (i.severity === 'P0' || i.severity === 'P1')) {
      openBlockers.push({
        severity: i.severity,
        category: i.category ?? 'uncategorized',
        nextAction: i.nextAction,
        owner: i.owner,
        dueDate: i.dueDate ?? null,
        evidenceLink: i.evidenceLink ?? null,
      });
      if (!i.owner || !i.nextAction || !i.dueDate || !i.evidenceLink) allCriticalOwned = false;
    }
  }
  return { counts, categoryCounts, openBlockers, allCriticalOwned };
}

export function inferSupportCategory(summary: string): SupportCategory {
  const text = summary.toLowerCase();
  if (/tenant|cross-tenant|isolation/.test(text)) return 'tenant_isolation';
  if (/auth|login|mfa|admin access/.test(text)) return 'auth_mfa';
  if (/publish|workflow|activation|stuck/.test(text)) return 'workflow_blocked';
  if (/email|reset|verification|deliverability/.test(text)) return 'email_deliverability';
  if (/webhook|signature|provider event/.test(text)) return 'webhook_failure';
  if (/\bai\b|llm|degraded|budget|cap/.test(text)) return 'ai_degraded';
  if (/export|delete|deletion|retention|data lifecycle/.test(text)) return 'data_lifecycle';
  if (/billing|commercial|plan|agreement|payment state/.test(text)) return 'billing_commercial';
  return 'workflow_blocked';
}
