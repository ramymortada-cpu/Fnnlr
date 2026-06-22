import { withTenant } from '../../../packages/db/src/router.js';
import { audit } from '../../security/src/audit.js';

/**
 * Issue log — lightweight, audit-backed. Documents first-72h friction without a
 * ticket system. Each issue is an audit_events row (action='issue_logged') with
 * a structured detail; resolution writes an 'issue_resolved' row referencing it.
 * No parallel storage, no secrets.
 */

export type IssueSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export interface IssueInput {
  severity: IssueSeverity;
  source: string;            // e.g. 'go-live', '72h-monitor', 'triage:webhook_failure'
  evidence: string;
  owner: 'platform' | 'support' | 'customer';
  nextAction: string;
}

export interface LoggedIssue {
  id: string;
  severity: IssueSeverity;
  source: string;
  evidence: string;
  owner: string;
  status: 'open' | 'resolved';
  nextAction: string;
  createdAt: string;
  resolvedAt: string | null;
}

export async function logIssue(tenantId: string, actor: string, issue: IssueInput): Promise<string> {
  // safety: a critical incident must have an owner and a next action, or it can
  // be silently dropped. Enforce it.
  if ((issue.severity === 'P0' || issue.severity === 'P1')) {
    if (!issue.owner) throw new Error(`a ${issue.severity} issue requires an owner`);
    if (!issue.nextAction?.trim()) throw new Error(`a ${issue.severity} issue requires a next action`);
  }
  const id = `iss_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  await audit(tenantId, actor, 'issue_logged', id, {
    issueId: id, severity: issue.severity, source: issue.source, evidence: issue.evidence,
    owner: issue.owner, nextAction: issue.nextAction, status: 'open',
  });
  return id;
}

export async function resolveIssue(tenantId: string, actor: string, issueId: string, resolution: string): Promise<void> {
  await audit(tenantId, actor, 'issue_resolved', issueId, { issueId, resolution, status: 'resolved' });
}

export async function listIssues(tenantId: string, limit = 100): Promise<LoggedIssue[]> {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(
      `SELECT action, target, detail, created_at FROM audit_events
        WHERE action IN ('issue_logged','issue_resolved') ORDER BY created_at ASC LIMIT $1`, [limit])).rows;
    const map = new Map<string, LoggedIssue>();
    for (const r of rows as any[]) {
      const d = r.detail ?? {};
      const id = d.issueId ?? r.target;
      if (!id) continue;
      if (r.action === 'issue_logged') {
        map.set(id, { id, severity: d.severity, source: d.source, evidence: d.evidence, owner: d.owner, status: 'open', nextAction: d.nextAction, createdAt: new Date(r.created_at).toISOString(), resolvedAt: null });
      } else if (r.action === 'issue_resolved' && map.has(id)) {
        const ex = map.get(id)!; ex.status = 'resolved'; ex.resolvedAt = new Date(r.created_at).toISOString();
      }
    }
    return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  });
}
