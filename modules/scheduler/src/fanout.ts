import { withTenant, getControlPool } from '../../../packages/db/src/router.js';

/**
 * Scheduled fan-out. Runs a per-target job across many businesses (one tenant)
 * or many tenants (control-plane), in bounded batches with a concurrency cap.
 * A failure in one target NEVER stops the rest; the parent batch record
 * summarises succeeded/failed/skipped. No unbounded "run everything at once".
 */

export interface FanOutConfig {
  batchSize?: number;       // targets per batch (default 25)
  maxConcurrent?: number;   // concurrent jobs within a batch (default 5)
}

export interface FanOutResult {
  batchId: string | null;
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: { targetId: string; status: 'ok' | 'failed' | 'skipped'; error?: string }[];
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

/**
 * Fan a job out across all active businesses in ONE tenant. Writes a parent
 * batch row, then runs each business's job; a failing business is recorded and
 * skipped over, not fatal.
 */
export async function fanOutBusinesses(
  tenantId: string,
  jobType: string,
  idempotencyKey: string,
  perBusiness: (tenantId: string, businessId: string) => Promise<unknown>,
  cfg: FanOutConfig = {},
): Promise<FanOutResult> {
  const batchSize = cfg.batchSize ?? 25;
  const maxConcurrent = cfg.maxConcurrent ?? 5;

  const businesses = await withTenant(tenantId, async (c) =>
    (await c.query(`SELECT id FROM businesses WHERE deleted_at IS NULL ORDER BY created_at`)).rows.map((r: any) => r.id as string));

  // parent batch (idempotent — a re-run with the same key returns the existing batch)
  const batchId = await withTenant(tenantId, async (c) => {
    try {
      const r = await c.query(
        `INSERT INTO scheduled_run_batches (job_type, idempotency_key, total_targets, status)
         VALUES ($1,$2,$3,'running') RETURNING id`,
        [jobType, idempotencyKey, businesses.length]);
      return r.rows[0].id as string;
    } catch (e: any) {
      if (e.code === '23505') {
        const existing = await c.query(`SELECT id FROM scheduled_run_batches WHERE job_type=$1 AND idempotency_key=$2`, [jobType, idempotencyKey]);
        return existing.rows[0]?.id as string;
      }
      throw e;
    }
  });

  const results: FanOutResult['results'] = [];
  let succeeded = 0, failed = 0, skipped = 0;

  for (let start = 0; start < businesses.length; start += batchSize) {
    const batch = businesses.slice(start, start + batchSize);
    await runWithConcurrency(batch, maxConcurrent, async (businessId) => {
      try {
        const out = await perBusiness(tenantId, businessId) as any;
        if (out && out.skipped) { skipped++; results.push({ targetId: businessId, status: 'skipped' }); }
        else { succeeded++; results.push({ targetId: businessId, status: 'ok' }); }
      } catch (e: any) {
        failed++; // failure isolation: record + continue
        results.push({ targetId: businessId, status: 'failed', error: String(e?.message ?? e).slice(0, 200) });
      }
    });
  }

  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE scheduled_run_batches SET succeeded=$2, failed=$3, skipped=$4,
              status=$5, finished_at=now() WHERE id=$1`,
      [batchId, succeeded, failed, skipped, failed > 0 ? 'completed_with_errors' : 'completed']);
  });

  return { batchId, total: businesses.length, succeeded, failed, skipped, results };
}

/** List active tenants from the control-plane (for cross-tenant fan-out). */
export async function listActiveTenants(limit = 1000): Promise<string[]> {
  const r = await getControlPool().query(`SELECT id FROM tenants WHERE status='active' ORDER BY created_at LIMIT $1`, [limit]);
  return r.rows.map((x: any) => x.id as string);
}

/**
 * Fan a job out across MANY tenants. Each tenant is isolated: a failure is
 * recorded and the rest proceed. Returns a per-tenant summary.
 */
export async function fanOutTenants(
  jobType: string,
  perTenant: (tenantId: string) => Promise<unknown>,
  cfg: FanOutConfig = {},
): Promise<FanOutResult> {
  const batchSize = cfg.batchSize ?? 25;
  const maxConcurrent = cfg.maxConcurrent ?? 5;
  const tenants = await listActiveTenants();

  const results: FanOutResult['results'] = [];
  let succeeded = 0, failed = 0, skipped = 0;
  for (let start = 0; start < tenants.length; start += batchSize) {
    const batch = tenants.slice(start, start + batchSize);
    await runWithConcurrency(batch, maxConcurrent, async (tenantId) => {
      try { await perTenant(tenantId); succeeded++; results.push({ targetId: tenantId, status: 'ok' }); }
      catch (e: any) { failed++; results.push({ targetId: tenantId, status: 'failed', error: String(e?.message ?? e).slice(0, 200) }); }
    });
  }
  return { batchId: null, total: tenants.length, succeeded, failed, skipped, results };
}
