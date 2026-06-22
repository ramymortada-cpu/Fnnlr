import { withTenant, withTenantTx } from '../../../packages/db/src/router.js';
import { interpretRecommendationOutcome, aggregateRecLearning, type RecSignals, type RecLearningRecord, type RecTypeLearning } from './outcome-engine.js';

/**
 * Recommendation outcome loop. Gathers observed signals for an applied
 * recommendation, runs the pure engine, persists an outcome + a learning record,
 * and links to attribution. No fabricated success — every `worked` is evidence-based.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'recommendations',$2)`, [type, JSON.stringify(payload ?? {})]);
}

async function gatherSignals(c: any, rec: any): Promise<RecSignals> {
  const appliedHoursAgo = rec.applied_at ? (Date.now() - new Date(rec.applied_at).getTime()) / 3600_000 : null;
  const s: RecSignals = { recommendationType: rec.recommendation_type, appliedHoursAgo, dismissed: rec.status === 'dismissed' };

  // linked object
  if (rec.linked_object_type === 'task' && rec.linked_object_id) {
    const task = (await c.query(`SELECT done, due_at FROM tasks WHERE id=$1`, [rec.linked_object_id]).catch(() => ({ rows: [] }))).rows[0];
    if (task) { s.taskCompleted = !!task.done; s.taskOverdue = task.due_at ? new Date(task.due_at).getTime() < Date.now() && !task.done : false; }
  }
  if (rec.linked_object_type === 'whatsapp_draft' && rec.linked_object_id) {
    const d = (await c.query(`SELECT marked_sent FROM whatsapp_draft_replies WHERE id=$1`, [rec.linked_object_id]).catch(() => ({ rows: [] }))).rows[0];
    if (d) s.draftMarkedSent = !!d.marked_sent;
  }

  // lead movement
  if (rec.lead_id) {
    const lead = (await c.query(`SELECT stage, last_inbound_at FROM leads WHERE id=$1`, [rec.lead_id]).catch(() => ({ rows: [] }))).rows[0];
    if (lead) {
      s.leadProgressed = !['new', 'whatsapp_clicked', 'lost'].includes(lead.stage);
      s.leadLost = lead.stage === 'lost';
      if (lead.last_inbound_at && rec.applied_at) s.inboundAfterApply = new Date(lead.last_inbound_at).getTime() > new Date(rec.applied_at).getTime();
    }
    const pay = (await c.query(`SELECT state, access_delivered, proof_received FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [rec.lead_id]).catch(() => ({ rows: [] }))).rows[0];
    if (pay) { s.paymentConfirmed = pay.state === 'confirmed'; s.accessDelivered = !!pay.access_delivered; s.proofReviewed = pay.state === 'confirmed' || !!pay.access_delivered; }
  }

  // opportunity capture + attribution linkage
  if (rec.opportunity_id) {
    const opp = (await c.query(`SELECT status, last_outcome_status FROM revenue_opportunities WHERE id=$1`, [rec.opportunity_id]).catch(() => ({ rows: [] }))).rows[0];
    if (opp) s.opportunityCaptured = opp.status === 'captured' || opp.last_outcome_status === 'captured';
    const attr = (await c.query(`SELECT attributed_object_id, attribution_strength, captured_value, currency FROM revenue_attributions WHERE opportunity_id=$1 ORDER BY created_at DESC LIMIT 1`, [rec.opportunity_id]).catch(() => ({ rows: [] }))).rows[0];
    if (attr) {
      s.attributionStrength = attr.attribution_strength;
      // attribution points HERE if it credits the object this recommendation created
      s.attributionPointsHere = !!(rec.linked_object_id && attr.attributed_object_id && attr.attributed_object_id === rec.linked_object_id);
      s.capturedValue = attr.captured_value != null ? Number(attr.captured_value) : null;
      s.currency = attr.currency;
    }
  }

  // repair / playbook improvement (for those rec types)
  if (rec.recommendation_type === 'build_repair_plan' && rec.opportunity_id) {
    const imp = (await c.query(
      `SELECT 1 FROM repair_plans rp JOIN repair_outcomes o ON o.repair_plan_id=rp.id
        WHERE o.status IN ('early_signal','improved') AND rp.leak_id IN (
          SELECT (jsonb_array_elements(affected_objects)->>'id')::uuid FROM revenue_opportunities WHERE id=$1 AND affected_objects @> '[{"type":"leak"}]'
        ) LIMIT 1`, [rec.opportunity_id]).catch(() => ({ rowCount: 0 }))).rowCount;
    s.repairImproved = (imp ?? 0) > 0;
  }
  if (rec.recommendation_type === 'apply_playbook' && rec.funnel_id) {
    const imp = (await c.query(
      `SELECT 1 FROM playbook_application_plans ap JOIN playbook_application_outcomes o ON o.application_plan_id=ap.id
        WHERE ap.funnel_id=$1 AND o.status IN ('early_signal','improved') LIMIT 1`, [rec.funnel_id]).catch(() => ({ rowCount: 0 }))).rowCount;
    s.applicationImproved = (imp ?? 0) > 0;
  }

  return s;
}

/** Check (or re-check) a recommendation's outcome now. Persists outcome + learning. */
export async function checkRecommendationOutcome(tenantId: string, recommendationId: string) {
  return withTenantTx(tenantId, async (c) => {
    const rec = (await c.query(`SELECT * FROM action_recommendations WHERE id=$1`, [recommendationId])).rows[0];
    if (!rec) return null;
    const signals = await gatherSignals(c, rec);
    const result = interpretRecommendationOutcome(signals);

    const minH: Record<string, number> = { draft_whatsapp_reply: 24, draft_payment_reminder: 24, deliver_access: 12, apply_playbook: 48, update_page_cta: 48 };
    const windowStart = rec.applied_at;
    const windowEnd = rec.applied_at ? new Date(new Date(rec.applied_at).getTime() + (minH[rec.recommendation_type] ?? 24) * 3600_000) : null;
    const timeToResult = result.status === 'worked' && rec.applied_at ? Math.round((Date.now() - new Date(rec.applied_at).getTime()) / 60000) : null;

    await c.query(`UPDATE recommendation_outcomes SET is_latest=FALSE WHERE recommendation_id=$1 AND is_latest=TRUE`, [recommendationId]);
    const outRow = await c.query(
      `INSERT INTO recommendation_outcomes (recommendation_id, opportunity_id, funnel_id, business_id, recommendation_type, applied_at, window_start, window_end,
          status, evidence, attributed_to_recommendation, captured_value, currency, confidence, interpretation, recommended_next_action, is_latest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE) RETURNING id`,
      [recommendationId, rec.opportunity_id, rec.funnel_id, rec.business_id, rec.recommendation_type, rec.applied_at, windowStart, windowEnd,
       result.status, JSON.stringify(result.evidence), result.attributedToRecommendation, result.capturedValue, result.currency, result.confidence, result.interpretation, result.recommendedNextAction]);
    const recOutcomeId = outRow.rows[0].id;

    await c.query(
      `INSERT INTO recommendation_learning_records (recommendation_outcome_id, recommendation_id, recommendation_type, status, confidence, captured_value, time_to_result_minutes, priority_score_at_recommendation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (recommendation_outcome_id) DO NOTHING`,
      [recOutcomeId, recommendationId, rec.recommendation_type, result.status, result.confidence, result.capturedValue, timeToResult, rec.priority_score]);
    await c.query(`DELETE FROM recommendation_learning_records WHERE recommendation_id=$1 AND recommendation_outcome_id <> $2`, [recommendationId, recOutcomeId]);

    await c.query(`UPDATE action_recommendations SET last_outcome_status=$2, updated_at=now() WHERE id=$1`, [recommendationId, result.status]);
    await emit(c, 'recommendation_outcome_checked', { recommendationId, status: result.status });
    return { ...result, timeToResult };
  });
}

export async function getRecommendationOutcome(tenantId: string, recommendationId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM recommendation_outcomes WHERE recommendation_id=$1 ORDER BY created_at DESC LIMIT 1`, [recommendationId])).rows[0] ?? null);
}

/** User-confirmed outcome (worked / no_result) with a reason. */
export async function markRecOutcome(tenantId: string, recommendationId: string, status: 'worked' | 'no_result', reason: string) {
  return withTenantTx(tenantId, async (c) => {
    const rec = (await c.query(`SELECT * FROM action_recommendations WHERE id=$1`, [recommendationId])).rows[0];
    if (!rec) return { error: 'not found' };
    await c.query(`UPDATE recommendation_outcomes SET is_latest=FALSE WHERE recommendation_id=$1 AND is_latest=TRUE`, [recommendationId]);
    const outRow = await c.query(
      `INSERT INTO recommendation_outcomes (recommendation_id, opportunity_id, funnel_id, business_id, recommendation_type, applied_at, status, evidence, confidence, interpretation, is_latest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'high',$9,TRUE) RETURNING id`,
      [recommendationId, rec.opportunity_id, rec.funnel_id, rec.business_id, rec.recommendation_type, rec.applied_at, status, JSON.stringify({ userReason: reason }), `أكّد المستخدم: ${reason}`]);
    const recOutcomeId = outRow.rows[0].id;
    await c.query(
      `INSERT INTO recommendation_learning_records (recommendation_outcome_id, recommendation_id, recommendation_type, status, confidence, priority_score_at_recommendation)
       VALUES ($1,$2,$3,$4,'high',$5) ON CONFLICT (recommendation_outcome_id) DO NOTHING`,
      [recOutcomeId, recommendationId, rec.recommendation_type, status, rec.priority_score]);
    await c.query(`DELETE FROM recommendation_learning_records WHERE recommendation_id=$1 AND recommendation_outcome_id <> $2`, [recommendationId, recOutcomeId]);
    await c.query(`UPDATE action_recommendations SET last_outcome_status=$2, updated_at=now() WHERE id=$1`, [recommendationId, status]);
    return { ok: true, status };
  });
}

/** Roll up recommendation learning by type. */
export async function getRecLearning(tenantId: string): Promise<RecTypeLearning[]> {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(`SELECT recommendation_outcome_id AS "sourceId", recommendation_type AS "recommendationType", status, captured_value AS "capturedValue", time_to_result_minutes AS "timeToResultMinutes" FROM recommendation_learning_records`).catch(() => ({ rows: [] }))).rows;
    return aggregateRecLearning(rows as RecLearningRecord[]);
  });
}

export async function recOutcomesSummary(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const where = journeyId ? `WHERE funnel_id=$1` : ''; const params = journeyId ? [journeyId] : [];
    const rows = (await c.query(
      `SELECT status, COUNT(*)::int AS n, SUM(captured_value) AS val FROM (
         SELECT DISTINCT ON (recommendation_id) recommendation_id, status, captured_value, funnel_id FROM recommendation_outcomes ${where} ORDER BY recommendation_id, created_at DESC
       ) s GROUP BY status`, params)).rows;
    const summary: Record<string, number> = { worked: 0, no_result: 0, failed: 0, awaiting_evidence: 0, early_signal: 0, dismissed: 0, inconclusive: 0 };
    let knownValue = 0;
    for (const r of rows) { summary[r.status] = r.n; if (r.status === 'worked' && r.val) knownValue += Number(r.val); }
    return { summary, knownValueCaptured: knownValue > 0 ? knownValue : null };
  });
}
