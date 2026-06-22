import { withTenant } from '../../../packages/db/src/router.js';
import { detectOpportunities, valueSummary, type OpportunityInputs, type OppLead, type OppPaymentState, type OppLeak, type OppTransfer } from './engine.js';
import { computeServiceWindow } from '../../realtime/src/service-window.js';

/**
 * Revenue opportunity service. Gathers real records, runs the pure engine, and
 * persists opportunities idempotently (one live row per dedupe_key). Resolves
 * from observed events (paid / delivered / task done), never fakes a capture.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'opportunities',$2)`, [type, JSON.stringify(payload ?? {})]);
}

async function logStatus(c: any, oppId: string, from: string | null, to: string, by: string, reason: string) {
  await c.query(`INSERT INTO opportunity_status_history (opportunity_id, from_status, to_status, changed_by, reason) VALUES ($1,$2,$3,$4,$5)`,
    [oppId, from, to, by, reason]);
}

/** Gather opportunity inputs for one funnel from real records. */
async function gatherInputs(c: any, journeyId: string): Promise<OpportunityInputs> {
  const leadRows = (await c.query(
    `SELECT l.id, l.name, l.stage, l.next_action AS "nextAction", l.last_inbound_at,
            EXTRACT(EPOCH FROM (now() - COALESCE(l.stage_changed_at, l.created_at)))/3600 AS stage_age_hours,
            EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=l.id AND t.done=FALSE) AS has_followup_task
       FROM leads l WHERE l.funnel_id=$1 AND l.deleted_at IS NULL
        AND l.stage NOT IN ('paid','access_delivered','lost')`, [journeyId])).rows;
  const leads: OppLead[] = leadRows.map((r: any) => ({
    id: r.id, name: r.name, stage: r.stage, nextAction: r.nextAction,
    stageAgeHours: Number(r.stage_age_hours ?? 0),
    serviceWindow: computeServiceWindow(r.last_inbound_at ? new Date(r.last_inbound_at) : null).status,
    hasFollowupTask: r.has_followup_task,
  }));

  const payRows = (await c.query(
    `SELECT ps.lead_id, ps.state, ps.amount, ps.currency, ps.proof_received, ps.access_delivered,
            EXTRACT(EPOCH FROM (now() - ps.updated_at))/3600 AS proof_age_hours,
            EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=ps.lead_id AND t.done=FALSE AND t.kind='confirm_proof') AS has_review_task,
            EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=ps.lead_id AND t.done=FALSE AND t.kind='deliver') AS has_delivery_task
       FROM payment_states ps JOIN leads l ON l.id=ps.lead_id
      WHERE l.funnel_id=$1 AND l.deleted_at IS NULL`, [journeyId]).catch(() => ({ rows: [] }))).rows;
  const payments: OppPaymentState[] = payRows.map((r: any) => ({
    leadId: r.lead_id, state: r.state, amount: r.amount != null ? Number(r.amount) : null, currency: r.currency,
    proofReceived: !!r.proof_received, accessDelivered: !!r.access_delivered,
    proofAgeHours: r.proof_age_hours != null ? Number(r.proof_age_hours) : null,
    hasReviewTask: !!r.has_review_task, hasDeliveryTask: !!r.has_delivery_task,
  }));

  const leakRows = (await c.query(
    `SELECT lf.id, lf.severity, lf.lane,
            EXISTS (SELECT 1 FROM repair_plans rp WHERE rp.leak_id=lf.id AND rp.status NOT IN ('rejected')) AS has_repair_plan
       FROM leak_findings lf WHERE lf.journey_id=$1 AND lf.status IN ('open','fixing')`, [journeyId]).catch(() => ({ rows: [] }))).rows;
  const leaks: OppLeak[] = leakRows.map((r: any) => ({ id: r.id, severity: r.severity, lane: r.lane, hasRepairPlan: !!r.has_repair_plan, enoughData: true }));

  // transferable playbooks targeting this funnel (from portfolio insights)
  const transRows = (await c.query(
    `SELECT evidence FROM portfolio_insights WHERE insight_type='transferable_playbook' AND status='open'
        AND evidence->>'target'=$1`, [journeyId]).catch(() => ({ rows: [] }))).rows;
  const transfers: OppTransfer[] = transRows.map((r: any) => {
    const e = typeof r.evidence === 'string' ? JSON.parse(r.evidence) : r.evidence;
    return { sourceFunnel: e.source, targetFunnel: e.target, playbookType: e.playbookType, confidence: 'medium' as const };
  });

  return { leads, payments, leaks, transfers };
}

/** Refresh opportunities for a funnel: detect, upsert idempotently, expire gone ones. */
export async function refreshOpportunities(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const businessId = (await c.query(`SELECT business_id FROM journeys WHERE id=$1`, [journeyId])).rows[0]?.business_id ?? null;
    const inputs = await gatherInputs(c, journeyId);
    const cands = detectOpportunities(inputs);
    const liveKeys = new Set(cands.map((x) => x.dedupeKey));

    // learning feedback: adjust score per type without overriding obvious urgency
    const { aggregateLearning, applyLearningToScore } = await import('./outcome-engine.js');
    const learnRows = (await c.query(`SELECT opportunity_type AS "opportunityType", status, captured_value AS "capturedValue", time_to_capture_minutes AS "timeToCaptureMinutes" FROM opportunity_learning_records`).catch(() => ({ rows: [] }))).rows;
    const learnMap: Record<string, any> = {};
    for (const l of aggregateLearning(learnRows as any)) learnMap[l.opportunityType] = l;
    // attribution learning: which action to recommend first per opportunity type
    const { aggregateAttribution, recommendedAction } = await import('../../attribution/src/engine.js');
    const attrRows = (await c.query(`SELECT attribution_id AS "sourceId", attributed_action_type AS "attributedActionType", opportunity_type AS "opportunityType", captured, captured_value AS "capturedValue", time_delta_minutes AS "timeDeltaMinutes" FROM attribution_learning_records`).catch(() => ({ rows: [] }))).rows;
    const attrLearning = aggregateAttribution(attrRows as any);
    const ACTION_AR: Record<string, string> = { task_completed: 'إكمال مهمة', whatsapp_reply_marked_sent: 'إرسال ردّ واتساب', payment_reminder_drafted: 'تذكير دفع', proof_review_task: 'مراجعة إثبات', access_delivery_task: 'مهمة تسليم', repair_plan_applied: 'تطبيق إصلاح', playbook_application_applied: 'تطبيق playbook' };

    let created = 0, updated = 0;
    for (const o of cands) {
      const adj = applyLearningToScore(o.priorityScore, o.urgency, learnMap[o.opportunityType]);
      const score = adj.score;
      const rec = recommendedAction(o.opportunityType, attrLearning);
      const recNote = rec ? `الإجراء الأكثر تأثيرًا تاريخيًا: ${ACTION_AR[rec.actionType] ?? rec.actionType}.` : null;
      const evidence: any = { ...o.evidence };
      if (adj.note) evidence.learningNote = adj.note;
      if (recNote) evidence.attributionNote = recNote;
      const existing = (await c.query(
        `SELECT id, status FROM revenue_opportunities WHERE dedupe_key=$1 AND status IN ('open','in_progress')`, [o.dedupeKey])).rows[0];
      if (existing) {
        // refresh score/urgency/evidence; never override a user's in_progress
        await c.query(
          `UPDATE revenue_opportunities SET priority_score=$2, urgency=$3, confidence=$4, evidence=$5,
              estimated_value=$6, value_currency=$7, explanation=$8, updated_at=now() WHERE id=$1`,
          [existing.id, score, o.urgency, o.confidence, JSON.stringify(evidence), o.estimatedValue, o.valueCurrency, o.explanation]);
        updated++;
      } else {
        // skip recreating something the user recently dismissed (24h cooldown)
        const dismissed = (await c.query(
          `SELECT 1 FROM revenue_opportunities WHERE dedupe_key=$1 AND status='dismissed' AND updated_at > now() - INTERVAL '24 hours' LIMIT 1`, [o.dedupeKey])).rowCount;
        if (dismissed) continue;
        const ins = await c.query(
          `INSERT INTO revenue_opportunities (funnel_id, business_id, opportunity_type, dedupe_key, title, explanation, evidence,
              affected_objects, estimated_value, value_currency, confidence, priority_score, urgency, recommended_action, source, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'open') RETURNING id`,
          [journeyId, businessId, o.opportunityType, o.dedupeKey, o.title, o.explanation, JSON.stringify(evidence),
           JSON.stringify(o.affectedObjects), o.estimatedValue, o.valueCurrency, o.confidence, score, o.urgency, o.recommendedAction, o.source]);
        await logStatus(c, ins.rows[0].id, null, 'open', 'system', 'detected');
        created++;
      }
    }

    // expire opportunities that no longer appear (the underlying condition cleared)
    const open = (await c.query(`SELECT id, dedupe_key FROM revenue_opportunities WHERE funnel_id=$1 AND status IN ('open','in_progress')`, [journeyId])).rows;
    let expired = 0;
    for (const row of open) {
      if (!liveKeys.has(row.dedupe_key)) {
        // confirm it's resolved (paid/delivered/done) vs merely gone — mark captured if resolved, else expired
        const resolved = await isResolved(c, row.dedupe_key);
        const to = resolved ? 'captured' : 'expired';
        await c.query(`UPDATE revenue_opportunities SET status=$2, resolved_at=now(), updated_at=now() WHERE id=$1`, [row.id, to]);
        await logStatus(c, row.id, 'open', to, 'system', resolved ? 'underlying resolved' : 'condition cleared');
        expired++;
      }
    }
    await emit(c, 'opportunities_refreshed', { journeyId, created, updated, expired });
    return { created, updated, expired, total: cands.length };
  });
}

/** Is the underlying condition resolved (paid/delivered)? Used to decide captured vs expired. */
async function isResolved(c: any, dedupeKey: string): Promise<boolean> {
  const [kind, leadId] = dedupeKey.split(':');
  if (!leadId) return false;
  if (kind === 'delivery') return ((await c.query(`SELECT 1 FROM payment_states WHERE lead_id=$1 AND access_delivered=TRUE LIMIT 1`, [leadId])).rowCount ?? 0) > 0;
  if (kind === 'waiting' || kind === 'proof') return ((await c.query(`SELECT 1 FROM leads WHERE id=$1 AND stage IN ('paid','access_delivered') LIMIT 1`, [leadId])).rowCount ?? 0) > 0;
  return false;
}

export async function listOpportunities(tenantId: string, journeyId: string | null, filter = 'all') {
  return withTenant(tenantId, async (c) => {
    const where: string[] = [`status IN ('open','in_progress')`];
    const params: any[] = [];
    if (journeyId) { params.push(journeyId); where.push(`funnel_id=$${params.length}`); }
    if (filter === 'payment') where.push(`opportunity_type IN ('waiting_payment_recovery','proof_review','access_delivery','payment_method_fix')`);
    else if (filter === 'whatsapp') where.push(`opportunity_type='whatsapp_first_reply'`);
    else if (filter === 'followup') where.push(`opportunity_type='followup_reactivation'`);
    else if (filter === 'leaks') where.push(`opportunity_type='leak_repair'`);
    else if (filter === 'playbooks') where.push(`opportunity_type='playbook_application'`);
    else if (filter === 'high_value') where.push(`estimated_value IS NOT NULL`);
    else if (filter === 'urgent') where.push(`urgency IN ('high','critical')`);
    return (await c.query(`SELECT * FROM revenue_opportunities WHERE ${where.join(' AND ')} ORDER BY priority_score DESC, created_at DESC`, params)).rows;
  });
}

export async function getOpportunity(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const opp = (await c.query(`SELECT * FROM revenue_opportunities WHERE id=$1`, [id])).rows[0];
    if (!opp) return null;
    const history = (await c.query(`SELECT * FROM opportunity_status_history WHERE opportunity_id=$1 ORDER BY created_at`, [id])).rows;
    return { opportunity: opp, history };
  });
}

async function transition(tenantId: string, id: string, to: string, by: string, reason: string) {
  return withTenant(tenantId, async (c) => {
    const cur = (await c.query(`SELECT status FROM revenue_opportunities WHERE id=$1`, [id])).rows[0];
    if (!cur) return { error: 'not found' };
    await c.query(`UPDATE revenue_opportunities SET status=$2, updated_at=now(), acted_at=CASE WHEN $2='in_progress' THEN COALESCE(acted_at, now()) ELSE acted_at END, resolved_at=CASE WHEN $2 IN ('captured','dismissed','expired') THEN now() ELSE resolved_at END WHERE id=$1`, [id, to]);
    await logStatus(c, id, cur.status, to, by, reason);
    await emit(c, `opportunity_${to}`, { id });
    return { ok: true, status: to };
  });
}

export const markInProgress = (t: string, id: string) => transition(t, id, 'in_progress', 'user', 'marked in progress');
export const markCaptured = (t: string, id: string) => transition(t, id, 'captured', 'user', 'marked captured');
export const dismissOpportunity = (t: string, id: string) => transition(t, id, 'dismissed', 'user', 'dismissed by user');

/** Create a follow-up/review/delivery task from an opportunity (no auto-send). */
export async function createTaskForOpportunity(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const o = (await c.query(`SELECT * FROM revenue_opportunities WHERE id=$1`, [id])).rows[0];
    if (!o) return { error: 'not found' };
    const affected = typeof o.affected_objects === 'string' ? JSON.parse(o.affected_objects) : o.affected_objects;
    const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;
    const kindMap: Record<string, string> = { proof_review: 'confirm_proof', access_delivery: 'deliver', waiting_payment_recovery: 'whatsapp_followup', whatsapp_first_reply: 'whatsapp_followup', followup_reactivation: 'whatsapp_followup' };
    const kind = kindMap[o.opportunity_type] ?? 'whatsapp_followup';
    const task = await c.query(
      `INSERT INTO tasks (funnel_id, lead_id, title, kind, done, due_at) VALUES ($1,$2,$3,$4,FALSE, now() + INTERVAL '1 day') RETURNING id`,
      [o.funnel_id, leadId, o.title, kind]).catch(() => null);
    if (!task) return { error: 'could not create task' };
    await c.query(`UPDATE revenue_opportunities SET linked_task_id=$2, status='in_progress', acted_at=COALESCE(acted_at, now()), updated_at=now() WHERE id=$1`, [id, task.rows[0].id]);
    await logStatus(c, id, o.status, 'in_progress', 'user', 'task created');
    return { ok: true, taskId: task.rows[0].id };
  });
}

/** Honest summary for dashboard + weekly report. */
export async function opportunitySummary(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const where = journeyId ? `AND funnel_id=$1` : '';
    const params = journeyId ? [journeyId] : [];
    const open = (await c.query(`SELECT id, opportunity_type, title, priority_score, urgency, confidence, estimated_value, value_currency FROM revenue_opportunities WHERE status IN ('open','in_progress') ${where} ORDER BY priority_score DESC`, params)).rows;
    const captured = (await c.query(`SELECT COUNT(*)::int AS n FROM revenue_opportunities WHERE status='captured' ${where} AND resolved_at > now() - INTERVAL '7 days'`, params)).rows[0].n;
    const vs = valueSummary(open.map((o: any) => ({ estimatedValue: o.estimated_value != null ? Number(o.estimated_value) : null, valueCurrency: o.value_currency })));
    return { open: open.length, top: open[0] ?? null, capturedThisWeek: captured, value: vs };
  });
}
