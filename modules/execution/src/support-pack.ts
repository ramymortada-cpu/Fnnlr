import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Support pack — one safe payload for the support OPERATOR (not the customer).
 * Gathers activation, execution lock (when a manifest is available), daily
 * check, issues, latest audit events, latest integration failures, latest
 * scheduled runs, and the 72h monitor — with no secrets, no raw credentials,
 * and no stack traces. Composes existing surfaces; no parallel truth.
 */

export interface SupportPack {
  funnelId: string;
  activation: { stage: string; readinessScore: number; nextAction: string | null } | null;
  dailyCheck: { status: string; decision: string; nextAction: string; highestSeverity: string | null } | null;
  monitor72h: { launchStatus: string; knownRevenue: number | null; decision: string } | null;
  issues: { id: string; severity: string; source: string; owner: string; status: string; nextAction: string }[];
  latestAuditEvents: { action: string; created_at: string }[];
  latestIntegrationFailures: { provider: string | null; error: string | null; created_at: string }[];
  latestScheduledRuns: { job_type: string; status: string; created_at: string }[];
}

export async function supportPack(tenantId: string, funnelId: string): Promise<SupportPack> {
  const { activationSummary } = await import('../../activation/src/service.js');
  const { dailyCheck } = await import('../../operating-room/src/service.js');
  const { monitor72h } = await import('./live.js');
  const { listIssues } = await import('./issues.js');

  const act = await activationSummary(tenantId, funnelId).catch(() => null);
  const dc = await dailyCheck(tenantId, funnelId).catch(() => null);
  const mon = await monitor72h(tenantId, funnelId).catch(() => null);
  const issues = await listIssues(tenantId).catch(() => []);

  const tail = await withTenant(tenantId, async (c) => {
    const rows = async (sql: string): Promise<any[]> => { try { return (await c.query(sql)).rows; } catch { return []; } };
    return {
      audit: (await rows(`SELECT action, created_at FROM audit_events ORDER BY created_at DESC LIMIT 10`)).map((r: any) => ({ action: r.action, created_at: new Date(r.created_at).toISOString() })),
      integrationFailures: (await rows(`SELECT provider, error, created_at FROM integration_events WHERE processed_status='error' ORDER BY created_at DESC LIMIT 5`)).map((r: any) => ({ provider: r.provider ?? null, error: r.error ? String(r.error).slice(0, 160) : null, created_at: new Date(r.created_at).toISOString() })),
      scheduledRuns: (await rows(`SELECT job_type, status, created_at FROM scheduled_runs ORDER BY created_at DESC LIMIT 5`)).map((r: any) => ({ job_type: r.job_type, status: r.status, created_at: new Date(r.created_at).toISOString() })),
    };
  }).catch(() => ({ audit: [], integrationFailures: [], scheduledRuns: [] }));

  return {
    funnelId,
    activation: act ? { stage: act.stage, readinessScore: act.readinessScore, nextAction: act.nextAction?.nextAction ?? null } : null,
    dailyCheck: dc ? { status: dc.status, decision: dc.decision.decision, nextAction: dc.nextAction, highestSeverity: dc.highestSeverity } : null,
    monitor72h: mon ? { launchStatus: mon.launchStatus, knownRevenue: mon.knownRevenue, decision: mon.decision } : null,
    issues: issues.map((i) => ({ id: i.id, severity: i.severity, source: i.source, owner: i.owner, status: i.status, nextAction: i.nextAction })),
    latestAuditEvents: tail.audit,
    latestIntegrationFailures: tail.integrationFailures,
    latestScheduledRuns: tail.scheduledRuns,
  };
}
