import { withTenant, withTenantTx } from '../../../packages/db/src/router.js';
import { interpretAppOutcome, scopeToPlaybookType, type AppScope, type MetricBag } from './app-outcome-engine.js';

/**
 * Playbook application outcome loop. Captures baseline metrics at apply time,
 * measures current metrics later, runs the pure interpreter, persists the
 * outcome + a learning record, and feeds it back into adaptive playbooks.
 * Never fabricates impact.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'playbooks',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const countLeads = (c: any, journeyId: string) => async (where: string): Promise<number> =>
  ((await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${where}`, [journeyId])).rows[0].n) as number;

/** Collect the metric bag for an application scope from observed data. */
export async function collectScopeMetrics(c: any, journeyId: string, scope: AppScope): Promise<MetricBag> {
  const m: MetricBag = {};
  const count = countLeads(c, journeyId);

  const pageMetrics = async () => {
    const page = (await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId])).rows[0];
    let views = 0, cta = 0, price = 0, wa = 0;
    if (page) {
      const pe = await c.query(`SELECT type, COUNT(*)::int AS n FROM page_events WHERE page_id=$1 GROUP BY type`, [page.id]);
      for (const r of pe.rows) { if (r.type === 'page_view') views = r.n; if (r.type === 'cta_clicked') cta = r.n; if (r.type === 'price_reached') price = r.n; if (r.type === 'whatsapp_clicked') wa = r.n; }
    }
    m.pageViews = views; m.ctaClicks = cta; m.priceReached = price; m.whatsappClicks = wa;
    m.ctaRate = views > 0 ? cta / views : 0;
  };
  const whatsappMetrics = async () => {
    m.clickedNotContacted = await count(`stage='whatsapp_clicked'`);
    m.contacted = await count(`stage IN ('contacted','qualified','price_sent')`);
    const sent = await c.query(`SELECT COUNT(*)::int AS n FROM whatsapp_draft_replies d JOIN leads l ON l.id=d.lead_id WHERE l.funnel_id=$1 AND d.marked_sent=TRUE`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.repliesMarkedSent = sent.rows[0].n;
    const inbound = await c.query(`SELECT COUNT(*)::int AS n FROM conversation_messages cm JOIN leads l ON l.id=cm.lead_id WHERE l.funnel_id=$1 AND cm.direction='inbound'`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.inboundReplies = inbound.rows[0].n;
  };
  const paymentMetrics = async () => {
    m.waitingPayment = await count(`stage='waiting_payment'`);
    m.proofUploaded = await count(`stage='proof_uploaded'`);
    m.paid = await count(`stage IN ('paid','access_delivered')`);
    m.confirmedNotDelivered = await count(`EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=leads.id AND p.state='confirmed' AND p.access_delivered=FALSE)`);
  };
  const followupMetrics = async () => {
    const overdue = await c.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now()`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.overdueTasks = overdue.rows[0].n;
    const done = await c.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=TRUE`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.tasksDone = done.rows[0].n;
    m.needsFollowup = await count(`stage='needs_followup'`);
  };
  const funnelMetrics = async () => {
    m.leadsCreated = await count(`TRUE`);
    m.paid = await count(`stage IN ('paid','access_delivered')`);
    m.lost = await count(`stage='lost'`);
    const leaks = await c.query(`SELECT COUNT(*)::int AS n FROM leak_findings WHERE journey_id=$1 AND status IN ('open','fixing')`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.activeLeaks = leaks.rows[0].n;
  };

  if (scope === 'page' || scope === 'offer') await pageMetrics();
  if (scope === 'whatsapp') await whatsappMetrics();
  if (scope === 'payment') await paymentMetrics();
  if (scope === 'followup') await followupMetrics();
  if (scope === 'offer') { await funnelMetrics(); }
  if (scope === 'funnel' || scope === 'all') { await pageMetrics(); await whatsappMetrics(); await paymentMetrics(); await funnelMetrics(); }
  return m;
}

/** Capture baseline metrics for an application plan at apply time. */
export async function captureApplicationBaseline(c: any, plan: { id: string; funnel_id: string; scope: AppScope }) {
  const metrics = await collectScopeMetrics(c, plan.funnel_id, plan.scope);
  const baseline = { at: new Date().toISOString(), metrics };
  await c.query(`UPDATE playbook_application_plans SET baseline_metrics=$2 WHERE id=$1`, [plan.id, JSON.stringify(baseline)]);
  return baseline;
}

/** Measure (or re-measure) an application plan's outcome now. */
export async function measureApplicationOutcome(tenantId: string, planId: string) {
  const out = await withTenantTx(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM playbook_application_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    const plan = p.rows[0];
    if (!plan.applied_at || !plan.baseline_metrics) return { state: 'not_applied' };

    const baseline = typeof plan.baseline_metrics === 'string' ? JSON.parse(plan.baseline_metrics) : plan.baseline_metrics;
    const baselineMetrics: MetricBag = baseline.metrics ?? {};
    const scope = plan.scope as AppScope;
    const current = await collectScopeMetrics(c, plan.funnel_id, scope);
    const hoursElapsed = (Date.now() - new Date(plan.applied_at).getTime()) / 3600_000;

    const result = interpretAppOutcome({ scope, baseline: baselineMetrics, current, hoursElapsed });

    const outcome = await c.query(
      `INSERT INTO playbook_application_outcomes (application_plan_id, funnel_id, playbook_id, scope, window_start, window_end, status,
          baseline_metrics, current_metrics, delta_metrics, confidence, interpretation, recommended_next_action)
       VALUES ($1,$2,$3,$4,$5, now(), $6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [planId, plan.funnel_id, plan.playbook_id, scope, plan.applied_at, result.status,
       JSON.stringify(baselineMetrics), JSON.stringify(current), JSON.stringify(result.delta),
       result.confidence, result.interpretation, result.recommendedNextAction]);

    const appOutcomeId = outcome.rows[0].id;

    // learning record keyed 1:1 to this outcome; collapse to one-per-plan (latest wins).
    // decided statuses feed success calc, awaiting never inflates, re-measurement never duplicates.
    const biz = await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }));
    await c.query(
      `INSERT INTO playbook_application_learning_records (application_outcome_id, playbook_type, market, scope, status, confidence, delta_metrics, application_plan_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (application_outcome_id) DO NOTHING`,
      [appOutcomeId, scopeToPlaybookType(scope), biz.rows[0]?.market ?? null, scope, result.status, result.confidence, JSON.stringify(result.delta), planId]);
    await c.query(`DELETE FROM playbook_application_learning_records WHERE application_plan_id=$1 AND application_outcome_id <> $2`, [planId, appOutcomeId]);

    await emit(c, 'playbook_application_outcome_measured', { planId, status: result.status, confidence: result.confidence });
    return { outcomeId: appOutcomeId, ...result, baselineMetrics, current, hoursElapsed: Math.round(hoursElapsed) };
  });
  // regenerate playbooks so application learning shapes future builds (own scope)
  if (out && (out as any).outcomeId) {
    try { const { regeneratePlaybooks } = await import('./service.js'); await regeneratePlaybooks(tenantId); } catch { /* non-fatal */ }
  }
  return out;
}

export async function listApplicationOutcomes(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM playbook_application_outcomes WHERE application_plan_id=$1 ORDER BY measured_at DESC`, [planId])).rows);
}

export async function confirmApplicationOutcome(tenantId: string, outcomeId: string) {
  return withTenant(tenantId, async (c) => {
    await c.query(`UPDATE playbook_application_outcomes SET confirmed=TRUE WHERE id=$1`, [outcomeId]);
    await emit(c, 'playbook_application_confirmed', { outcomeId });
    return { ok: true };
  });
}

/** Summary for the playbooks screen + weekly report (latest outcome per plan). */
export async function applicationOutcomeSummary(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const where = journeyId ? `WHERE funnel_id=$1` : '';
    const params = journeyId ? [journeyId] : [];
    const rows = (await c.query(
      `SELECT DISTINCT ON (application_plan_id) status, confidence, scope
         FROM playbook_application_outcomes ${where} ORDER BY application_plan_id, measured_at DESC`, params)).rows;
    const summary: Record<string, number> = { improved: 0, early_signal: 0, awaiting_data: 0, no_change: 0, worsened: 0, inconclusive: 0 };
    for (const r of rows) summary[r.status] = (summary[r.status] ?? 0) + 1;
    const appCount = (await c.query(
      `SELECT COUNT(*)::int AS n FROM playbook_application_plans ${journeyId ? 'WHERE funnel_id=$1 AND' : 'WHERE'} status IN ('applied','partially_applied')`, params)).rows[0].n;
    return { applications: appCount, outcomes: rows.length, summary };
  });
}
