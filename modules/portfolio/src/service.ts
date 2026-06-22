import { withTenant } from '../../../packages/db/src/router.js';
import { comparePortfolio, findTransferable, funnelHealth, type FunnelMetrics, type PortfolioInsight } from './compare.js';

/**
 * Portfolio intelligence service. Gathers comparable metrics for every funnel in
 * the business, runs the pure comparison, and persists evidence-based insights.
 * No fabricated rankings; no auto-apply; archive is a suggestion, never a delete.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'portfolio',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const num = (v: any) => Number(v ?? 0);

/** Gather comparable metrics for a single funnel. */
async function gatherFunnel(c: any, j: any): Promise<FunnelMetrics> {
  const journeyId = j.id;
  const countLeads = async (where: string) => num((await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${where}`, [journeyId])).rows[0].n);

  const leads = await countLeads('TRUE');
  const activeLeads = await countLeads(`stage NOT IN ('paid','access_delivered','lost')`);
  const waitingPayment = await countLeads(`stage='waiting_payment'`);
  const paid = await countLeads(`stage IN ('paid','access_delivered')`);
  const clickedNotContacted = await countLeads(`stage='whatsapp_clicked'`);
  const contacted = await countLeads(`stage IN ('contacted','qualified','price_sent')`);

  const page = (await c.query(`SELECT id, published_at FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]).catch(() => ({ rows: [] }))).rows[0];
  let pageViews = 0, ctaClicks = 0, whatsappClicks = 0;
  if (page) {
    const pe = await c.query(`SELECT type, COUNT(*)::int AS n FROM page_events WHERE page_id=$1 GROUP BY type`, [page.id]).catch(() => ({ rows: [] }));
    for (const r of pe.rows) { if (r.type === 'page_view') pageViews = r.n; if (r.type === 'cta_clicked') ctaClicks = r.n; if (r.type === 'whatsapp_clicked') whatsappClicks = r.n; }
  }
  const tracked = num((await c.query(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const paymentLeads = num((await c.query(`SELECT COUNT(DISTINCT lead_id)::int AS n FROM payment_states ps JOIN leads l ON l.id=ps.lead_id WHERE l.funnel_id=$1`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const openLeaks = num((await c.query(`SELECT COUNT(*)::int AS n FROM leak_findings WHERE journey_id=$1 AND status IN ('open','fixing')`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const repairsApplied = num((await c.query(`SELECT COUNT(*)::int AS n FROM repair_plans WHERE journey_id=$1 AND status IN ('applied','partially_applied')`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const playbooksApplied = num((await c.query(`SELECT COUNT(*)::int AS n FROM playbook_application_plans WHERE funnel_id=$1 AND status IN ('applied','partially_applied')`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const overdueTasks = num((await c.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now()`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);

  // learning outcomes across repairs + applications
  const improved = num((await c.query(
    `SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC) s WHERE status='improved')
          + (SELECT COUNT(*) FROM (SELECT DISTINCT ON (application_plan_id) status FROM playbook_application_outcomes WHERE funnel_id=$1 ORDER BY application_plan_id, measured_at DESC) s WHERE status='improved') AS n`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);
  const awaiting = num((await c.query(
    `SELECT (SELECT COUNT(*) FROM (SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC) s WHERE status IN ('awaiting_data','early_signal'))
          + (SELECT COUNT(*) FROM (SELECT DISTINCT ON (application_plan_id) status FROM playbook_application_outcomes WHERE funnel_id=$1 ORDER BY application_plan_id, measured_at DESC) s WHERE status IN ('awaiting_data','early_signal')) AS n`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n);

  return {
    funnelId: journeyId, name: j.name, market: j.market ?? null,
    published: !!(page && page.published_at), hasTracking: tracked > 0,
    leads, activeLeads, openLeaks, repairsApplied, playbooksApplied,
    pageViews, ctaClicks, whatsappClicks, ctaRate: pageViews > 0 ? ctaClicks / pageViews : 0,
    clickedNotContacted, contacted,
    waitingPayment, paid, paymentLeads,
    overdueTasks, improvedOutcomes: improved, awaitingOutcomes: awaiting,
  };
}

/** Gather metrics for all funnels in the (single) business of this tenant. */
export async function getPortfolioMetrics(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const biz = (await c.query(`SELECT id, market FROM businesses ORDER BY created_at LIMIT 1`)).rows[0];
    const journeys = (await c.query(`SELECT id, name FROM journeys WHERE deleted_at IS NULL ORDER BY created_at`)).rows
      .map((j: any) => ({ ...j, market: biz?.market ?? null }));
    const funnels: FunnelMetrics[] = [];
    for (const j of journeys) funnels.push(await gatherFunnel(c, j));
    return { businessId: biz?.id ?? null, funnels: funnels.map((f) => ({ ...f, health: funnelHealth(f) })) };
  });
}

/** Analyze the portfolio: compute metrics, build insights, persist them + a snapshot. */
export async function analyzePortfolio(tenantId: string) {
  const { businessId, funnels } = await getPortfolioMetrics(tenantId);
  const insights = comparePortfolio(funnels as FunnelMetrics[]);
  const transfers = findTransferable(funnels as FunnelMetrics[]);

  return withTenant(tenantId, async (c) => {
    if (!businessId) return { insights, transfers, persisted: 0 };
    // refresh open insights (archive previous open, insert fresh — no stale lingering)
    await c.query(`UPDATE portfolio_insights SET status='ignored', updated_at=now() WHERE business_id=$1 AND status='open'`, [businessId]);
    for (const ins of insights) {
      await c.query(
        `INSERT INTO portfolio_insights (business_id, insight_type, title, explanation, evidence, confidence, affected_funnels, recommended_action, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open')`,
        [businessId, ins.insightType, ins.title, ins.explanation, JSON.stringify(ins.evidence), ins.confidence, JSON.stringify(ins.affectedFunnels), ins.recommendedAction]);
    }
    for (const t of transfers) {
      await c.query(
        `INSERT INTO portfolio_insights (business_id, insight_type, title, explanation, evidence, confidence, affected_funnels, recommended_action, status)
         VALUES ($1,'transferable_playbook',$2,$3,$4,$5,$6,'apply_playbook_to_funnel','open')`,
        [businessId, `انقل playbook ${t.playbookType} لقمع تاني`, t.why, JSON.stringify({ source: t.sourceFunnel, target: t.targetFunnel, playbookType: t.playbookType }), t.confidence, JSON.stringify([t.sourceFunnel, t.targetFunnel])]);
    }
    await c.query(`INSERT INTO portfolio_snapshots (business_id, metrics, insights) VALUES ($1,$2,$3)`,
      [businessId, JSON.stringify(funnels), JSON.stringify(insights)]);
    await emit(c, 'portfolio_analyzed', { insights: insights.length, transfers: transfers.length });
    return { insights: insights.length, transfers: transfers.length };
  });
}

export async function listInsights(tenantId: string, status = 'open') {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM portfolio_insights WHERE status=$1 ORDER BY created_at DESC`, [status])).rows);
}

export async function updateInsight(tenantId: string, insightId: string, status: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE portfolio_insights SET status=$2, updated_at=now() WHERE id=$1`, [insightId, status]);
    return { ok: true };
  });
}

export async function listSnapshots(tenantId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT id, measured_at FROM portfolio_snapshots ORDER BY measured_at DESC LIMIT 20`)).rows);
}

/**
 * Build a transfer plan: take a successful funnel's playbook type and propose a
 * playbook application plan on the target funnel (proposed only — no auto-apply).
 */
export async function transferPlaybookPlan(tenantId: string, input: { targetFunnelId: string; playbookType: string }) {
  const { planPlaybookApplication } = await import('../../playbooks/src/apply-service.js');
  const r = await planPlaybookApplication(tenantId, input.targetFunnelId, input.playbookType as any).catch(() => null);
  if (!r || (r as any).noChanges) return { noChanges: true };
  return { applicationPlanId: (r as any).planId, steps: (r as any).steps, confidence: (r as any).confidence };
}

/** Portfolio summary for the weekly/workspace report. */
export async function portfolioReportSummary(tenantId: string) {
  const { funnels } = await getPortfolioMetrics(tenantId);
  const open = await listInsights(tenantId, 'open');
  const strongest = open.find((i: any) => i.insight_type === 'strongest_funnel');
  const needsAttention = open.filter((i: any) => ['underperforming_page', 'payment_friction', 'missing_tracking'].includes(i.insight_type)).length;
  const transferable = open.filter((i: any) => i.insight_type === 'transferable_playbook').length;
  const insufficient = open.some((i: any) => i.insight_type === 'insufficient_data');
  return {
    funnels: funnels.length,
    strongest: strongest ? strongest.title : null,
    needsAttention, transferable, insufficient,
  };
}
