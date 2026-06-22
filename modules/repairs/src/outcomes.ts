import { withTenant, withTenantTx } from '../../../packages/db/src/router.js';
import { interpretOutcome, type RepairType, type MetricBag } from './outcome-engine.js';

/**
 * Repair outcome measurement. Collects the same metric bag at baseline (apply
 * time) and now, runs the pure interpreter, and persists the outcome + metric
 * snapshots + a learning record. Never fabricates impact.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'repairs',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/**
 * Collect the metric bag relevant to a repair type from observed data.
 * Shared between baseline capture and current measurement so deltas are honest.
 */
export async function collectMetrics(c: any, journeyId: string, type: string): Promise<MetricBag> {
  const m: MetricBag = {};
  const count = async (where: string) =>
    ((await c.query(`SELECT COUNT(*)::int AS n FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND ${where}`, [journeyId])).rows[0].n) as number;

  if (type === 'payment_recovery' || type === 'access_delivery_fix') {
    m.waitingPayment = await count(`stage='waiting_payment'`);
    m.paid = await count(`stage IN ('paid','access_delivered')`);
    m.confirmedNotDelivered = await count(`EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=leads.id AND p.state='confirmed' AND p.access_delivered=FALSE)`);
    m.proofUploaded = await count(`stage='proof_uploaded'`);
  } else if (type === 'whatsapp_first_reply' || type === 'whatsapp_followup') {
    m.clickedNotContacted = await count(`stage='whatsapp_clicked'`);
    m.contacted = await count(`stage IN ('contacted','qualified','price_sent')`);
    m.needsFollowup = await count(`stage='needs_followup'`);
    const sent = await c.query(`SELECT COUNT(*)::int AS n FROM whatsapp_draft_replies d JOIN leads l ON l.id=d.lead_id WHERE l.funnel_id=$1 AND d.marked_sent=TRUE`, [journeyId]);
    m.repliesMarkedSent = sent.rows[0].n;
    const inbound = await c.query(`SELECT COUNT(*)::int AS n FROM conversation_messages cm JOIN leads l ON l.id=cm.lead_id WHERE l.funnel_id=$1 AND cm.direction='inbound'`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.inboundReplies = inbound.rows[0].n;
  } else if (type === 'page_cta_fix' || type === 'page_hero_fix') {
    const page = await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    let views = 0, cta = 0, price = 0, wa = 0;
    if (page.rowCount) {
      const pe = await c.query(`SELECT type, COUNT(*)::int AS n FROM page_events WHERE page_id=$1 GROUP BY type`, [page.rows[0].id]);
      for (const r of pe.rows) { if (r.type === 'page_view') views = r.n; if (r.type === 'cta_clicked') cta = r.n; if (r.type === 'price_reached') price = r.n; if (r.type === 'whatsapp_clicked') wa = r.n; }
    }
    m.pageViews = views; m.ctaClicks = cta; m.priceReached = price; m.whatsappClicks = wa;
    m.ctaRate = views > 0 ? cta / views : 0;
  } else if (type === 'tracking_fix' || type === 'attribution_fix') {
    const links = await c.query(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [journeyId]);
    m.trackedLinks = links.rows[0].n;
    m.attributedLeads = await count(`attribution IS NOT NULL`);
    const ev = await c.query(`SELECT COUNT(*)::int AS n FROM integration_events ie JOIN integration_connections ic ON ic.id=ie.connection_id WHERE ic.journey_id=$1`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }));
    m.eventsReceived = ev.rows[0].n;
  } else if (type === 'followup_fix') {
    const overdue = await c.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now()`, [journeyId]);
    m.overdueTasks = overdue.rows[0].n;
    m.needsFollowup = await count(`stage='needs_followup'`);
    m.lostNoReason = await count(`stage='lost' AND lost_reason IS NULL`);
    const done = await c.query(`SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=TRUE`, [journeyId]);
    m.tasksDone = done.rows[0].n;
  }
  return m;
}

/** Capture baseline metrics for a plan at apply time (called from applyRepair). */
export async function captureBaselineMetrics(c: any, plan: { id: string; journey_id: string; type: string; leak_id: string | null }) {
  const metrics = await collectMetrics(c, plan.journey_id, plan.type);
  const leak = plan.leak_id ? (await c.query(`SELECT severity FROM leak_findings WHERE id=$1`, [plan.leak_id])).rows[0] : null;
  const baseline = { at: new Date().toISOString(), leakSeverityBefore: leak?.severity ?? null, metrics };
  for (const [k, v] of Object.entries(metrics)) {
    await c.query(`INSERT INTO repair_metric_snapshots (repair_plan_id, metric_key, value, source) VALUES ($1,$2,$3,'baseline')`, [plan.id, k, v]);
  }
  return baseline;
}

/** Measure (or re-measure) a repair plan's outcome now. */
export async function measureOutcome(tenantId: string, planId: string) {
  const result = await measureOutcomeInner(tenantId, planId);
  // refresh adaptive playbooks so learning shapes future builds (best-effort, own scope)
  if (result && (result as any).outcomeId) {
    try { const { regeneratePlaybooks } = await import('../../playbooks/src/service.js'); await regeneratePlaybooks(tenantId); } catch { /* non-fatal */ }
  }
  return result;
}

async function measureOutcomeInner(tenantId: string, planId: string) {
  return withTenantTx(tenantId, async (c) => {
    const p = await c.query(`SELECT * FROM repair_plans WHERE id=$1`, [planId]);
    if (!p.rowCount) return null;
    const plan = p.rows[0];
    if (!plan.applied_at || !plan.baseline) return { state: 'not_applied' };

    const baseline = typeof plan.baseline === 'string' ? JSON.parse(plan.baseline) : plan.baseline;
    const baselineMetrics: MetricBag = baseline.metrics ?? {};
    const current = await collectMetrics(c, plan.journey_id, plan.type);
    const hoursElapsed = (Date.now() - new Date(plan.applied_at).getTime()) / 3600_000;

    const result = interpretOutcome({ type: plan.type as RepairType, baseline: baselineMetrics, current, hoursElapsed });

    // store current snapshots
    for (const [k, v] of Object.entries(current)) {
      await c.query(`INSERT INTO repair_metric_snapshots (repair_plan_id, metric_key, value, source) VALUES ($1,$2,$3,'current')`, [planId, k, v]);
    }

    const windowStart = plan.applied_at;
    const outcome = await c.query(
      `INSERT INTO repair_outcomes (repair_plan_id, journey_id, leak_id, window_start, window_end, status,
          baseline_metrics, current_metrics, delta_metrics, interpretation, confidence, recommended_next_action)
       VALUES ($1,$2,$3,$4, now(), $5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [planId, plan.journey_id, plan.leak_id, windowStart, result.status,
       JSON.stringify(baselineMetrics), JSON.stringify(current), JSON.stringify(result.delta),
       result.interpretation, result.confidence, result.recommendedNextAction]);

    const repairOutcomeId = outcome.rows[0].id;

    // learning record keyed 1:1 to this outcome; collapse to one-per-plan (latest status wins).
    // Re-measuring the SAME plan updates the SAME learning sample — never inflates.
    const biz = await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }));
    await c.query(
      `INSERT INTO repair_learning_records (repair_outcome_id, repair_plan_id, repair_type, market, product_type, funnel_type, success_status, confidence, metrics_delta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (repair_outcome_id) DO NOTHING`,
      [repairOutcomeId, planId, plan.type, biz.rows[0]?.market ?? null, null, null, result.status, result.confidence, JSON.stringify(result.delta)]);
    await c.query(`DELETE FROM repair_learning_records WHERE repair_plan_id=$1 AND repair_outcome_id <> $2`, [planId, repairOutcomeId]);

    await emit(c, 'repair_outcome_measured', { planId, status: result.status, confidence: result.confidence });
    return { outcomeId: repairOutcomeId, ...result, baselineMetrics, current, hoursElapsed: Math.round(hoursElapsed) };
  });
}

export async function listOutcomes(tenantId: string, planId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM repair_outcomes WHERE repair_plan_id=$1 ORDER BY measured_at DESC`, [planId])).rows);
}

export async function listFunnelOutcomes(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(
      `SELECT DISTINCT ON (repair_plan_id) ro.*, rp.type, rp.title
         FROM repair_outcomes ro JOIN repair_plans rp ON rp.id=ro.repair_plan_id
        WHERE ro.journey_id=$1 ORDER BY repair_plan_id, measured_at DESC`, [journeyId])).rows);
}

export async function outcomeSummary(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(
      `SELECT DISTINCT ON (repair_plan_id) status FROM repair_outcomes WHERE journey_id=$1 ORDER BY repair_plan_id, measured_at DESC`, [journeyId])).rows;
    const summary: Record<string, number> = { improved: 0, early_signal: 0, awaiting_data: 0, no_change: 0, worsened: 0, inconclusive: 0 };
    for (const r of rows) summary[r.status] = (summary[r.status] ?? 0) + 1;
    return { total: rows.length, summary };
  });
}

export async function confirmOutcome(tenantId: string, outcomeId: string) {
  return withTenant(tenantId, async (c) => {
    const o = await c.query(`SELECT repair_plan_id, leak_id, status FROM repair_outcomes WHERE id=$1`, [outcomeId]);
    if (!o.rowCount) return { ok: false };
    await c.query(`UPDATE repair_outcomes SET confirmed=TRUE WHERE id=$1`, [outcomeId]);
    // only when the user confirms an improvement do we resolve the leak.
    if (o.rows[0].status === 'improved' && o.rows[0].leak_id) {
      await c.query(`UPDATE leak_findings SET status='resolved', resolved_at=now() WHERE id=$1`, [o.rows[0].leak_id]);
      await c.query(`UPDATE repair_plans SET status='applied' WHERE id=$1`, [o.rows[0].repair_plan_id]);
      await emit(c, 'repair_confirmed_success', { outcomeId });
    }
    return { ok: true };
  });
}

/** Basic learning aggregation (no benchmark dashboard — just structured rollup). */
export async function learningAggregate(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(
      `SELECT repair_type, market, success_status, COUNT(*)::int AS n
         FROM repair_learning_records GROUP BY repair_type, market, success_status ORDER BY repair_type`)).rows;
    return rows;
  });
}
