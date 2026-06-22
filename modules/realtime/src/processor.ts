import { withTenant } from '../../../packages/db/src/router.js';
import { computeServiceWindow, SERVICE_WINDOW_HOURS } from './service-window.js';
import { refreshActions } from '../../actions/src/service.js';
import { dispatchOutbound } from './outbound.js';

/**
 * Real-time event processor — turns a normalized integration event into live
 * operations: state update → action → diagnosis input. Deliberately lightweight
 * and synchronous (no queue), but isolated so a queue can wrap it later.
 *
 * Never sends anything. Never auto-replies. Only captures, structures, suggests.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'realtime',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/** Mark a funnel's leak findings stale so the next view re-diagnoses (cheap). */
async function markLeaksStale(c: any, journeyId: string) {
  await c.query(`UPDATE leak_findings SET stale=TRUE WHERE journey_id=$1 AND status IN ('open','fixing')`, [journeyId]).catch(() => {});
}

export interface InboundWhatsApp {
  connectionId: string;
  fromPhone: string;
  text: string | null;
  externalId?: string | null;
}

/**
 * WhatsApp inbound enrichment: find/create conversation + lead, open the 24h
 * service window, store the message, update timings, generate actions. No reply.
 */
export async function processWhatsAppInbound(tenantId: string, ev: InboundWhatsApp) {
  return withTenant(tenantId, async (c) => {
    const conn = await c.query(`SELECT journey_id FROM integration_connections WHERE id=$1`, [ev.connectionId]);
    const journeyId = conn.rows[0]?.journey_id ?? null;

    // find a lead by phone; otherwise create a light lead (inbound-first)
    let lead = await c.query(`SELECT id, funnel_id, stage FROM leads WHERE phone=$1 ORDER BY created_at DESC LIMIT 1`, [ev.fromPhone]);
    let leadId: string, leadFunnel: string | null, stage: string | null;
    if (lead.rowCount) {
      leadId = lead.rows[0].id; leadFunnel = lead.rows[0].funnel_id; stage = lead.rows[0].stage;
    } else {
      const biz = (await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`)).rows[0]?.id;
      const created = await c.query(
        `INSERT INTO leads (business_id, funnel_id, name, phone, source, stage, first_touch_at, last_touch_at)
         VALUES ($1,$2,$3,$4,'whatsapp_inbound','contacted', now(), now()) RETURNING id, funnel_id, stage`,
        [biz, journeyId, ev.fromPhone, ev.fromPhone]);
      leadId = created.rows[0].id; leadFunnel = created.rows[0].funnel_id; stage = created.rows[0].stage;
      await emit(c, 'lead_created', { leadId, via: 'whatsapp_inbound' });
    }
    const fid = leadFunnel ?? journeyId;

    // find/create conversation
    let conv = await c.query(`SELECT id FROM conversations WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1`, [leadId]);
    let convId: string;
    if (conv.rowCount) convId = conv.rows[0].id;
    else {
      const biz = (await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`)).rows[0]?.id;
      const cc = await c.query(
        `INSERT INTO conversations (business_id, lead_id, funnel_id, channel, status, first_event_at, last_event_at)
         VALUES ($1,$2,$3,'whatsapp','active', now(), now()) RETURNING id`, [biz, leadId, fid]);
      convId = cc.rows[0].id;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + SERVICE_WINDOW_HOURS * 3600_000);

    // store the inbound message (idempotent on provider message id — a redelivered
    // webhook for the same message must not double-insert)
    const msgIns = await c.query(
      `INSERT INTO conversation_messages (conversation_id, lead_id, direction, body, external_id) VALUES ($1,$2,'inbound',$3,$4)
       ON CONFLICT (conversation_id, external_id) WHERE external_id IS NOT NULL DO NOTHING RETURNING id`,
      [convId, leadId, ev.text ?? '(رسالة)', ev.externalId ?? null]);
    const duplicateMessage = ev.externalId && msgIns.rowCount === 0;

    // update conversation: last message + open service window
    await c.query(
      `UPDATE conversations SET last_message=$2, last_event_at=now(), last_inbound_at=now(), status='active',
         service_window_opened_at=now(), service_window_expires_at=$3 WHERE id=$1`,
      [convId, ev.text ?? '(رسالة)', expiresAt.toISOString()]);

    // update lead inbound timing; nudge whatsapp_clicked → contacted
    await c.query(`UPDATE leads SET last_inbound_at=now(), last_touch_at=now(),
        stage = CASE WHEN stage='whatsapp_clicked' THEN 'contacted' ELSE stage END WHERE id=$1`, [leadId]);

    await emit(c, 'whatsapp_message_received', { leadId, convId });
    await emit(c, 'conversation_updated', { convId });
    await emit(c, 'lead_inbound_message_received', { leadId });

    // real-time actions + leak staleness
    if (fid) { await markLeaksStale(c, fid); }

    return { leadId, conversationId: convId, funnelId: fid, serviceWindowExpiresAt: expiresAt.toISOString() };
  }).then(async (r) => {
    // refresh actions outside the first tx scope (separate withTenant inside)
    if (r.funnelId) await refreshActions(tenantId, r.funnelId).catch(() => {});
    // outbound dispatch for lead/inbound events (configured webhooks only)
    await dispatchOutbound(tenantId, 'whatsapp_clicked', { leadId: r.leadId }).catch(() => {});
    return r;
  });
}

export interface PaymentEvent {
  connectionId: string;
  provider: string;
  status: 'payment_started' | 'payment_failed' | 'payment_confirmed' | 'payment_refunded' | 'unknown';
  reference: string | null;
  amount: number | null;
  externalId: string | null;
}

const STATE_FOR: Record<string, string> = {
  payment_started: 'waiting_payment', payment_confirmed: 'confirmed', payment_failed: 'failed', payment_refunded: 'refunded',
};

/**
 * Payment webhook enrichment: match a lead by reference, update payment_state +
 * history, advance/repair stage, and generate the right action. Unmatched events
 * are stored + raise an admin action, never corrupting data.
 */
export async function processPaymentEvent(tenantId: string, ev: PaymentEvent): Promise<{ matched: boolean; leadId?: string; action?: string }> {
  const outcome = await withTenant(tenantId, async (c) => {
    const conn = await c.query(`SELECT journey_id FROM integration_connections WHERE id=$1`, [ev.connectionId]);
    const journeyId = conn.rows[0]?.journey_id ?? null;

    let leadId: string | null = null;
    if (ev.reference) {
      const lead = await c.query(`SELECT id, funnel_id FROM leads WHERE id::text=$1 LIMIT 1`, [String(ev.reference)]).catch(() => ({ rowCount: 0, rows: [] as any[] }));
      if (lead.rowCount) leadId = lead.rows[0].id;
    }

    if (!leadId) {
      // unmatched → raise an admin action, do NOT touch any lead/payment
      if (journeyId) {
        await c.query(
          `INSERT INTO action_items (journey_id, type, title, explanation, priority, recommended_action, target_route, evidence, code, status)
           VALUES ($1,'confirm_payment','حدث دفع غير مطابق','وصل حدث دفع من البوابة ومش متطابق مع عميل — راجِع الربط.',70,'راجِع التكاملات والأحداث','leaks',$2,$3,'open')
           ON CONFLICT DO NOTHING`,
          [journeyId, JSON.stringify({ provider: ev.provider, externalId: ev.externalId }), `unmatched_payment:${ev.externalId ?? Date.now()}`]).catch(() => {});
      }
      await emit(c, 'payment_event_unmatched', { provider: ev.provider, externalId: ev.externalId });
      return { matched: false, journeyId };
    }

    const toState = STATE_FOR[ev.status];
    if (toState) {
      const cur = await c.query(`SELECT id, state FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId]);
      const fromState = cur.rows[0]?.state ?? 'not_started';
      if (cur.rowCount) await c.query(`UPDATE payment_states SET state=$2, updated_at=now() WHERE id=$1`, [cur.rows[0].id, toState]);
      else await c.query(`INSERT INTO payment_states (lead_id, state) VALUES ($1,$2)`, [leadId, toState]);
      await c.query(`INSERT INTO payment_state_history (lead_id, from_state, to_state) VALUES ($1,$2,$3)`, [leadId, fromState, toState]);
      await c.query(`UPDATE leads SET payment_status=$2, last_touch_at=now() WHERE id=$1`, [leadId, toState]);
      await emit(c, 'payment_state_changed', { leadId, toState, via: 'webhook' });
    }

    let action: string | undefined;
    const fid = (await c.query(`SELECT funnel_id FROM leads WHERE id=$1`, [leadId])).rows[0]?.funnel_id ?? journeyId;
    if (ev.status === 'payment_confirmed') {
      await c.query(`UPDATE leads SET stage=CASE WHEN stage NOT IN ('access_delivered') THEN 'paid' ELSE stage END WHERE id=$1`, [leadId]);
      action = 'deliver_access';
      await emit(c, 'payment_confirmed', { leadId });
      await emit(c, 'deal_won', { leadId });
    } else if (ev.status === 'payment_failed') {
      action = 'payment_recovery';
      await emit(c, 'payment_failed', { leadId });
    }
    if (fid) await markLeaksStale(c, fid);
    return { matched: true, leadId, action, journeyId: fid };
  });

  // refresh actions + outbound dispatch (separate scopes)
  if (outcome.journeyId) await refreshActions(tenantId, outcome.journeyId).catch(() => {});
  if (outcome.matched && outcome.leadId) {
    if (outcome.action === 'deliver_access') await dispatchOutbound(tenantId, 'payment_confirmed', { leadId: outcome.leadId }).catch(() => {});
  }
  return { matched: outcome.matched, leadId: outcome.leadId ?? undefined, action: outcome.action };
}
