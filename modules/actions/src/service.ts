import { withTenant } from '../../../packages/db/src/router.js';
import { buildActions, type ActionInputs, type ActionItem } from './builder.js';

/**
 * Action Center service — turns observed records into a daily, prioritized
 * to-do list, persisted so status (done/snoozed/ignored) survives. Every action
 * is grounded in a real record; the builder is pure and tested separately.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'actions',$2)`, [type, JSON.stringify(payload ?? {})]);
}

const STUCK_HOURS = 24;

async function gather(c: any, journeyId: string): Promise<ActionInputs> {
  const leadsNeedingFollowup = (await c.query(
    `SELECT id, name, stage, followup_due_at AS "followupDueAt" FROM leads
      WHERE funnel_id=$1 AND deleted_at IS NULL AND stage='needs_followup'`, [journeyId])).rows;
  const overdueTasks = (await c.query(
    `SELECT id, lead_id AS "leadId", title, due_at AS "dueAt" FROM tasks
      WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now()`, [journeyId])).rows;
  const waitingPayment = (await c.query(
    `SELECT id, name FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND stage='waiting_payment'`, [journeyId])).rows;
  const proofToReview = (await c.query(
    `SELECT le.id, le.name FROM leads le
      WHERE le.funnel_id=$1 AND le.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=le.id AND p.proof_received=TRUE AND p.reviewed_at IS NULL)`, [journeyId])).rows;
  const confirmedNotDelivered = (await c.query(
    `SELECT le.id, le.name FROM leads le
      WHERE le.funnel_id=$1 AND le.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM payment_states p WHERE p.lead_id=le.id AND p.state='confirmed' AND p.access_delivered=FALSE)`, [journeyId])).rows;
  const whatsappClickedNoContact = (await c.query(
    `SELECT le.id, le.name FROM leads le
      WHERE le.funnel_id=$1 AND le.deleted_at IS NULL AND le.stage='whatsapp_clicked'
        AND NOT EXISTS (SELECT 1 FROM whatsapp_draft_replies d WHERE d.lead_id=le.id AND d.marked_sent=TRUE)`, [journeyId])).rows;
  const leadsNoNextAction = (await c.query(
    `SELECT id, name FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL
        AND next_action IS NULL AND stage NOT IN ('paid','access_delivered','lost')`, [journeyId])).rows;
  const lostNoReason = (await c.query(
    `SELECT id, name FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL AND stage='lost' AND lost_reason IS NULL`, [journeyId])).rows;
  const openLeaks = (await c.query(
    `SELECT id, title, severity, recommended_action AS "recommendedAction" FROM leak_findings
      WHERE journey_id=$1 AND status IN ('open','fixing')`, [journeyId])).rows;

  const pendingRepairs = (await c.query(
    `SELECT id, title, status, learning_confidence FROM repair_plans WHERE journey_id=$1 AND status IN ('proposed','partially_applied')`, [journeyId])).rows
    .map((r: any) => ({ id: r.id, title: r.title, status: r.status, learningConfidence: r.learning_confidence }));
  // repairs applied but never measured, or whose latest outcome is no_change/worsened
  const measurableRepairs = (await c.query(
    `SELECT rp.id, rp.title,
        (SELECT status FROM repair_outcomes ro WHERE ro.repair_plan_id=rp.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
       FROM repair_plans rp
      WHERE rp.journey_id=$1 AND rp.status IN ('applied','partially_applied') AND rp.applied_at IS NOT NULL`, [journeyId])).rows
    .map((r: any) => ({ id: r.id, title: r.title, lastOutcome: r.last_outcome as string | null }))
    .filter((r: any) => r.lastOutcome === null || r.lastOutcome === 'no_change' || r.lastOutcome === 'worsened' || r.lastOutcome === 'awaiting_data');

  const pendingApplications = (await c.query(
    `SELECT id, scope, status, confidence FROM playbook_application_plans WHERE funnel_id=$1 AND status IN ('proposed','partially_applied')`, [journeyId])
    .catch(() => ({ rows: [] }))).rows
    .map((r: any) => ({ id: r.id, scope: r.scope, status: r.status, confidence: r.confidence }));
  // applied applications never measured, or whose latest outcome is no_change/worsened/awaiting
  const measurableApplications = (await c.query(
    `SELECT ap.id, ap.scope,
        (SELECT status FROM playbook_application_outcomes o WHERE o.application_plan_id=ap.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
       FROM playbook_application_plans ap
      WHERE ap.funnel_id=$1 AND ap.status IN ('applied','partially_applied') AND ap.applied_at IS NOT NULL`, [journeyId])
    .catch(() => ({ rows: [] }))).rows
    .map((r: any) => ({ id: r.id, scope: r.scope, lastOutcome: r.last_outcome as string | null }))
    .filter((r: any) => r.lastOutcome === null || ['no_change', 'worsened', 'awaiting_data', 'early_signal'].includes(r.lastOutcome));

  const portfolioInsights = (await c.query(
    `SELECT id, insight_type, title, recommended_action, confidence FROM portfolio_insights
      WHERE status='open' AND insight_type IN ('transferable_playbook','payment_friction','underperforming_page','missing_tracking') ORDER BY created_at DESC LIMIT 3`)
    .catch(() => ({ rows: [] }))).rows
    .map((r: any) => ({ id: r.id, insightType: r.insight_type, title: r.title, recommendedAction: r.recommended_action, confidence: r.confidence }));

  // scheduled-rhythm signals: outcomes due + stale intelligence (Sprint 24)
  const repairsDue = Number((await c.query(
    `SELECT COUNT(*)::int AS n FROM repair_plans rp WHERE rp.applied_at IS NOT NULL AND rp.status IN ('applied','partially_applied')
       AND NOT EXISTS (SELECT 1 FROM repair_outcomes o WHERE o.repair_plan_id=rp.id AND o.status IN ('improved','no_change','worsened','inconclusive'))
       AND rp.applied_at < now() - INTERVAL '24 hours'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n ?? 0);
  const staleInsightsCount = Number((await c.query(
    `SELECT COUNT(*)::int AS n FROM portfolio_insights WHERE status='open' AND stale=TRUE`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n ?? 0);
  const rhythmSignals = { repairsDue, staleInsights: staleInsightsCount };

  // high-confidence recommendations not yet acted on (enrich + dedup against tasks)
  const topRecommendations = (await c.query(
    `SELECT id, recommendation_type, title, explanation, priority_score, urgency, confidence, learning_source
       FROM action_recommendations WHERE funnel_id=$1 AND status IN ('proposed','accepted') AND priority_score >= 60
      ORDER BY priority_score DESC LIMIT 3`, [journeyId]).catch(() => ({ rows: [] }))).rows
    .map((r: any) => ({ id: r.id, recommendationType: r.recommendation_type, title: r.title, explanation: r.explanation, priorityScore: r.priority_score, urgency: r.urgency, confidence: r.confidence, learningSource: r.learning_source }));

  // applied recommendations awaiting an outcome check (>24h, not yet resolved)
  const recommendationsNeedingCheck = Number((await c.query(
    `SELECT COUNT(*)::int AS n FROM action_recommendations
      WHERE funnel_id=$1 AND status='applied' AND applied_at < now() - INTERVAL '24 hours'
        AND (last_outcome_status IS NULL OR last_outcome_status IN ('awaiting_evidence','early_signal'))`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n ?? 0);

  // high-priority revenue opportunities — surfaced as actions, deduped by type to avoid noise
  const topOpportunities = (await c.query(
    `SELECT id, opportunity_type, title, priority_score, urgency, recommended_action, estimated_value, value_currency
       FROM revenue_opportunities WHERE funnel_id=$1 AND status IN ('open','in_progress') AND priority_score >= 60
      ORDER BY priority_score DESC LIMIT 4`, [journeyId]).catch(() => ({ rows: [] }))).rows
    .map((r: any) => ({ id: r.id, opportunityType: r.opportunity_type, title: r.title, priorityScore: r.priority_score, urgency: r.urgency, recommendedAction: r.recommended_action, estimatedValue: r.estimated_value, valueCurrency: r.value_currency }));

  // opportunities acted on but not yet outcome-checked in a while (need a re-check)
  const opportunitiesNeedingCheck = Number((await c.query(
    `SELECT COUNT(*)::int AS n FROM revenue_opportunities
      WHERE funnel_id=$1 AND status IN ('open','in_progress') AND acted_at IS NOT NULL
        AND acted_at < now() - INTERVAL '24 hours'
        AND (last_outcome_status IS NULL OR last_outcome_status IN ('awaiting_evidence','inconclusive'))`, [journeyId]).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n ?? 0);

  return { leadsNeedingFollowup, overdueTasks, waitingPayment, proofToReview, confirmedNotDelivered,
    whatsappClickedNoContact, leadsNoNextAction, lostNoReason, openLeaks, pendingRepairs, measurableRepairs, pendingApplications, measurableApplications, portfolioInsights, rhythmSignals, topOpportunities, opportunitiesNeedingCheck, topRecommendations, recommendationsNeedingCheck };
}

/** Regenerate actions for a funnel from observed records (upsert by code, keep status). */
export async function refreshActions(tenantId: string, journeyId: string): Promise<ActionItem[]> {
  return withTenant(tenantId, async (c) => {
    const inputs = await gather(c, journeyId);
    const actions = buildActions(inputs);
    const existing = await c.query(`SELECT code, status FROM action_items WHERE journey_id=$1`, [journeyId]);
    const keepStatus = new Map(existing.rows.map((r: any) => [r.code, r.status]));
    const currentCodes = new Set(actions.map((a) => a.code));

    for (const a of actions) {
      const status = keepStatus.get(a.code) ?? 'open';
      const exists = keepStatus.has(a.code);
      if (exists) {
        await c.query(
          `UPDATE action_items SET type=$2, title=$3, explanation=$4, priority=$5, due_at=$6,
              recommended_action=$7, target_route=$8, evidence=$9, updated_at=now()
            WHERE journey_id=$1 AND code=$10`,
          [journeyId, a.type, a.title, a.explanation, a.priority, a.dueAt ?? null,
           a.recommendedAction, a.targetRoute, JSON.stringify(a.evidence), a.code]);
      } else {
        await c.query(
          `INSERT INTO action_items (journey_id, lead_id, leak_id, type, title, explanation, priority, due_at,
              status, recommended_action, target_route, evidence, code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10,$11,$12)`,
          [journeyId, a.leadId ?? null, a.leakId ?? null, a.type, a.title, a.explanation, a.priority,
           a.dueAt ?? null, a.recommendedAction, a.targetRoute, JSON.stringify(a.evidence), a.code]);
        await emit(c, 'action_created', { code: a.code, type: a.type });
      }
    }
    // close actions whose underlying record no longer needs action
    for (const row of existing.rows as any[]) {
      if (!currentCodes.has(row.code) && row.status === 'open') {
        await c.query(`UPDATE action_items SET status='done', updated_at=now() WHERE journey_id=$1 AND code=$2`, [journeyId, row.code]);
      }
    }
    return actions;
  });
}

/** List actions, optionally filtered, hiding snoozed-until-future and done/ignored. */
export async function listActions(tenantId: string, journeyId: string, filter = 'today') {
  return withTenant(tenantId, async (c) => {
    const typeMap: Record<string, string[]> = {
      payment: ['review_payment_proof', 'confirm_payment', 'deliver_access', 'add_payment_method'],
      whatsapp: ['contact_whatsapp_click', 'use_whatsapp_template'],
      leaks: ['resolve_leak'],
      tracking: ['fix_tracking', 'publish_page', 'create_tracked_link'],
      followup: ['follow_up_lead', 'add_next_action', 'mark_lost_reason'],
    };
    let where = `journey_id=$1 AND status='open'`;
    const params: unknown[] = [journeyId];
    if (filter === 'overdue') where += ` AND due_at IS NOT NULL AND due_at < now()`;
    else if (typeMap[filter]) { params.push(typeMap[filter]); where += ` AND type = ANY($${params.length})`; }
    // 'today' = all open not snoozed into the future
    where += ` AND (snooze_until IS NULL OR snooze_until <= now())`;
    const r = await c.query(`SELECT * FROM action_items WHERE ${where} ORDER BY priority DESC, due_at NULLS LAST`, params);
    return r.rows;
  });
}

export async function topAction(tenantId: string, journeyId: string) {
  const list = await listActions(tenantId, journeyId, 'today');
  return list[0] ?? null;
}

export async function updateActionStatus(tenantId: string, actionId: string, status: string, snoozeHours?: number) {
  await withTenant(tenantId, async (c) => {
    if (status === 'snoozed') {
      const hrs = snoozeHours ?? 24;
      await c.query(`UPDATE action_items SET status='snoozed', snooze_until=now() + ($2 || ' hours')::interval, updated_at=now() WHERE id=$1`, [actionId, String(hrs)]);
      await emit(c, 'action_snoozed', { actionId });
    } else {
      await c.query(`UPDATE action_items SET status=$2, updated_at=now() WHERE id=$1`, [actionId, status]);
      await emit(c, status === 'done' ? 'action_done' : 'action_ignored', { actionId });
    }
  });
}
