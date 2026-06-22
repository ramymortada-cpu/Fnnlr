import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Operational observability — small, read-only summaries for scale. Not a
 * dashboard; just enough to answer "are jobs running, are retries piling up,
 * is ingestion flowing, are webhooks failing?" Admin/internal only.
 */

export async function opsStatus(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const runs = (await c.query(
      `SELECT status, COUNT(*)::int AS n,
              AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::int AS avg_secs
         FROM scheduled_runs WHERE created_at > now() - INTERVAL '24 hours' GROUP BY status`)).rows;
    const batches = (await c.query(
      `SELECT status, COUNT(*)::int AS n, COALESCE(SUM(failed),0)::int AS failed
         FROM scheduled_run_batches WHERE created_at > now() - INTERVAL '24 hours' GROUP BY status`)).rows;
    const stuck = (await c.query(
      `SELECT COUNT(*)::int AS n FROM scheduled_runs
        WHERE status='running' AND lease_expires_at IS NOT NULL AND lease_expires_at < now()`)).rows[0].n;
    return { runs24h: runs, batches24h: batches, stuckRuns: stuck };
  });
}

export async function opsRetries(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const byStatus = (await c.query(`SELECT status, COUNT(*)::int AS n FROM webhook_deliveries GROUP BY status`)).rows;
    const dueNow = (await c.query(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status='retrying' AND next_retry_at <= now()`)).rows[0].n;
    const abandoned24h = (await c.query(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status='abandoned' AND created_at > now() - INTERVAL '24 hours'`)).rows[0].n;
    return { deliveriesByStatus: byStatus, dueNow, abandoned24h };
  });
}

export async function opsIngestion(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const events1h = (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE created_at > now() - INTERVAL '1 hour'`)).rows[0].n;
    const errors1h = (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE processed_status='error' AND created_at > now() - INTERVAL '1 hour'`)).rows[0].n;
    const pageEvents1h = (await c.query(`SELECT COUNT(*)::int AS n FROM page_events WHERE occurred_at > now() - INTERVAL '1 hour'`)).rows[0].n;
    const unmatched1h = (await c.query(`SELECT COUNT(*)::int AS n FROM integration_events WHERE processed_status='unmatched' AND created_at > now() - INTERVAL '1 hour'`)).rows[0].n;
    return { integrationEvents1h: events1h, ingestionErrors1h: errors1h, pageEvents1h, unmatched1h };
  });
}

export async function opsQueues(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const running = (await c.query(`SELECT COUNT(*)::int AS n FROM scheduled_runs WHERE status='running'`)).rows[0].n;
    const retrying = (await c.query(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status='retrying'`)).rows[0].n;
    return { runningJobs: running, retryingDeliveries: retrying };
  });
}
