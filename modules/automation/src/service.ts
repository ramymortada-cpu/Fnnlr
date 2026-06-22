import { withTenant } from '../../../packages/db/src/router.js';
import { AutomationEngine } from './engine.js';
import { makeTenantRunStore } from './store.js';
import { makeTenantActionPorts, type ChannelSenders } from './ports.js';
import type { AutomationDef, RunContext } from './types.js';

/**
 * Automation service — the public API surface for the automation module.
 * Save/list/toggle automations, and ingest an event (which fires the engine).
 * Everything is tenant-scoped against the tenant's isolated DB.
 */

export interface SaveAutomationInput {
  businessId?: string | null;
  name: string;
  triggerEvent: string;
  conditions: unknown[];
  actions: unknown[];
  requiresApproval?: boolean;
  maxRunsPerEntity?: number | null;
  cooldownSeconds?: number | null;
  enabled?: boolean;
}

export async function saveAutomation(tenantId: string, input: SaveAutomationInput): Promise<{ id: string }> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `INSERT INTO automations
        (business_id, name, enabled, trigger_event, conditions, actions,
         requires_approval, max_runs_per_entity, cooldown_seconds)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id`,
      [
        input.businessId ?? null,
        input.name,
        input.enabled ?? true,
        input.triggerEvent,
        JSON.stringify(input.conditions ?? []),
        JSON.stringify(input.actions ?? []),
        input.requiresApproval ?? false,
        input.maxRunsPerEntity ?? null,
        input.cooldownSeconds ?? null,
      ],
    );
    return { id: r.rows[0].id };
  });
}

export async function updateAutomation(tenantId: string, id: string, input: Partial<SaveAutomationInput>): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(
      `UPDATE automations SET
         name = COALESCE($2,name),
         enabled = COALESCE($3,enabled),
         trigger_event = COALESCE($4,trigger_event),
         conditions = COALESCE($5,conditions),
         actions = COALESCE($6,actions),
         requires_approval = COALESCE($7,requires_approval),
         max_runs_per_entity = $8,
         cooldown_seconds = $9,
         updated_at = now()
       WHERE id = $1`,
      [
        id, input.name ?? null, input.enabled ?? null, input.triggerEvent ?? null,
        input.conditions ? JSON.stringify(input.conditions) : null,
        input.actions ? JSON.stringify(input.actions) : null,
        input.requiresApproval ?? null,
        input.maxRunsPerEntity ?? null, input.cooldownSeconds ?? null,
      ],
    );
  });
}

export async function listAutomations(tenantId: string): Promise<AutomationDef[]> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM automations WHERE deleted_at IS NULL ORDER BY created_at DESC`);
    return r.rows.map((row) => ({
      id: row.id, businessId: row.business_id, name: row.name, enabled: row.enabled,
      triggerEvent: row.trigger_event, conditions: row.conditions, actions: row.actions,
      requiresApproval: row.requires_approval, maxRunsPerEntity: row.max_runs_per_entity,
      cooldownSeconds: row.cooldown_seconds,
    }));
  });
}

export async function setEnabled(tenantId: string, id: string, enabled: boolean): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE automations SET enabled=$2, updated_at=now() WHERE id=$1`, [id, enabled]);
  });
}

export async function deleteAutomation(tenantId: string, id: string): Promise<void> {
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE automations SET deleted_at=now() WHERE id=$1`, [id]);
  });
}

/**
 * Ingest an event into the tenant's spine AND fire the automation engine.
 * This is the bridge: capture/payment/conversation modules call this, and
 * matching automations start running — all inside the tenant's isolated DB.
 */
export async function ingestEvent(
  tenantId: string,
  ctx: RunContext,
  senders: ChannelSenders,
): Promise<{ started: string[]; skipped: number }> {
  // Persist the event on the spine.
  await withTenant(tenantId, async (c) => {
    await c.query(
      `INSERT INTO events (type, source, payload) VALUES ($1,$2,$3)`,
      [ctx.event.type, ctx.event.payload?.source ?? 'app', JSON.stringify(ctx.event.payload ?? {})],
    );
  });

  // Fire the engine.
  const store = makeTenantRunStore(tenantId);
  const ports = makeTenantActionPorts(tenantId, senders);
  const engine = new AutomationEngine({ store, ports });
  return engine.onEvent(ctx);
}
