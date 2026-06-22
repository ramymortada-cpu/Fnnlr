import { withTenant, withTenantTx } from '../../../packages/db/src/router.js';
import { interpretOpportunityOutcome, aggregateLearning, type OutcomeSignals, type LearningRecord, type TypeLearning } from './outcome-engine.js';

/**
 * Opportunity outcome loop. Gathers observed signals for an opportunity, runs the
 * pure engine, persists an outcome + a learning record, and rolls up learning by
 * type. No fabricated capture: every captured verdict is evidence-based.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'opportunities',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/** Gather observed signals for one opportunity from related records. */
async function gatherSignals(c: any, opp: any): Promise<OutcomeSignals> {
  const affected = typeof opp.affected_objects === 'string' ? JSON.parse(opp.affected_objects) : (opp.affected_objects ?? []);
  const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;
  const leakId = (affected ?? []).find((a: any) => a.type === 'leak')?.id ?? null;
  const targetFunnel = (affected ?? []).find((a: any) => a.type === 'funnel')?.id ?? null;
  const detectedHoursAgo = (Date.now() - new Date(opp.created_at).getTime()) / 3600_000;
  const acted = !!opp.acted_at || opp.status === 'in_progress' || !!opp.linked_task_id;

  const s: OutcomeSignals = { opportunityType: opp.opportunity_type, detectedHoursAgo, acted, amount: opp.estimated_value != null ? Number(opp.estimated_value) : null, currency: opp.value_currency };

  if (leadId) {
    const lead = (await c.query(`SELECT stage, last_inbound_at FROM leads WHERE id=$1`, [leadId])).rows[0];
    if (lead) {
      s.leadStage = lead.stage;
      s.leadLost = lead.stage === 'lost';
      s.contactedProgressed = ['contacted', 'qualified', 'price_sent'].includes(lead.stage);
      s.stageProgressed = !['new', 'whatsapp_clicked', 'lost'].includes(lead.stage);
      // inbound after detection
      if (lead.last_inbound_at) s.inboundAfterAction = new Date(lead.last_inbound_at).getTime() > new Date(opp.created_at).getTime();
    }
    const pay = (await c.query(`SELECT state, access_delivered, proof_received FROM payment_states WHERE lead_id=$1 ORDER BY updated_at DESC LIMIT 1`, [leadId])).rows[0];
    if (pay) {
      s.paymentConfirmed = pay.state === 'confirmed';
      s.accessDelivered = !!pay.access_delivered;
      s.paymentFailed = ['failed', 'cancelled'].includes(pay.state);
      s.proofReviewed = pay.state === 'confirmed' || !!pay.access_delivered;
    }
    const doneTask = (await c.query(`SELECT 1 FROM tasks WHERE lead_id=$1 AND done=TRUE LIMIT 1`, [leadId])).rowCount;
    s.taskCompleted = (doneTask ?? 0) > 0;
    // service window closed (no inbound within window)
    if (opp.opportunity_type === 'whatsapp_first_reply') {
      const { computeServiceWindow } = await import('../../realtime/src/service-window.js');
      s.serviceWindowClosed = computeServiceWindow(lead?.last_inbound_at ? new Date(lead.last_inbound_at) : null).status === 'closed';
    }
  }

  if (leakId) {
    const repair = (await c.query(
      `SELECT rp.status, (SELECT status FROM repair_outcomes o WHERE o.repair_plan_id=rp.id ORDER BY measured_at DESC LIMIT 1) AS outcome
         FROM repair_plans rp WHERE rp.leak_id=$1 ORDER BY rp.created_at DESC LIMIT 1`, [leakId]).catch(() => ({ rows: [] }))).rows[0];
    if (repair) {
      s.repairApplied = ['applied', 'partially_applied'].includes(repair.status);
      s.repairImproved = ['early_signal', 'improved'].includes(repair.outcome);
    }
  }

  if (targetFunnel && opp.opportunity_type === 'playbook_application') {
    const app = (await c.query(
      `SELECT ap.status, (SELECT status FROM playbook_application_outcomes o WHERE o.application_plan_id=ap.id ORDER BY measured_at DESC LIMIT 1) AS outcome
         FROM playbook_application_plans ap WHERE ap.funnel_id=$1 ORDER BY ap.created_at DESC LIMIT 1`, [targetFunnel]).catch(() => ({ rows: [] }))).rows[0];
    if (app) {
      s.applicationApplied = ['applied', 'partially_applied'].includes(app.status);
      s.applicationImproved = ['early_signal', 'improved'].includes(app.outcome);
    }
  }

  return s;
}

/** Check (or re-check) an opportunity's outcome now. Persists outcome + learning. */
export async function checkOpportunityOutcome(tenantId: string, opportunityId: string) {
  return withTenantTx(tenantId, async (c) => {
    const opp = (await c.query(`SELECT * FROM revenue_opportunities WHERE id=$1`, [opportunityId])).rows[0];
    if (!opp) return null;
    const signals = await gatherSignals(c, opp);
    const result = interpretOpportunityOutcome(signals);

    const detectedAt = opp.created_at;
    const actedAt = opp.acted_at ?? (opp.linked_task_id ? opp.updated_at : null);
    const timeToAction = actedAt ? Math.round((new Date(actedAt).getTime() - new Date(detectedAt).getTime()) / 60000) : null;
    const resolved = ['captured', 'missed', 'expired'].includes(result.status);
    const timeToCapture = result.status === 'captured' ? Math.round((Date.now() - new Date(detectedAt).getTime()) / 60000) : null;

    // ONE latest outcome row per opportunity: demote the prior latest, upsert this one.
    // History is preserved (older rows stay with is_latest=false); learning stays 1:1 with the latest.
    await c.query(`UPDATE opportunity_outcomes SET is_latest=FALSE WHERE opportunity_id=$1 AND is_latest=TRUE`, [opportunityId]);
    const outRow = await c.query(
      `INSERT INTO opportunity_outcomes (opportunity_id, funnel_id, business_id, opportunity_type, detected_at, acted_at, resolved_at,
          outcome_status, captured_value, value_currency, evidence, action_taken, time_to_action_minutes, time_to_capture_minutes, confidence, interpretation, is_latest)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE) RETURNING id`,
      [opportunityId, opp.funnel_id, opp.business_id, opp.opportunity_type, detectedAt, actedAt, resolved ? new Date() : null,
       result.status, result.capturedValue, result.valueCurrency, JSON.stringify(result.evidence), JSON.stringify({ acted: signals.acted }),
       timeToAction, timeToCapture, result.confidence, result.interpretation]);
    const outcomeId = outRow.rows[0].id;

    // learning record: UPSERT keyed on the opportunity (one per opportunity, latest status wins).
    // Re-measuring the SAME opportunity updates the SAME learning row — never inflates the sample.
    const biz = await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }));
    await c.query(
      `INSERT INTO opportunity_learning_records (opportunity_outcome_id, opportunity_id, opportunity_type, market, source, status, confidence, captured_value, time_to_capture_minutes, priority_score_at_detection, action_type_taken)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (opportunity_outcome_id) DO NOTHING`,
      [outcomeId, opportunityId, opp.opportunity_type, biz.rows[0]?.market ?? null, opp.source, result.status, result.confidence, result.capturedValue, timeToCapture, opp.priority_score, opp.linked_task_id ? 'task' : null]);
    // collapse any older learning rows for this opportunity so the sample is one-per-source
    await c.query(`DELETE FROM opportunity_learning_records WHERE opportunity_id=$1 AND opportunity_outcome_id <> $2`, [opportunityId, outcomeId]);

    // update the opportunity status when resolved by evidence (captured/expired/missed)
    if (resolved) {
      const to = result.status === 'captured' ? 'captured' : 'expired';
      await c.query(`UPDATE revenue_opportunities SET status=$2, last_outcome_status=$3, resolved_at=now(), updated_at=now() WHERE id=$1 AND status IN ('open','in_progress')`, [opportunityId, to, result.status]);
      await c.query(`INSERT INTO opportunity_status_history (opportunity_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,'system',$4)`, [opportunityId, opp.status, to, result.interpretation]);
    } else {
      await c.query(`UPDATE revenue_opportunities SET last_outcome_status=$2, updated_at=now() WHERE id=$1`, [opportunityId, result.status]);
    }
    await emit(c, 'opportunity_outcome_checked', { opportunityId, status: result.status });
    return { ...result, timeToAction, timeToCapture };
  }).then(async (r) => {
    // when captured, attribute the capture to the nearest strong action (own scope)
    if (r && (r as any).status === 'captured') {
      try { const { runAttribution } = await import('../../attribution/src/service.js'); await runAttribution(tenantId, opportunityId); } catch { /* non-fatal */ }
    }
    return r;
  });
}

export async function getOpportunityOutcome(tenantId: string, opportunityId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM opportunity_outcomes WHERE opportunity_id=$1 ORDER BY created_at DESC LIMIT 1`, [opportunityId])).rows[0] ?? null);
}

/** Mark captured/missed with an explicit user reason (user-confirmed path). */
export async function markOutcome(tenantId: string, opportunityId: string, status: 'captured' | 'missed', reason: string) {
  return withTenantTx(tenantId, async (c) => {
    const opp = (await c.query(`SELECT * FROM revenue_opportunities WHERE id=$1`, [opportunityId])).rows[0];
    if (!opp) return { error: 'not found' };
    await c.query(`UPDATE opportunity_outcomes SET is_latest=FALSE WHERE opportunity_id=$1 AND is_latest=TRUE`, [opportunityId]);
    const outRow = await c.query(
      `INSERT INTO opportunity_outcomes (opportunity_id, funnel_id, business_id, opportunity_type, detected_at, resolved_at, outcome_status, captured_value, value_currency, evidence, confidence, interpretation, is_latest)
       VALUES ($1,$2,$3,$4,$5, now(), $6,$7,$8,$9,'high',$10,TRUE) RETURNING id`,
      [opportunityId, opp.funnel_id, opp.business_id, opp.opportunity_type, opp.created_at, status, status === 'captured' ? opp.estimated_value : null, status === 'captured' ? opp.value_currency : null, JSON.stringify({ userReason: reason }), `أكّد المستخدم: ${reason}`]);
    const outcomeId = outRow.rows[0].id;
    await c.query(
      `INSERT INTO opportunity_learning_records (opportunity_outcome_id, opportunity_id, opportunity_type, source, status, confidence, captured_value, priority_score_at_detection)
       VALUES ($1,$2,$3,$4,$5,'high',$6,$7) ON CONFLICT (opportunity_outcome_id) DO NOTHING`,
      [outcomeId, opportunityId, opp.opportunity_type, opp.source, status, status === 'captured' ? opp.estimated_value : null, opp.priority_score]);
    await c.query(`DELETE FROM opportunity_learning_records WHERE opportunity_id=$1 AND opportunity_outcome_id <> $2`, [opportunityId, outcomeId]);
    await c.query(`UPDATE revenue_opportunities SET status=$2, last_outcome_status=$2, resolved_at=now(), updated_at=now() WHERE id=$1`, [opportunityId, status]);
    await c.query(`INSERT INTO opportunity_status_history (opportunity_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,'user',$4)`, [opportunityId, opp.status, status, reason]);
    return { ok: true, status };
  }).then(async (r) => {
    if (r && (r as any).status === 'captured') {
      try { const { runAttribution } = await import('../../attribution/src/service.js'); await runAttribution(tenantId, opportunityId); } catch { /* non-fatal */ }
    }
    return r;
  });
}

/** Roll up learning per opportunity type from learning records. */
export async function getLearning(tenantId: string): Promise<TypeLearning[]> {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(`SELECT opportunity_outcome_id AS "sourceId", opportunity_type AS "opportunityType", status, captured_value AS "capturedValue", time_to_capture_minutes AS "timeToCaptureMinutes" FROM opportunity_learning_records`)).rows;
    return aggregateLearning(rows as LearningRecord[]);
  });
}

/** A map of type → learning for fast scoring lookups. */
export async function getLearningMap(tenantId: string): Promise<Record<string, TypeLearning>> {
  const all = await getLearning(tenantId);
  const m: Record<string, TypeLearning> = {};
  for (const l of all) m[l.opportunityType] = l;
  return m;
}

/** Outcome summary for dashboard + weekly report. */
export async function outcomesSummary(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const where = journeyId ? `WHERE funnel_id=$1` : '';
    const params = journeyId ? [journeyId] : [];
    const rows = (await c.query(
      `SELECT outcome_status, COUNT(*)::int AS n, SUM(captured_value) AS val FROM (
         SELECT DISTINCT ON (opportunity_id) opportunity_id, outcome_status, captured_value, funnel_id FROM opportunity_outcomes ${where} ORDER BY opportunity_id, created_at DESC
       ) s GROUP BY outcome_status`, params)).rows;
    const summary: Record<string, number> = { captured: 0, missed: 0, expired: 0, awaiting_evidence: 0, inconclusive: 0 };
    let knownValue = 0;
    for (const r of rows) { summary[r.outcome_status] = r.n; if (r.outcome_status === 'captured' && r.val) knownValue += Number(r.val); }
    return { summary, knownValueCaptured: knownValue > 0 ? knownValue : null };
  });
}
