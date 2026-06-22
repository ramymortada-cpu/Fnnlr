import crypto from 'node:crypto';
import { withTenant } from '../../../packages/db/src/router.js';
import { registerPublicCode, unregisterPublicCode } from './resolver.js';

/**
 * Capture — turns WhatsApp from a black hole into observable funnel data.
 * Tracked links carry UTM attribution; a click creates/links a Lead +
 * Conversation, emits the capture events, preserves source, and returns the
 * WhatsApp destination to redirect to. Inactive links never redirect.
 */

export interface TrackedLinkInput {
  journeyId?: string;
  pageId?: string;
  destinationPhone?: string;   // raw phone, e.g. 2010xxxxxxx
  destination?: string;        // full wa.me url (derived from phone if absent)
  messageTemplate?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  ctaLabel?: string;
}

function waUrl(phone?: string, text?: string): string {
  const p = (phone || '').replace(/[^\d]/g, '');
  const q = text ? `?text=${encodeURIComponent(text)}` : '';
  return `https://wa.me/${p}${q}`;
}

export async function createTrackedLink(tenantId: string, input: TrackedLinkInput): Promise<{ code: string; url: string }> {
  const code = crypto.randomBytes(5).toString('hex');
  const destination = input.destination || waUrl(input.destinationPhone, input.messageTemplate);
  await withTenant(tenantId, async (c) => {
    await c.query(
      `INSERT INTO tracked_links
        (code, journey_id, page_id, destination, destination_phone, message_template,
         source, medium, campaign, content, term, cta_label, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)`,
      [code, input.journeyId ?? null, input.pageId ?? null, destination,
       input.destinationPhone ?? null, input.messageTemplate ?? null,
       input.source ?? null, input.medium ?? null, input.campaign ?? null,
       input.content ?? null, input.term ?? null, input.ctaLabel ?? null],
    );
  });
  // Register in the control-plane so /r/:code resolves the tenant with no header.
  await registerPublicCode(code, 'link', tenantId);
  return { code, url: `/r/${code}` };
}

export async function listTrackedLinks(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM tracked_links WHERE journey_id=$1 ORDER BY created_at DESC`, [journeyId]);
    return r.rows;
  });
}

export async function updateTrackedLink(tenantId: string, linkId: string, patch: Record<string, unknown>) {
  await withTenant(tenantId, async (c) => {
    const allowed = ['destination', 'destination_phone', 'message_template', 'source', 'medium', 'campaign', 'content', 'term', 'cta_label', 'active'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE tracked_links SET ${cols} WHERE id=$1`, [linkId, ...entries.map(([, v]) => v)]);
  });
}

export async function deleteTrackedLink(tenantId: string, linkId: string) {
  const code = await withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT code FROM tracked_links WHERE id=$1`, [linkId]);
    await c.query(`DELETE FROM tracked_links WHERE id=$1`, [linkId]);
    return r.rows[0]?.code as string | undefined;
  });
  if (code) await unregisterPublicCode(code);
}

/**
 * Handle a tracked-link click: rejects inactive links, creates a Lead +
 * Conversation with full attribution, emits the four capture events, and
 * returns the WhatsApp destination. Returns null if the link is missing/inactive.
 */
export async function handleTrackedClick(
  tenantId: string,
  code: string,
): Promise<{ destination: string; leadId: string; conversationId: string; leadIsNew: boolean } | null> {
  return withTenant(tenantId, async (c) => {
    const link = await c.query(`SELECT * FROM tracked_links WHERE code=$1`, [code]);
    if (!link.rowCount) return null;
    const l = link.rows[0];
    if (l.active === false) return null;   // inactive links never redirect

    let businessId: string | null = null;
    if (l.journey_id) {
      const j = await c.query(`SELECT business_id FROM journeys WHERE id=$1`, [l.journey_id]);
      businessId = j.rows[0]?.business_id ?? null;
    }
    if (!businessId) {
      const b = await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`);
      businessId = b.rows[0]?.id ?? null;
    }

    const attribution = { source: l.source, medium: l.medium, campaign: l.campaign, content: l.content, term: l.term, code };

    const lead = await c.query(
      `INSERT INTO leads
        (business_id, source, medium, campaign, content, term, attribution, stage, funnel_id,
         link_code, first_touch_at, last_touch_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'whatsapp_clicked',$8,$9, now(), now()) RETURNING id`,
      [businessId, l.source ?? 'tracked_link', l.medium, l.campaign, l.content, l.term,
       JSON.stringify(attribution), l.journey_id, code],
    );
    const leadId = lead.rows[0].id as string;

    const conv = await c.query(
      `INSERT INTO conversations
        (business_id, lead_id, funnel_id, channel, source_link_code, first_event_at, last_event_at)
       VALUES ($1,$2,$3,'whatsapp',$4, now(), now()) RETURNING id`,
      [businessId, leadId, l.journey_id, code],
    );
    const conversationId = conv.rows[0].id as string;

    await c.query(`UPDATE tracked_links SET clicks = clicks + 1 WHERE id=$1`, [l.id]);

    for (const [type, payload] of [
      ['tracked_link_clicked', { code, source: l.source, campaign: l.campaign }],
      ['whatsapp_clicked', { code, leadId, conversationId }],
      ['lead_created', { leadId, source: l.source, attribution }],
      ['conversation_created', { conversationId, leadId }],
    ] as const) {
      await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'capture',$2)`, [type, JSON.stringify(payload)]);
    }

    return { destination: l.destination, leadId, conversationId, leadIsNew: true };
  });
}

/** Recent clicks for the Capture timeline. */
export async function recentClicks(tenantId: string, journeyId: string, limit = 20) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT le.id AS lead_id, le.source, le.campaign, le.medium, le.created_at,
              le.link_code, co.id AS conversation_id, co.channel
         FROM leads le
         LEFT JOIN conversations co ON co.lead_id = le.id
        WHERE le.funnel_id = $1 AND le.link_code IS NOT NULL
        ORDER BY le.created_at DESC
        LIMIT $2`,
      [journeyId, limit],
    );
    return r.rows;
  });
}

/** Capture status summary for the Tracking tab. */
export async function captureStatus(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const links = await c.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(clicks),0)::int AS clicks,
      BOOL_OR(active) AS any_active FROM tracked_links WHERE journey_id=$1`, [journeyId]);
    const leads = await c.query(`SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM leads WHERE funnel_id=$1 AND link_code IS NOT NULL`, [journeyId]);
    const page = await c.query(`SELECT published FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    return {
      links: links.rows[0].n, totalClicks: links.rows[0].clicks, linkActive: links.rows[0].any_active ?? false,
      leadsCreated: leads.rows[0].n, lastClick: leads.rows[0].last,
      pageTrackingActive: page.rows[0]?.published ?? false,
    };
  });
}

/** Ingest a page tracking event (from the hosted page snippet). */
export async function ingestPageEvent(
  tenantId: string,
  input: { pageId?: string; type: string; visitor?: string; eventKey?: string },
): Promise<{ accepted: boolean; duplicate?: boolean }> {
  return withTenant(tenantId, async (c) => {
    const ins = await c.query(
      `INSERT INTO page_events (page_id, type, visitor, event_key) VALUES ($1,$2,$3,$4)
       ON CONFLICT (page_id, event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`,
      [input.pageId ?? null, input.type, input.visitor ?? null, input.eventKey ?? null]);
    if (input.eventKey && ins.rowCount === 0) return { accepted: false, duplicate: true };
    await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'page',$2)`,
      [input.type, JSON.stringify({ pageId: input.pageId, visitor: input.visitor })]);
    return { accepted: true };
  });
}

const ALLOWED_PAGE_EVENTS = new Set(['page_view', 'cta_click', 'form_submit', 'scroll_depth', 'whatsapp_click', 'payment_click', 'proof_upload', 'view', 'scroll', 'price_reach']);

/** Batch ingest with per-event validation + partial-accept reporting. */
export async function ingestPageEventsBatch(
  tenantId: string,
  events: { pageId?: string; type: string; visitor?: string; eventKey?: string }[],
): Promise<{ accepted: number; rejected: number; duplicates: number }> {
  let accepted = 0, rejected = 0, duplicates = 0;
  for (const ev of events) {
    if (!ev || typeof ev.type !== 'string' || !ALLOWED_PAGE_EVENTS.has(ev.type)) { rejected++; continue; }
    try {
      const r = await ingestPageEvent(tenantId, ev);
      if (r.duplicate) duplicates++; else accepted++;
    } catch { rejected++; }
  }
  return { accepted, rejected, duplicates };
}
