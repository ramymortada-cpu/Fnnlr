import { withTenant } from '../../../packages/db/src/router.js';
import type { ActionPorts } from './dispatcher.js';
import type { RunContext } from './types.js';

/**
 * Channel senders are injected so the engine never hard-depends on a specific
 * WhatsApp/email provider. In production these wrap the WhatsApp Cloud API (BSP)
 * and an email provider; in tests they're fakes. Sends carry an idempotency key
 * so a retried step never double-sends.
 */
export interface ChannelSenders {
  whatsapp(input: { template: string; leadId: string | null; paid: boolean; idempotencyKey: string; ctx: RunContext }): Promise<void>;
  email(input: { template: string; leadId: string | null; idempotencyKey: string; ctx: RunContext }): Promise<void>;
}

/**
 * Build ActionPorts bound to one tenant's isolated database + channel senders.
 * Data-mutating actions (tasks, lead updates, events, owner notifications) write
 * directly into the tenant DB; sends go through the injected channel layer.
 */
export function makeTenantActionPorts(tenantId: string, senders: ChannelSenders): ActionPorts {
  const leadId = (ctx: RunContext): string | null =>
    ctx.entity.type === 'lead' ? ctx.entity.id : ((ctx.lead?.id as string) ?? null);

  return {
    async sendWhatsApp(template, ctx, paid, idemKey) {
      await senders.whatsapp({ template, leadId: leadId(ctx), paid, idempotencyKey: idemKey, ctx });
    },

    async sendEmail(template, ctx, idemKey) {
      await senders.email({ template, leadId: leadId(ctx), idempotencyKey: idemKey, ctx });
    },

    async createTask(title, ctx, assignTo) {
      await withTenant(tenantId, async (c) => {
        // Tasks live in the tenant DB; surfaced in the seller's queue.
        await c.query(
          `INSERT INTO events (type, source, payload)
           VALUES ('task.created','automation',$1)`,
          [JSON.stringify({ title, assignTo: assignTo ?? null, leadId: leadId(ctx) })],
        );
      });
    },

    async updateLead(set, ctx) {
      const id = leadId(ctx);
      if (!id) return;
      await withTenant(tenantId, async (c) => {
        // Whitelist updatable columns to avoid arbitrary writes from rule JSON.
        const allowed = ['stage', 'intent', 'trust_level', 'risk_score', 'payment_status'];
        const entries = Object.entries(set).filter(([k]) => allowed.includes(k));
        if (entries.length === 0) return;
        const cols = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
        const vals = entries.map(([, v]) => v);
        await c.query(
          `UPDATE leads SET ${cols}, updated_at = now() WHERE id = $1`,
          [id, ...vals],
        );
      });
    },

    async notifyOwner(message, ctx) {
      await withTenant(tenantId, async (c) => {
        await c.query(
          `INSERT INTO events (type, source, payload)
           VALUES ('owner.notification','automation',$1)`,
          [JSON.stringify({ message, leadId: leadId(ctx) })],
        );
      });
    },

    async emitEvent(event, payload, _ctx) {
      await withTenant(tenantId, async (c) => {
        await c.query(
          `INSERT INTO events (type, source, payload) VALUES ($1,'automation',$2)`,
          [event, JSON.stringify(payload ?? {})],
        );
      });
    },
  };
}
