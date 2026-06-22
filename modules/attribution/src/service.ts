import { withTenant, withTenantTx } from '../../../packages/db/src/router.js';
import { attributeCapture, aggregateAttribution, recommendedAction, type CandidateAction, type ActionType, type AttrLearningRecord, type ActionLearning } from './engine.js';

/**
 * Revenue attribution service. For a captured opportunity, gathers candidate
 * actions from the timeline, runs the pure engine, and persists an attribution +
 * a learning record. Evidence-weighted association, never causal proof.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'attribution',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const minsBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 60000;

/** Gather candidate actions that occurred before the capture time. */
async function gatherCandidates(c: any, opp: any, capturedAt: Date): Promise<CandidateAction[]> {
  const affected = typeof opp.affected_objects === 'string' ? JSON.parse(opp.affected_objects) : (opp.affected_objects ?? []);
  const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;
  const leakId = (affected ?? []).find((a: any) => a.type === 'leak')?.id ?? null;
  const targetFunnel = (affected ?? []).find((a: any) => a.type === 'funnel')?.id ?? null;
  const cands: CandidateAction[] = [];

  if (leadId) {
    // completed tasks on this lead
    const tasks = (await c.query(`SELECT id, kind, done_at FROM tasks WHERE lead_id=$1 AND done=TRUE AND done_at IS NOT NULL AND done_at <= $2`, [leadId, capturedAt]).catch(() => ({ rows: [] }))).rows;
    for (const t of tasks) {
      const at: ActionType = t.kind === 'confirm_proof' ? 'proof_review_task' : t.kind === 'deliver' ? 'access_delivery_task' : 'task_completed';
      cands.push({ actionType: at, objectId: t.id, minutesBeforeCapture: minsBetween(new Date(t.done_at), capturedAt), direct: true });
    }
    // whatsapp replies marked sent
    const drafts = (await c.query(`SELECT id, sent_at FROM whatsapp_draft_replies WHERE lead_id=$1 AND marked_sent=TRUE AND sent_at IS NOT NULL AND sent_at <= $2`, [leadId, capturedAt]).catch(() => ({ rows: [] }))).rows;
    for (const d of drafts) cands.push({ actionType: 'whatsapp_reply_marked_sent', objectId: d.id, minutesBeforeCapture: minsBetween(new Date(d.sent_at), capturedAt), direct: true });
  }

  if (leakId) {
    const repair = (await c.query(
      `SELECT rp.id, rp.applied_at, (SELECT status FROM repair_outcomes o WHERE o.repair_plan_id=rp.id ORDER BY measured_at DESC LIMIT 1) AS outcome
         FROM repair_plans rp WHERE rp.leak_id=$1 AND rp.applied_at IS NOT NULL AND rp.applied_at <= $2 ORDER BY rp.applied_at DESC LIMIT 1`, [leakId, capturedAt]).catch(() => ({ rows: [] }))).rows[0];
    if (repair) cands.push({ actionType: 'repair_plan_applied', objectId: repair.id, minutesBeforeCapture: minsBetween(new Date(repair.applied_at), capturedAt), direct: true, outcomeImproved: ['early_signal', 'improved'].includes(repair.outcome) });
  }

  if (targetFunnel && opp.opportunity_type === 'playbook_application') {
    const app = (await c.query(
      `SELECT ap.id, ap.applied_at, (SELECT status FROM playbook_application_outcomes o WHERE o.application_plan_id=ap.id ORDER BY measured_at DESC LIMIT 1) AS outcome
         FROM playbook_application_plans ap WHERE ap.funnel_id=$1 AND ap.applied_at IS NOT NULL AND ap.applied_at <= $2 ORDER BY ap.applied_at DESC LIMIT 1`, [targetFunnel, capturedAt]).catch(() => ({ rows: [] }))).rows[0];
    if (app) cands.push({ actionType: 'playbook_application_applied', objectId: app.id, minutesBeforeCapture: minsBetween(new Date(app.applied_at), capturedAt), direct: true, outcomeImproved: ['early_signal', 'improved'].includes(app.outcome) });
  }

  // command-bar applied actions on this funnel before capture (indirect unless lead-linked)
  if (opp.funnel_id) {
    const cmds = (await c.query(
      `SELECT id, created_at, action_kind FROM commands WHERE funnel_id=$1 AND action_kind IS NOT NULL AND created_at <= $2 AND created_at >= $2 - INTERVAL '4 days' ORDER BY created_at DESC LIMIT 3`, [opp.funnel_id, capturedAt]).catch(() => ({ rows: [] }))).rows;
    for (const cm of cmds) cands.push({ actionType: 'command_applied', objectId: cm.id, minutesBeforeCapture: minsBetween(new Date(cm.created_at), capturedAt), direct: false });
  }

  return cands;
}

/** Run attribution for a captured opportunity. Persists attribution + learning. */
export async function runAttribution(tenantId: string, opportunityId: string) {
  return withTenantTx(tenantId, async (c) => {
    const opp = (await c.query(`SELECT * FROM revenue_opportunities WHERE id=$1`, [opportunityId])).rows[0];
    if (!opp) return null;
    // only attribute a captured opportunity
    const lastOutcome = (await c.query(`SELECT outcome_status, captured_value, value_currency, resolved_at FROM opportunity_outcomes WHERE opportunity_id=$1 ORDER BY created_at DESC LIMIT 1`, [opportunityId])).rows[0];
    if (!lastOutcome || lastOutcome.outcome_status !== 'captured') return { notCaptured: true };

    const capturedAt = lastOutcome.resolved_at ? new Date(lastOutcome.resolved_at) : new Date(opp.resolved_at ?? Date.now());
    const candidates = await gatherCandidates(c, opp, capturedAt);
    const result = attributeCapture({ opportunityType: opp.opportunity_type, capturedValue: lastOutcome.captured_value, currency: lastOutcome.value_currency, candidates });

    const affected = typeof opp.affected_objects === 'string' ? JSON.parse(opp.affected_objects) : (opp.affected_objects ?? []);
    const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;

    // one attribution per opportunity capture: clear any prior attribution + its learning,
    // then write fresh. Re-running on the same capture updates rather than inflates.
    await c.query(`DELETE FROM attribution_learning_records WHERE opportunity_id=$1`, [opportunityId]);
    await c.query(`DELETE FROM revenue_attributions WHERE opportunity_id=$1`, [opportunityId]);
    const attrRow = await c.query(
      `INSERT INTO revenue_attributions (opportunity_id, lead_id, funnel_id, business_id, captured_event_type, captured_at, captured_value, currency,
          attributed_action_type, attributed_object_id, attribution_strength, confidence, time_delta_minutes, evidence, explanation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
      [opportunityId, leadId, opp.funnel_id, opp.business_id, opp.opportunity_type, capturedAt, lastOutcome.captured_value, lastOutcome.value_currency,
       result.attributedActionType, result.attributedObjectId, result.strength, result.confidence, result.timeDeltaMinutes, JSON.stringify(result.evidence), result.explanation]);
    const attributionId = attrRow.rows[0].id;

    // learning record keyed 1:1 to this attribution (unknown still recorded, but won't be recommended)
    const biz = await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }));
    await c.query(
      `INSERT INTO attribution_learning_records (attribution_id, opportunity_id, attributed_action_type, opportunity_type, market, captured, captured_value, confidence, time_delta_minutes)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8) ON CONFLICT (attribution_id) DO NOTHING`,
      [attributionId, opportunityId, result.attributedActionType, opp.opportunity_type, biz.rows[0]?.market ?? null, lastOutcome.captured_value, result.confidence, result.timeDeltaMinutes]);

    await emit(c, 'attribution_computed', { opportunityId, action: result.attributedActionType, strength: result.strength });
    return result;
  });
}

export async function getAttribution(tenantId: string, opportunityId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM revenue_attributions WHERE opportunity_id=$1 ORDER BY created_at DESC LIMIT 1`, [opportunityId])).rows[0] ?? null);
}

/** Aggregate attribution learning by action type. */
export async function getAttributionLearning(tenantId: string): Promise<ActionLearning[]> {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(`SELECT attribution_id AS "sourceId", attributed_action_type AS "attributedActionType", opportunity_type AS "opportunityType", captured, captured_value AS "capturedValue", time_delta_minutes AS "timeDeltaMinutes" FROM attribution_learning_records`).catch(() => ({ rows: [] }))).rows;
    return aggregateAttribution(rows as AttrLearningRecord[]);
  });
}

/** The recommended first action for an opportunity type, from learning. */
export async function recommendedActionFor(tenantId: string, opportunityType: string) {
  const learning = await getAttributionLearning(tenantId);
  return recommendedAction(opportunityType, learning);
}

/** Summary for the attribution insights panel + weekly report. */
export async function attributionSummary(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const rows = (await c.query(
      `SELECT attributed_action_type, attribution_strength, COUNT(*)::int AS n, SUM(captured_value) AS val
         FROM revenue_attributions GROUP BY attributed_action_type, attribution_strength ORDER BY n DESC`).catch(() => ({ rows: [] }))).rows;
    const byAction: Record<string, { count: number; strong: number; knownValue: number }> = {};
    let unknown = 0;
    for (const r of rows) {
      if (r.attributed_action_type === 'unknown') { unknown += r.n; continue; }
      const a = (byAction[r.attributed_action_type] ??= { count: 0, strong: 0, knownValue: 0 });
      a.count += r.n; if (r.attribution_strength === 'strong') a.strong += r.n; if (r.val) a.knownValue += Number(r.val);
    }
    const top = Object.entries(byAction).map(([action, v]) => ({ action, ...v })).sort((a, b) => b.count - a.count).slice(0, 6);
    return { top, unknownAttribution: unknown };
  });
}
