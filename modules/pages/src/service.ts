import crypto from 'node:crypto';
import { withTenant } from '../../../packages/db/src/router.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { PageBrain, type PageBrainInput, type PagePlan, type PageSectionSpec } from '../../../packages/ai-core/src/brains/page.js';
import { PageSectionActionBrain, type SectionAction } from '../../../packages/ai-core/src/brains/page-section-action.js';
import type { Offer, Market, ProductType, Tone, PaymentMethod } from '../../../packages/ai-core/src/contracts.js';

/**
 * Page service (Sprint 5). Landing Page Intelligence: generate a structured
 * Arabic page from the funnel + offer, persist it as editable section records,
 * edit/reorder/toggle sections, run per-section AI actions (preview only),
 * publish to a public slug, and read the published page (no auth) for hosting.
 */

async function logAi(tenantId: string) {
  return async (row: { brain: string; promptVersion: string; content: unknown; costUsd?: number }) =>
    withTenant(tenantId, async (c) => {
      const r = await c.query(
        `INSERT INTO ai_outputs (brain, prompt_version, content, cost_usd) VALUES ($1,$2,$3,$4) RETURNING id`,
        [row.brain, row.promptVersion, JSON.stringify(row.content), row.costUsd ?? null],
      );
      return r.rows[0].id as string;
    });
}

async function emit(tenantId: string, type: string, payload: unknown) {
  await withTenant(tenantId, async (c) => {
    await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'page',$2)`, [type, JSON.stringify(payload ?? {})]);
  });
}

/** Generate a page for a funnel: runs PageBrain, persists page + section records. */
export async function generatePage(
  tenantId: string,
  journeyId: string,
  llm: LLMClient,
): Promise<{ pageId: string; plan: PagePlan; degraded: boolean } | null> {
  // Gather funnel + offer context from the tenant DB.
  const ctx = await withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT * FROM journeys WHERE id=$1`, [journeyId]);
    if (!j.rowCount) return null;
    const off = await c.query(`SELECT content FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId]);
    const biz = await c.query(`SELECT market, dialect FROM businesses WHERE id=$1`, [j.rows[0].business_id]);
    return { journey: j.rows[0], offer: (off.rows[0]?.content ?? null) as Offer | null, biz: biz.rows[0] ?? {} };
  });
  if (!ctx || !ctx.offer) return null;

  const input: PageBrainInput = {
    funnelName: ctx.journey.name,
    offer: ctx.offer,
    market: (ctx.biz.market as Market) ?? 'eg',
    productType: 'course' as ProductType,
    tone: 'egyptian_friendly' as Tone,
    salesChannel: ctx.journey.channel ?? 'whatsapp',
    paymentMethods: [] as PaymentMethod[],
  };

  const gateway = new AIGateway(llm);
  try { const { getPlaybookContext } = await import('../../playbooks/src/service.js'); (input as any).playbookContext = (await getPlaybookContext(tenantId, 'page')).context; } catch {}
  const { output: plan, degraded } = await gateway.run(PageBrain, input, { tenantId, logOutput: await logAi(tenantId) });

  // Persist page + sections (replace any existing page for this funnel).
  const pageId = await withTenant(tenantId, async (c) => {
    await c.query(`DELETE FROM pages WHERE journey_id=$1`, [journeyId]);
    const p = await c.query(
      `INSERT INTO pages (journey_id, content, goal, angle) VALUES ($1,$2,$3,$4) RETURNING id`,
      [journeyId, JSON.stringify({ goal: plan.goal, angle: plan.angle }), plan.goal, plan.angle],
    );
    const id = p.rows[0].id as string;
    for (let i = 0; i < plan.sections.length; i++) {
      const s = plan.sections[i];
      await c.query(
        `INSERT INTO page_sections (page_id, position, type, content, visible)
         VALUES ($1,$2,$3,$4,TRUE)`,
        [id, i, s.type, JSON.stringify({ title: s.title, body: s.body, bullets: s.bullets, ctaLabel: s.ctaLabel, ctaTarget: s.ctaTarget })],
      );
    }
    return id;
  });

  await emit(tenantId, 'page_generated', { pageId, journeyId, degraded });
  return { pageId, plan, degraded };
}

export async function getPage(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    if (!p.rowCount) return null;
    const page = p.rows[0];
    const sec = await c.query(`SELECT * FROM page_sections WHERE page_id=$1 ORDER BY position`, [page.id]);
    return { page, sections: sec.rows };
  });
}

export async function updateSection(tenantId: string, sectionId: string, patch: { content?: unknown; visible?: boolean }) {
  await withTenant(tenantId, async (c) => {
    if (patch.content !== undefined) {
      await c.query(`UPDATE page_sections SET content=$2, updated_at=now() WHERE id=$1`, [sectionId, JSON.stringify(patch.content)]);
    }
    if (patch.visible !== undefined) {
      await c.query(`UPDATE page_sections SET visible=$2, updated_at=now() WHERE id=$1`, [sectionId, patch.visible]);
    }
  });
}

export async function addSection(tenantId: string, pageId: string, type: string) {
  return withTenant(tenantId, async (c) => {
    const pos = await c.query(`SELECT COALESCE(max(position),-1)+1 AS p FROM page_sections WHERE page_id=$1`, [pageId]);
    const r = await c.query(
      `INSERT INTO page_sections (page_id, position, type, content, visible)
       VALUES ($1,$2,$3,'{"title":"","body":"","bullets":[]}',TRUE) RETURNING id`,
      [pageId, pos.rows[0].p, type],
    );
    return r.rows[0].id as string;
  });
}

export async function deleteSection(tenantId: string, sectionId: string) {
  await withTenant(tenantId, async (c) => { await c.query(`DELETE FROM page_sections WHERE id=$1`, [sectionId]); });
}

export async function reorderSections(tenantId: string, pageId: string, orderedIds: string[]) {
  await withTenant(tenantId, async (c) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await c.query(`UPDATE page_sections SET position=$2, updated_at=now() WHERE id=$1 AND page_id=$3`, [orderedIds[i], i, pageId]);
    }
  });
}

/** Run an AI action on one section → preview (NOT applied). Logs versioned output. */
export async function runSectionAction(
  tenantId: string,
  sectionId: string,
  action: SectionAction,
  llm: LLMClient,
): Promise<{ preview: PageSectionSpec; degraded: boolean } | null> {
  const section = await withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT type, content FROM page_sections WHERE id=$1`, [sectionId]);
    if (!r.rowCount) return null;
    const ct = r.rows[0].content || {};
    return { type: r.rows[0].type, title: ct.title ?? '', body: ct.body ?? '', bullets: ct.bullets ?? [], ctaLabel: ct.ctaLabel, ctaTarget: ct.ctaTarget } as PageSectionSpec;
  });
  if (!section) return null;
  const gateway = new AIGateway(llm);
  const { output, degraded } = await gateway.run(PageSectionActionBrain, { section, action }, { tenantId, logOutput: await logAi(tenantId) });
  return { preview: output, degraded };
}

/** Publish a page: generate a slug if missing, mark published. */
export async function publishPage(tenantId: string, journeyId: string, whatsappDestination?: string): Promise<{ slug: string } | null> {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT id, slug FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    if (!p.rowCount) return null;
    let slug = p.rows[0].slug as string | null;
    if (!slug) slug = crypto.randomBytes(5).toString('hex');
    await c.query(
      `UPDATE pages SET slug=$2, published=TRUE, published_at=now(), whatsapp_destination=COALESCE($3,whatsapp_destination) WHERE id=$1`,
      [p.rows[0].id, slug, whatsappDestination ?? null],
    );
    return { slug };
  });
}

export async function unpublishPage(tenantId: string, journeyId: string) {
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE pages SET published=FALSE WHERE journey_id=$1`, [journeyId]);
  });
}

/**
 * Public read by slug — returns ONLY published pages and ONLY visible sections,
 * and ONLY presentational fields. No private tenant data is exposed.
 */
export async function getPublicPage(tenantId: string, slug: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT id, journey_id, goal, angle, whatsapp_destination FROM pages WHERE slug=$1 AND published=TRUE`, [slug]);
    if (!p.rowCount) return null;
    const page = p.rows[0];
    const sec = await c.query(
      `SELECT type, content FROM page_sections WHERE page_id=$1 AND visible=TRUE ORDER BY position`,
      [page.id],
    );
    // Prefer a tracked WhatsApp link for this funnel so page CTAs are observable.
    let trackedCode: string | null = null;
    if (page.journey_id) {
      const lnk = await c.query(
        `SELECT code FROM tracked_links WHERE journey_id=$1 AND active=TRUE ORDER BY created_at DESC LIMIT 1`,
        [page.journey_id],
      );
      if (lnk.rowCount) trackedCode = lnk.rows[0].code as string;
    }
    return {
      goal: page.goal,
      angle: page.angle,
      whatsappDestination: page.whatsapp_destination,
      trackedCode,                 // if set, the page links to /r/:code (tracked)
      sections: sec.rows.map((r) => ({ type: r.type, ...r.content })),
    };
  });
}
