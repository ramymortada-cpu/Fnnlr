/**
 * Rollback plan — PURE description of the safe rollback steps, plus a guard that
 * a rollback NEVER drops a tenant database by default. Destructive actions
 * (restore from backup, drop) require an explicit, separate confirmation and are
 * never part of the default path.
 */

export interface RollbackStep {
  order: number;
  action: string;
  destructive: boolean;
  detail: string;
}

export const ROLLBACK_PLAN: RollbackStep[] = [
  { order: 1, action: 'stop_jobs', destructive: false, detail: 'Set FNNLR_DISABLE_JOBS=true so cron endpoints return 503.' },
  { order: 2, action: 'disable_outbound_retries', destructive: false, detail: 'Pause outbound webhook retries (do not delete deliveries).' },
  { order: 3, action: 'pause_integrations', destructive: false, detail: 'Mark affected connections paused; inbound is rejected safely, not lost.' },
  { order: 4, action: 'rollback_app_version', destructive: false, detail: 'Redeploy the previous known-good app version. DB is preserved.' },
  { order: 5, action: 'preserve_db', destructive: false, detail: 'Do NOT drop or truncate any database. Tenant DBs are preserved.' },
  { order: 6, action: 'restore_from_backup_if_corruption', destructive: true, detail: 'ONLY on confirmed data corruption, with explicit approval: restore from a verified backup. Never the default.' },
  { order: 7, action: 'record_rollback', destructive: false, detail: 'Record the rollback in audit/ops with reason + who approved.' },
];

export interface RollbackRequest {
  reason: string;
  confirmDestructive?: boolean;   // must be explicitly true to allow step 6
}

export interface RollbackDecision {
  steps: RollbackStep[];
  includesDestructive: boolean;
  refusedDestructive: boolean;
  note: string;
}

/**
 * Plan a rollback. By default it returns ONLY the non-destructive steps. A
 * destructive restore is included only when explicitly confirmed — and dropping
 * a tenant DB is never included at all.
 */
export function planRollback(req: RollbackRequest): RollbackDecision {
  const nonDestructive = ROLLBACK_PLAN.filter((s) => !s.destructive);
  if (req.confirmDestructive) {
    return {
      steps: ROLLBACK_PLAN,            // includes restore-from-backup, but NOT a drop (none exists in the plan)
      includesDestructive: true,
      refusedDestructive: false,
      note: 'Destructive restore included by explicit confirmation. No database is dropped — restore only.',
    };
  }
  return {
    steps: nonDestructive,
    includesDestructive: false,
    refusedDestructive: true,
    note: 'Default rollback is non-destructive: jobs stopped, retries paused, integrations paused, app rolled back, DB preserved. No restore, no drop.',
  };
}

/** Guard used by tests/CI: no step's ACTION performs a tenant-DB drop/truncate. */
export function planNeverDropsTenantDb(): boolean {
  // check the action verb only — the human-readable detail intentionally says
  // "do NOT drop", which is honesty, not an operation.
  return !ROLLBACK_PLAN.some((s) => /^(drop|truncate|delete_database)/i.test(s.action));
}
