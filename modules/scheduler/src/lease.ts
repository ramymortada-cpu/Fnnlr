import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Job lease — prevents the same scheduled job from running twice in parallel,
 * and lets a stuck run be safely retried after its lease expires. Built on the
 * existing scheduled_runs unique (job_type, idempotency_key); we add a lease
 * window (lease_expires_at) and a heartbeat.
 *
 * acquireLease returns either a fresh run to execute, or { existing } when an
 * equivalent run is already in flight (the caller should NOT re-run).
 */

const DEFAULT_LEASE_MS = 5 * 60_000; // a run is presumed alive for 5 minutes between heartbeats

export interface LeaseResult {
  acquired: boolean;
  runId: string | null;
  reason?: 'already_running' | 'already_completed';
}

export async function acquireLease(
  tenantId: string,
  jobType: string,
  idempotencyKey: string,
  opts: { targetType?: string; targetId?: string | null; leaseMs?: number; parentRunId?: string | null } = {},
): Promise<LeaseResult> {
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  return withTenant(tenantId, async (c) => {
    // Is there an existing run for this (job_type, idempotency_key)?
    const existing = await c.query(
      `SELECT id, status, lease_expires_at FROM scheduled_runs WHERE job_type=$1 AND idempotency_key=$2`,
      [jobType, idempotencyKey],
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.status === 'completed') return { acquired: false, runId: row.id, reason: 'already_completed' };
      if (row.status === 'running') {
        const leaseAlive = row.lease_expires_at && new Date(row.lease_expires_at).getTime() > Date.now();
        if (leaseAlive) return { acquired: false, runId: row.id, reason: 'already_running' };
        // stuck run — reclaim it (lease expired). Reset to running with a fresh lease.
        const reclaimed = await c.query(
          `UPDATE scheduled_runs SET status='running', started_at=now(), heartbeat_at=now(),
                  lease_expires_at=now() + ($2 || ' milliseconds')::interval, error=NULL
            WHERE id=$1 AND status='running'
              AND (lease_expires_at IS NULL OR lease_expires_at <= now())
          RETURNING id`,
          [row.id, String(leaseMs)],
        );
        if (reclaimed.rowCount) return { acquired: true, runId: row.id };
        return { acquired: false, runId: row.id, reason: 'already_running' }; // someone else reclaimed first
      }
      // failed/skipped → allow a fresh attempt by reusing the row
      const reused = await c.query(
        `UPDATE scheduled_runs SET status='running', started_at=now(), heartbeat_at=now(),
                lease_expires_at=now() + ($2 || ' milliseconds')::interval, error=NULL, parent_run_id=COALESCE($3, parent_run_id)
          WHERE id=$1 RETURNING id`,
        [row.id, String(leaseMs), opts.parentRunId ?? null],
      );
      return { acquired: true, runId: reused.rows[0].id };
    }
    // No existing run — insert one. The unique index protects against a race:
    // a concurrent caller that loses the insert gets a 23505 and we treat it as
    // "already running".
    try {
      const ins = await c.query(
        `INSERT INTO scheduled_runs (job_type, target_type, target_id, status, idempotency_key, started_at, heartbeat_at, lease_expires_at, parent_run_id)
         VALUES ($1,$2,$3,'running',$4, now(), now(), now() + ($5 || ' milliseconds')::interval, $6)
         RETURNING id`,
        [jobType, opts.targetType ?? 'business', opts.targetId ?? null, idempotencyKey, String(leaseMs), opts.parentRunId ?? null],
      );
      return { acquired: true, runId: ins.rows[0].id };
    } catch (e: any) {
      if (e.code === '23505') {
        const again = await c.query(`SELECT id FROM scheduled_runs WHERE job_type=$1 AND idempotency_key=$2`, [jobType, idempotencyKey]);
        return { acquired: false, runId: again.rows[0]?.id ?? null, reason: 'already_running' };
      }
      throw e;
    }
  });
}

export async function heartbeat(tenantId: string, runId: string, leaseMs = DEFAULT_LEASE_MS): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE scheduled_runs SET heartbeat_at=now(), lease_expires_at=now() + ($2 || ' milliseconds')::interval WHERE id=$1`,
      [runId, String(leaseMs)],
    );
  });
}

export async function completeLease(tenantId: string, runId: string, summary: Record<string, unknown> = {}): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE scheduled_runs SET status='completed', finished_at=now(), lease_expires_at=NULL, summary=$2 WHERE id=$1`,
      [runId, JSON.stringify(summary)],
    );
  });
}

export async function failLease(tenantId: string, runId: string, error: string): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE scheduled_runs SET status='failed', finished_at=now(), lease_expires_at=NULL, error=$2 WHERE id=$1`,
      [runId, error.slice(0, 300)],
    );
  });
}
