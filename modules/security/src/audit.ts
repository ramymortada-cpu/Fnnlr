import type { PoolClient } from 'pg';
import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Lightweight security audit. Writes sensitive events to the tenant's
 * audit_events table so applies, rejects, and credential changes are traceable.
 * Not a SIEM — just enough that a security review can reconstruct what happened.
 * Best-effort: an audit failure must never break the underlying action.
 */

export type AuditAction =
  | 'command_apply' | 'command_discard' | 'command_apply_failed' | 'command_apply_blocked'
  | 'repair_apply' | 'repair_reject'
  | 'playbook_apply' | 'playbook_reject'
  | 'recommendation_apply' | 'recommendation_dismiss'
  | 'integration_credentials_changed' | 'integration_disconnected'
  | 'webhook_rejected' | 'webhook_accepted'
  | 'bulk_action_confirmed'
  | 'execution_config_validated' | 'execution_setup_verified' | 'execution_lock_checked'
  | 'execution_launch_checked' | 'execution_first_signal' | 'execution_decision'
  | 'execution_blocker_found' | 'execution_rollback_used'
  | 'launch_started' | 'first_signal_received' | 'launch_completed' | 'launch_blocked'
  | 'issue_logged' | 'issue_resolved';

/** Write within an existing tenant client (no new connection). */
export async function auditWith(c: PoolClient, actor: string, action: AuditAction, target: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  try {
    await c.query(`INSERT INTO audit_events (actor, action, target, detail) VALUES ($1,$2,$3,$4)`, [actor, action, target, JSON.stringify(detail)]);
  } catch { /* never break the action on an audit failure */ }
}

/** Write in its own tenant scope. */
export async function audit(tenantId: string, actor: string, action: AuditAction, target: string | null, detail: Record<string, unknown> = {}): Promise<void> {
  try { await withTenant(tenantId, (c) => auditWith(c, actor, action, target, detail)); } catch { /* best-effort */ }
}
