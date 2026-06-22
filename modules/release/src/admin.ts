import { getControlPool, withTenant } from '../../../packages/db/src/router.js';

/**
 * Admin / support surface. Minimal, read-only, admin-only. Enough to diagnose a
 * first customer: who exists, is their tenant healthy, what's the latest job /
 * webhook failure / activation / desk summary. Never returns secrets or raw
 * tenant content beyond what support needs to triage.
 */

export async function listWorkspaces(limit = 50) {
  const r = await getControlPool().query(
    `SELECT w.id AS workspace_id, w.name AS workspace_name, t.id AS tenant_id, t.status AS tenant_status, t.display_name, t.created_at
       FROM workspaces w JOIN tenants t ON t.id = w.tenant_id
      ORDER BY t.created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

export async function listTenants(limit = 50) {
  const r = await getControlPool().query(
    `SELECT id, type, status, display_name, created_at FROM tenants ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows;
}

/** Per-tenant diagnostic snapshot — counts + latest failures, no content. */
export async function tenantDiagnostics(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const one = async (sql: string): Promise<any> => { try { return (await c.query(sql)).rows; } catch { return []; } };
    const count = async (sql: string): Promise<number> => { try { return (await c.query(sql)).rows[0]?.n ?? 0; } catch { return 0; } };

    const businesses = await count(`SELECT COUNT(*)::int AS n FROM businesses WHERE deleted_at IS NULL`);
    const funnels = await count(`SELECT COUNT(*)::int AS n FROM journeys WHERE deleted_at IS NULL`);
    const leads = await count(`SELECT COUNT(*)::int AS n FROM leads`);
    const latestRuns = await one(`SELECT job_type, status, error, created_at FROM scheduled_runs ORDER BY created_at DESC LIMIT 5`);
    const webhookFailures = await one(`SELECT provider, error, created_at FROM integration_events WHERE processed_status='error' ORDER BY created_at DESC LIMIT 5`);
    const failedCommands = await one(`SELECT id, intent, status, created_at FROM commands WHERE status IN ('failed') ORDER BY created_at DESC LIMIT 5`);
    const integrations = await one(`SELECT provider, status, last_sync_at FROM integration_connections ORDER BY created_at DESC LIMIT 10`);

    return { businesses, funnels, leads, latestRuns, webhookFailures, failedCommands, integrations };
  });
}

/** Latest activation + desk summary for a tenant's primary funnel (support triage). */
export async function tenantActivationSnapshot(tenantId: string) {
  const fid = await withTenant(tenantId, async (c) => (await c.query(`SELECT id FROM journeys WHERE deleted_at IS NULL ORDER BY created_at LIMIT 1`)).rows[0]?.id ?? null);
  if (!fid) return { funnel: null };
  const { activationSummary } = await import('../../activation/src/service.js');
  const { revenueDeskSummary } = await import('../../revenue-desk/src/service.js');
  const activation = await activationSummary(tenantId, fid).catch(() => null);
  const desk = await revenueDeskSummary(tenantId, fid).catch(() => null);
  return { funnel: fid, activation, desk };
}
