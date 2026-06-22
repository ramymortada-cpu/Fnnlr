import type { PoolClient } from 'pg';
import { withTenant } from '../../../packages/db/src/router.js';
import type { RunStore } from './engine.js';
import type { AutomationDef, RunContext, Action, ConditionNode } from './types.js';

/**
 * Postgres-backed RunStore. Every method runs INSIDE the tenant's own isolated
 * database (via withTenant). The engine never sees a connection string — it
 * only knows a tenantId, and the router binds that to the correct physical DB.
 *
 * Idempotency and dedupe are enforced at the DATABASE level (unique indexes on
 * automation_runs.dedupe_key and automation_step_logs.idempotency_key), so even
 * concurrent workers cannot create duplicate runs or double-send a step.
 */

function rowToDef(r: any): AutomationDef {
  return {
    id: r.id,
    businessId: r.business_id ?? null,
    name: r.name,
    enabled: r.enabled,
    triggerEvent: r.trigger_event,
    conditions: (r.conditions ?? []) as ConditionNode[],
    actions: (r.actions ?? []) as Action[],
    requiresApproval: r.requires_approval,
    maxRunsPerEntity: r.max_runs_per_entity ?? null,
    cooldownSeconds: r.cooldown_seconds ?? null,
  };
}

export function makeTenantRunStore(tenantId: string): RunStore {
  return {
    async getEnabledAutomationsFor(triggerEvent) {
      return withTenant(tenantId, async (c: PoolClient) => {
        const res = await c.query(
          `SELECT * FROM automations
            WHERE enabled = TRUE AND deleted_at IS NULL AND trigger_event = $1`,
          [triggerEvent],
        );
        return res.rows.map(rowToDef);
      });
    },

    async getAutomation(automationId) {
      return withTenant(tenantId, async (c) => {
        const res = await c.query(`SELECT * FROM automations WHERE id = $1`, [automationId]);
        return res.rowCount ? rowToDef(res.rows[0]) : null;
      });
    },

    async getRunHistory(automationId, entityType, entityId) {
      return withTenant(tenantId, async (c) => {
        const res = await c.query(
          `SELECT count(*)::int AS n, max(created_at) AS last
             FROM automation_runs
            WHERE automation_id = $1 AND entity_type = $2 AND entity_id = $3`,
          [automationId, entityType, entityId],
        );
        const row = res.rows[0];
        return {
          runsForEntity: row.n as number,
          lastRunAt: row.last ? new Date(row.last) : null,
        };
      });
    },

    async createRun({ automationId, entityType, entityId, dedupeKey, context }) {
      return withTenant(tenantId, async (c) => {
        // ON CONFLICT DO NOTHING on the unique dedupe_key → returns 0 rows if a
        // run for this exact trigger already exists. This is the DB-level
        // idempotency guarantee.
        const res = await c.query(
          `INSERT INTO automation_runs
             (automation_id, entity_type, entity_id, status, current_step, context, dedupe_key)
           VALUES ($1,$2,$3,'active',0,$4,$5)
           ON CONFLICT (dedupe_key) DO NOTHING
           RETURNING id`,
          [automationId, entityType, entityId, JSON.stringify(context), dedupeKey],
        );
        return res.rowCount ? { id: res.rows[0].id } : null;
      });
    },

    async loadRun(runId) {
      return withTenant(tenantId, async (c) => {
        const res = await c.query(`SELECT * FROM automation_runs WHERE id = $1`, [runId]);
        if (!res.rowCount) return null;
        const r = res.rows[0];
        return {
          id: r.id,
          automationId: r.automation_id,
          currentStep: r.current_step,
          status: r.status,
          context: r.context as RunContext,
        };
      });
    },

    async saveRunProgress(runId, update) {
      return withTenant(tenantId, async (c) => {
        await c.query(
          `UPDATE automation_runs
              SET current_step = $2, status = $3, next_run_at = $4, updated_at = now()
            WHERE id = $1`,
          [runId, update.currentStep, update.status, update.nextRunAt],
        );
      });
    },

    async logStep(input) {
      return withTenant(tenantId, async (c) => {
        // Unique idempotency_key prevents double-logging / double-send of a step.
        await c.query(
          `INSERT INTO automation_step_logs
             (run_id, step_index, action_type, status, detail, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [input.runId, input.stepIndex, input.actionType, input.status,
           input.detail ? JSON.stringify(input.detail) : null,
           input.idempotencyKey ?? null],
        );
      });
    },

    async createApproval(runId, stepIndex, action: Action) {
      return withTenant(tenantId, async (c) => {
        await c.query(
          `INSERT INTO automation_approvals (run_id, step_index, proposed_action, status)
           VALUES ($1,$2,$3,'pending')`,
          [runId, stepIndex, JSON.stringify(action)],
        );
      });
    },
  };
}

/**
 * Find runs whose wait has elapsed (next_run_at <= now) — used by the scheduler.
 * Runs inside the tenant's DB; returns just the run ids to advance.
 */
export async function dueRuns(tenantId: string, limit = 100): Promise<string[]> {
  return withTenant(tenantId, async (c) => {
    const res = await c.query(
      `SELECT id FROM automation_runs
        WHERE status IN ('active','waiting')
          AND next_run_at IS NOT NULL
          AND next_run_at <= now()
        ORDER BY next_run_at ASC
        LIMIT $1`,
      [limit],
    );
    return res.rows.map((r) => r.id as string);
  });
}

/** Approve a pending approval and return the run id to resume. */
export async function approve(tenantId: string, approvalId: string, decidedBy: string): Promise<string | null> {
  return withTenant(tenantId, async (c) => {
    const res = await c.query(
      `UPDATE automation_approvals
          SET status='approved', decided_by=$2, decided_at=now()
        WHERE id=$1 AND status='pending'
        RETURNING run_id`,
      [approvalId, decidedBy],
    );
    return res.rowCount ? (res.rows[0].run_id as string) : null;
  });
}

export async function reject(tenantId: string, approvalId: string, decidedBy: string): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE automation_approvals SET status='rejected', decided_by=$2, decided_at=now()
        WHERE id=$1 AND status='pending'`,
      [approvalId, decidedBy],
    );
    // Cancel the parked run.
    await c.query(
      `UPDATE automation_runs SET status='cancelled', updated_at=now()
        WHERE id = (SELECT run_id FROM automation_approvals WHERE id=$1)`,
      [approvalId],
    );
  });
}
