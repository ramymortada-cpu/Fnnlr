import { withTenant } from '../../../packages/db/src/router.js';
import { computeServiceWindow, windowHint } from './service-window.js';
import { draftReply } from '../../whatsapp/src/service.js';

/**
 * Real-time read models: the live activity feed, the conversation inbox, and the
 * "suggest a reply from the latest inbound message" copilot entry point. All
 * read/suggest only — nothing is sent.
 */

const FEED_TYPES = [
  'whatsapp_message_received', 'payment_confirmed', 'payment_failed', 'payment_state_changed',
  'lead_created', 'deal_won', 'action_created', 'conversation_updated', 'payment_event_unmatched',
  'whatsapp_reply_marked_sent', 'leak_updated',
];

/** Live revenue feed for a funnel (recent domain events). */
export async function getActivityFeed(tenantId: string, journeyId: string, limit = 30) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT id, type, payload, created_at FROM events
        WHERE type = ANY($1) ORDER BY created_at DESC LIMIT $2`, [FEED_TYPES, limit]);
    return r.rows.map((row: any) => ({
      id: row.id, type: row.type, at: row.created_at,
      leadId: row.payload?.leadId ?? null, payload: row.payload ?? {},
    }));
  });
}

/** Conversation inbox for a lead: messages + service-window status + a suggestion hook. */
export async function getConversation(tenantId: string, leadId: string) {
  return withTenant(tenantId, async (c) => {
    const conv = await c.query(`SELECT * FROM conversations WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1`, [leadId]);
    if (!conv.rowCount) return { messages: [], serviceWindow: { status: 'unknown', hint: '' }, conversation: null };
    const cv = conv.rows[0];
    const msgs = await c.query(`SELECT direction, body, created_at FROM conversation_messages WHERE conversation_id=$1 ORDER BY created_at ASC`, [cv.id]);
    const sw = computeServiceWindow(cv.last_inbound_at ? new Date(cv.last_inbound_at) : null);
    return {
      conversation: { id: cv.id, status: cv.status, lastMessage: cv.last_message, lastInboundAt: cv.last_inbound_at, lastOutboundAt: cv.last_outbound_at },
      messages: msgs.rows,
      serviceWindow: { status: sw.status, expiresAt: sw.expiresAt, hoursLeft: sw.hoursLeft, hint: windowHint(sw.status, sw.hoursLeft) },
    };
  });
}

/** Add a private note to a lead's conversation. */
export async function addConversationNote(tenantId: string, leadId: string, note: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE conversations SET note=$2 WHERE lead_id=$1`, [leadId, note]);
    return { ok: true };
  });
}

/** Suggest a reply based on the latest inbound message (copilot; never sends). */
export async function suggestFromInbound(tenantId: string, leadId: string) {
  const ctx = await withTenant(tenantId, async (c) => {
    const conv = await c.query(`SELECT id, last_inbound_at FROM conversations WHERE lead_id=$1 ORDER BY created_at DESC LIMIT 1`, [leadId]);
    if (!conv.rowCount) return null;
    const last = await c.query(`SELECT body FROM conversation_messages WHERE conversation_id=$1 AND direction='inbound' ORDER BY created_at DESC LIMIT 1`, [conv.rows[0].id]);
    return { lastInbound: last.rows[0]?.body ?? null, lastInboundAt: conv.rows[0].last_inbound_at };
  });
  if (!ctx) return { needsConversation: true };

  // simple objection detection from the inbound text
  const text = (ctx.lastInbound ?? '').toLowerCase();
  let objectionKey: string | undefined;
  if (text.includes('غالي') || text.includes('سعر') || text.includes('تخفيض')) objectionKey = 'price_high';
  else if (text.includes('بفكر') || text.includes('هرجعلك') || text.includes('بعدين')) objectionKey = 'thinking';
  else if (text.includes('مش متأكد') || text.includes('ثقة') || text.includes('نصب')) objectionKey = 'trust';

  const draft = await draftReply(tenantId, leadId, { objectionKey }).catch(() => null) as any;
  const sw = computeServiceWindow(ctx.lastInboundAt ? new Date(ctx.lastInboundAt) : null);
  return {
    suggestion: draft?.template?.body ?? 'محتاج تولّد WhatsApp flow الأول.',
    stepType: draft?.stepType ?? null,
    detectedObjection: objectionKey ?? null,
    serviceWindow: { status: sw.status, hint: windowHint(sw.status, sw.hoursLeft) },
  };
}

/** Recent integration events for a connection (status, mapping, matched). */
export async function getIntegrationEvents(tenantId: string, connectionId: string, limit = 30) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT id, provider, event_type, mapped_event_type, processed_status, matched_lead_id, error, created_at
         FROM integration_events WHERE connection_id=$1 ORDER BY created_at DESC LIMIT $2`, [connectionId, limit]);
    return r.rows;
  });
}
