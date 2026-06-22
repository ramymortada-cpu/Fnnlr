import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Synthetic trigger detector.
 *
 * Some of the strongest automations fire on the ABSENCE of activity:
 *   - message.no_reply       — a thread got a reply request but went quiet
 *   - payment.stalled        — transfer requested, no proof after a threshold
 *   - conversation.stalled   — a mid-sale thread went silent
 *
 * These aren't emitted by a user action, so the scheduler synthesizes them by
 * scanning the tenant DB for the time-based conditions and emitting events the
 * AutomationEngine then reacts to. Runs entirely inside the tenant's DB.
 */

export interface SyntheticEvent {
  type: 'message.no_reply' | 'payment.stalled' | 'conversation.stalled';
  entityType: 'lead' | 'conversation' | 'payment';
  entityId: string;
  payload: Record<string, unknown>;
}

export async function detectSyntheticTriggers(
  tenantId: string,
  opts: { noReplySeconds?: number; paymentStallSeconds?: number; convoStallSeconds?: number } = {},
): Promise<SyntheticEvent[]> {
  const noReply = opts.noReplySeconds ?? 3600;
  const payStall = opts.paymentStallSeconds ?? 7200;
  const convoStall = opts.convoStallSeconds ?? 86400;

  return withTenant(tenantId, async (c) => {
    const out: SyntheticEvent[] = [];

    // payment.stalled: transfer requested, no proof, older than threshold,
    // and not already emitted (avoid duplicate synthetic events via events table).
    const stalledPay = await c.query(
      `SELECT ps.lead_id, ps.id AS payment_id
         FROM payment_states ps
        WHERE ps.state = 'transfer_requested'
          AND ps.proof_url IS NULL
          AND ps.updated_at <= now() - ($1 || ' seconds')::interval
          AND NOT EXISTS (
            SELECT 1 FROM events e
             WHERE e.type = 'payment.stalled'
               AND e.payload->>'paymentId' = ps.id::text
          )`,
      [payStall],
    );
    for (const r of stalledPay.rows) {
      out.push({
        type: 'payment.stalled', entityType: 'lead', entityId: r.lead_id,
        payload: { paymentId: r.payment_id, state: 'transfer_requested' },
      });
    }

    // conversation.stalled: a conversation with no message after threshold,
    // tied to an active (non-closed) lead.
    const stalledConvo = await c.query(
      `SELECT cv.id AS conversation_id, cv.lead_id
         FROM conversations cv
        WHERE cv.deleted_at IS NULL
          AND cv.updated_at <= now() - ($1 || ' seconds')::interval
          AND NOT EXISTS (
            SELECT 1 FROM messages m
             WHERE m.conversation_id = cv.id
               AND m.occurred_at > cv.updated_at
          )
          AND NOT EXISTS (
            SELECT 1 FROM events e
             WHERE e.type = 'conversation.stalled'
               AND e.payload->>'conversationId' = cv.id::text
          )`,
      [convoStall],
    );
    for (const r of stalledConvo.rows) {
      out.push({
        type: 'conversation.stalled',
        entityType: 'lead',
        entityId: r.lead_id ?? r.conversation_id,
        payload: { conversationId: r.conversation_id },
      });
    }

    // Record that we emitted these, so we don't re-emit next tick.
    for (const ev of out) {
      await c.query(
        `INSERT INTO events (type, source, payload) VALUES ($1,'synthetic',$2)`,
        [ev.type, JSON.stringify(ev.payload)],
      );
    }
    return out;
  });
}
