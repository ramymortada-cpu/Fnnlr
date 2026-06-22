import { withTenant } from '../../../packages/db/src/router.js';
import { audit, type AuditAction } from '../../security/src/audit.js';

/**
 * Execution log — lightweight traceability for the Customer Zero launch, written
 * to the existing audit_events table (no new workflow system, no parallel
 * truth). Records the milestones: config validated, setup verified, lock
 * checked, first signal, decision, blocker, rollback used. Details are safe
 * (no secrets).
 */

export type ExecutionEvent =
  | 'execution_config_validated' | 'execution_setup_verified' | 'execution_lock_checked'
  | 'execution_launch_checked' | 'execution_first_signal' | 'execution_decision'
  | 'execution_blocker_found' | 'execution_rollback_used'
  | 'launch_started' | 'first_signal_received' | 'launch_completed' | 'launch_blocked'
  | 'issue_logged' | 'issue_resolved';

export async function logExecution(tenantId: string, actor: string, event: ExecutionEvent, detail: Record<string, unknown> = {}): Promise<void> {
  // detail is caller-supplied; callers must not pass secrets. We do not echo env.
  await audit(tenantId, actor, event as AuditAction, null, detail);
}

export async function readExecutionLog(tenantId: string, limit = 50): Promise<{ action: string; detail: any; created_at: string }[]> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT action, detail, created_at FROM audit_events
        WHERE action LIKE 'execution_%' OR action LIKE 'launch_%' OR action='first_signal_received'
        ORDER BY created_at DESC LIMIT $1`, [limit]);
    return r.rows.map((x: any) => ({ action: x.action, detail: x.detail, created_at: new Date(x.created_at).toISOString() }));
  });
}
