import { withTenant } from '../../../packages/db/src/router.js';
import { learningRollup } from '../../repairs/src/learning.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { ReportBrain, type ReportInput } from '../../../packages/ai-core/src/brains/report.js';
import { refreshActions, listActions } from '../../actions/src/service.js';
import { hasEnoughData } from '../../leaks/src/engine.js';

/**
 * Weekly diagnosis report. Pulls together leaks + actions + lead/payment/
 * WhatsApp/page summaries for a period, writes a plain-Arabic executive summary
 * (ReportBrain, rule-based fallback), and persists it. Never fabricates numbers.
 */

async function logAi(tenantId: string) {
  return async (row: { brain: string; promptVersion: string; content: unknown; costUsd?: number }) =>
    withTenant(tenantId, async (c) => {
      const r = await c.query(`INSERT INTO ai_outputs (brain, prompt_version, content, cost_usd) VALUES ($1,$2,$3,$4) RETURNING id`,
        [row.brain, row.promptVersion, JSON.stringify(row.content), row.costUsd ?? null]);
      return r.rows[0].id as string;
    });
}

export async function generateReport(tenantId: string, journeyId: string, llm: LLMClient, days = 7) {
  // make sure actions reflect current records
  await refreshActions(tenantId, journeyId);

  const ctx = await withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT * FROM journeys WHERE id=$1`, [journeyId]);
    if (!j.rowCount) return null;

    const leaks = await c.query(
      `SELECT id, title, severity, fastest_fix FROM leak_findings
        WHERE journey_id=$1 AND status IN ('open','fixing')
        ORDER BY CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC LIMIT 3`, [journeyId]);
    const needAction = await c.query(
      `SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL
         AND (stage='needs_followup' OR followup_due_at IS NOT NULL OR next_action IS NOT NULL)
         AND stage NOT IN ('paid','access_delivered','lost')`, [journeyId]);
    const paymentStuck = await c.query(
      `SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND stage='waiting_payment'`, [journeyId]);
    const waNoContact = await c.query(
      `SELECT COUNT(*)::int AS n FROM leads le WHERE le.funnel_id=$1 AND le.stage='whatsapp_clicked'
         AND NOT EXISTS (SELECT 1 FROM whatsapp_draft_replies d WHERE d.lead_id=le.id AND d.marked_sent=TRUE)`, [journeyId]);
    const totals = await c.query(
      `SELECT COALESCE(SUM(clicks),0)::int AS clicks FROM tracked_links WHERE journey_id=$1`, [journeyId]);
    const leadsTotal = await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL`, [journeyId]);
    const page = await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    let pageViews = 0, ctaClicks = 0;
    if (page.rowCount) {
      const pe = await c.query(`SELECT type, COUNT(*)::int AS n FROM page_events WHERE page_id=$1 GROUP BY type`, [page.rows[0].id]);
      for (const r of pe.rows) { if (r.type === 'page_view') pageViews = r.n; if (r.type === 'cta_clicked') ctaClicks = r.n; }
    }
    const paid = await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND stage IN ('paid','access_delivered')`, [journeyId]);
    return {
      journey: j.rows[0], leaks: leaks.rows, needAction: needAction.rows[0].n, paymentStuck: paymentStuck.rows[0].n,
      waNoContact: waNoContact.rows[0].n, clicks: totals.rows[0].clicks, leadsTotal: leadsTotal.rows[0].n,
      pageViews, ctaClicks, paid: paid.rows[0].n,
    };
  });
  if (!ctx) return null;

  const actions = await listActions(tenantId, journeyId, 'today');
  const enough = hasEnoughData({ totalClicks: ctx.clicks, pageViews: ctx.pageViews, leadsCount: ctx.leadsTotal } as any);

  const wins: string[] = [];
  if (ctx.paid > 0) wins.push(`${ctx.paid} عميل وصلوا لمرحلة الدفع/التسليم`);
  // repair outcomes this period (honest — no fabricated impact)
  const repairRollup = await withTenant(tenantId, async (c) => {
    const applied = await c.query(`SELECT COUNT(*)::int AS n FROM repair_plans WHERE journey_id=$1 AND status IN ('applied','partially_applied')`, [journeyId]);
    const improved = await c.query(`SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC) s WHERE status='improved'`, [journeyId]);
    const awaiting = await c.query(`SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC) s WHERE status IN ('awaiting_data','early_signal')`, [journeyId]);
    const noChange = await c.query(`SELECT COUNT(*)::int AS n FROM (SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC) s WHERE status IN ('no_change','worsened')`, [journeyId]);
    return { applied: applied.rows[0].n, improved: improved.rows[0].n, awaiting: awaiting.rows[0].n, noChange: noChange.rows[0].n };
  });
  if (repairRollup.improved > 0) wins.push(`${repairRollup.improved} إصلاح ظهر تحسّنه`);
  // learning patterns this period (no exaggeration; honest about limited data)
  const learning = await learningRollup(tenantId).catch(() => []);
  const learningSummary = learning.length === 0
    ? { hasData: false, note: 'لسه مفيش بيانات تعلّم كفاية عن الإصلاحات.' }
    : { hasData: true, patterns: learning.filter((l) => !l.limited).map((l) => ({ type: l.repairType, note: l.note, confidence: l.confidence })),
        note: learning.every((l) => l.limited) ? 'بيانات التعلّم لسه محدودة عبر كل أنواع الإصلاح.' : null };
  // adaptive playbook insights (which playbooks have data, which don't) + applications applied
  const playbookInsights = await (async () => {
    try { const { playbookReportSummary } = await import('../../playbooks/src/service.js'); return await playbookReportSummary(tenantId); }
    catch { return { used: [], insufficient: [] }; }
  })();
  const applicationsRollup = await withTenant(tenantId, async (c) => {
    const r = await c.query(
      `SELECT COUNT(*) FILTER (WHERE status IN ('applied','partially_applied'))::int AS applied,
              COUNT(*) FILTER (WHERE status='proposed')::int AS pending
         FROM playbook_application_plans WHERE funnel_id=$1`, [journeyId]).catch(() => ({ rows: [{ applied: 0, pending: 0 }] }));
    const o = await c.query(
      `SELECT COUNT(*) FILTER (WHERE status='improved')::int AS improved,
              COUNT(*) FILTER (WHERE status IN ('awaiting_data','early_signal'))::int AS awaiting,
              COUNT(*) FILTER (WHERE status IN ('no_change','worsened'))::int AS no_change
         FROM (SELECT DISTINCT ON (application_plan_id) status FROM playbook_application_outcomes WHERE funnel_id=$1 ORDER BY application_plan_id, measured_at DESC) s`, [journeyId])
      .catch(() => ({ rows: [{ improved: 0, awaiting: 0, no_change: 0 }] }));
    return { applied: r.rows[0].applied, pending: r.rows[0].pending, improved: o.rows[0].improved, awaiting: o.rows[0].awaiting, noChange: o.rows[0].no_change };
  });
  // cross-funnel portfolio summary (Sprint 23)
  const portfolioSummary = await (async () => {
    try { const { portfolioReportSummary } = await import('../../portfolio/src/service.js'); return await portfolioReportSummary(tenantId); }
    catch { return null; }
  })();

  const periodLabel = `آخر ${days} أيام`;
  const input: ReportInput = {
    funnelName: ctx.journey.name, periodLabel, enoughData: enough,
    topLeaks: ctx.leaks.map((l: any) => ({ title: l.title, severity: l.severity, fastestFix: l.fastest_fix })),
    biggestLeak: ctx.leaks[0] ? { title: ctx.leaks[0].title, fastestFix: ctx.leaks[0].fastest_fix } : null,
    leadsNeedingAction: ctx.needAction, paymentStuck: ctx.paymentStuck, whatsappClickedNoContact: ctx.waNoContact,
    pageViews: ctx.pageViews, ctaClicks: ctx.ctaClicks, wins,
    topActions: actions.slice(0, 5).map((a: any) => ({ title: a.title, recommendedAction: a.recommended_action })),
  };

  const gateway = new AIGateway(llm);
  let aiOutputId: string | null = null;
  const logger = await logAi(tenantId);
  const { output, degraded } = await gateway.run(ReportBrain, input, {
    tenantId,
    logOutput: async (row) => { aiOutputId = await logger(row); return aiOutputId; },
  });

  const reportId = await withTenant(tenantId, async (c) => {
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const meta = { ...input, output, repairs: repairRollup, learning: learningSummary, playbooks: playbookInsights, applications: applicationsRollup, portfolio: portfolioSummary };
    const r = await c.query(
      `INSERT INTO reports (journey_id, period_start, period_end, summary, biggest_leak_id, status, ai_output_id, metadata, degraded)
       VALUES ($1,$2,$3,$4,$5,'generated',$6,$7,$8) RETURNING id`,
      [journeyId, start.toISOString(), now.toISOString(), output.executiveSummary,
       ctx.leaks[0]?.id ?? null, aiOutputId, JSON.stringify(meta), degraded]);
    await c.query(`INSERT INTO events (type, source, payload) VALUES ('report_generated','report',$1)`, [JSON.stringify({ journeyId, reportId: r.rows[0].id })]);
    return r.rows[0].id as string;
  });

  return { reportId, degraded, report: { ...output, input, repairs: repairRollup, learning: learningSummary, playbooks: playbookInsights, applications: applicationsRollup, portfolio: portfolioSummary } };
}

export async function getLatestReport(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM reports WHERE journey_id=$1 ORDER BY generated_at DESC LIMIT 1`, [journeyId]);
    return r.rows[0] ?? null;
  });
}

export async function markReportReviewed(tenantId: string, reportId: string) {
  await withTenant(tenantId, async (c) => {
    await c.query(`UPDATE reports SET status='reviewed' WHERE id=$1`, [reportId]);
    await c.query(`INSERT INTO events (type, source, payload) VALUES ('report_reviewed','report',$1)`, [JSON.stringify({ reportId })]);
  });
}
