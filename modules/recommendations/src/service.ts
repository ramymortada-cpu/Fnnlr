import { withTenant } from '../../../packages/db/src/router.js';
import { rankRecommendations, type OppForRec, type ActionLearningLite, type RecommendationCandidate } from './engine.js';
import { computeServiceWindow } from '../../realtime/src/service-window.js';

/**
 * Action recommendation service. Gathers live opportunities + attribution
 * learning, runs the pure engine, and persists ranked recommendations
 * idempotently (one live row per dedupe_key). Applying a mutating recommendation
 * is approval-gated and links to the created task/draft — no auto-send.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'recommendations',$2)`, [type, JSON.stringify(payload ?? {})]);
}
async function logStatus(c: any, recId: string, from: string | null, to: string, reason: string) {
  await c.query(`INSERT INTO recommendation_status_history (recommendation_id, from_status, to_status, reason) VALUES ($1,$2,$3,$4)`, [recId, from, to, reason]);
}

/** Gather attribution learning keyed by action type. */
async function attributionLearningMap(c: any): Promise<Record<string, ActionLearningLite>> {
  const { aggregateAttribution } = await import('../../attribution/src/engine.js');
  const rows = (await c.query(`SELECT attribution_id AS "sourceId", attributed_action_type AS "attributedActionType", captured, captured_value AS "capturedValue", time_delta_minutes AS "timeDeltaMinutes" FROM attribution_learning_records`).catch(() => ({ rows: [] }))).rows;
  const agg = aggregateAttribution(rows as any);
  const map: Record<string, ActionLearningLite> = {};
  for (const a of agg) map[a.attributedActionType] = { attributedActionType: a.attributedActionType, captureRate: a.captureRate, capturedCount: a.capturedCount, attempts: a.attempts, limited: a.limited };
  return map;
}

/** Gather live opportunities as engine inputs for a funnel. */
async function gatherOpps(c: any, journeyId: string): Promise<OppForRec[]> {
  const rows = (await c.query(
    `SELECT o.id, o.opportunity_type, o.funnel_id, o.priority_score, o.urgency, o.estimated_value, o.value_currency, o.affected_objects
       FROM revenue_opportunities o WHERE o.funnel_id=$1 AND o.status IN ('open','in_progress') ORDER BY o.priority_score DESC LIMIT 30`, [journeyId])).rows;
  const out: OppForRec[] = [];
  for (const r of rows) {
    const affected = typeof r.affected_objects === 'string' ? JSON.parse(r.affected_objects) : (r.affected_objects ?? []);
    const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;
    let serviceWindow: any = 'unknown', hasOpenTask = false, hasRepairPlan = false;
    if (leadId) {
      const lead = (await c.query(`SELECT last_inbound_at FROM leads WHERE id=$1`, [leadId])).rows[0];
      serviceWindow = computeServiceWindow(lead?.last_inbound_at ? new Date(lead.last_inbound_at) : null).status;
      hasOpenTask = ((await c.query(`SELECT 1 FROM tasks WHERE lead_id=$1 AND done=FALSE LIMIT 1`, [leadId])).rowCount ?? 0) > 0;
    }
    const leakId = (affected ?? []).find((a: any) => a.type === 'leak')?.id ?? null;
    if (leakId) hasRepairPlan = ((await c.query(`SELECT 1 FROM repair_plans WHERE leak_id=$1 AND status NOT IN ('rejected') LIMIT 1`, [leakId]).catch(() => ({ rowCount: 0 }))).rowCount ?? 0) > 0;
    out.push({
      opportunityId: r.id, opportunityType: r.opportunity_type, leadId, funnelId: r.funnel_id,
      priorityScore: r.priority_score, urgency: r.urgency,
      estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null, valueCurrency: r.value_currency,
      serviceWindow, hasOpenTask, hasRepairPlan,
    });
  }
  return out;
}

/** Refresh recommendations for a funnel: rank, upsert idempotently, expire gone ones. */
export async function refreshRecommendations(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const businessId = (await c.query(`SELECT business_id FROM journeys WHERE id=$1`, [journeyId])).rows[0]?.business_id ?? null;
    const learning = await attributionLearningMap(c);
    const opps = await gatherOpps(c, journeyId);
    const recs = rankRecommendations(opps, learning);
    const liveKeys = new Set(recs.map((r) => r.dedupeKey));

    // recommendation outcome learning: nudge score by learned work-rate per rec type
    const { aggregateRecLearning, applyRecLearningToScore } = await import('./outcome-engine.js');
    const recLearnRows = (await c.query(`SELECT recommendation_outcome_id AS "sourceId", recommendation_type AS "recommendationType", status, captured_value AS "capturedValue", time_to_result_minutes AS "timeToResultMinutes" FROM recommendation_learning_records`).catch(() => ({ rows: [] }))).rows;
    const recLearnMap: Record<string, any> = {};
    for (const l of aggregateRecLearning(recLearnRows as any)) recLearnMap[l.recommendationType] = l;

    let created = 0, updated = 0;
    for (const r0 of recs) {
      const adj = applyRecLearningToScore(r0.priorityScore, r0.urgency, recLearnMap[r0.recommendationType]);
      const r = { ...r0, priorityScore: adj.score, evidence: adj.note ? { ...r0.evidence, recLearningNote: adj.note } : r0.evidence };
      const existing = (await c.query(`SELECT id, status FROM action_recommendations WHERE dedupe_key=$1 AND status IN ('proposed','accepted')`, [r.dedupeKey])).rows[0];
      if (existing) {
        await c.query(
          `UPDATE action_recommendations SET priority_score=$2, urgency=$3, confidence=$4, learning_source=$5, explanation=$6, evidence=$7, updated_at=now() WHERE id=$1`,
          [existing.id, r.priorityScore, r.urgency, r.confidence, r.learningSource, r.explanation, JSON.stringify(r.evidence)]);
        updated++;
      } else {
        // don't recreate something dismissed in the last 24h
        const dismissed = (await c.query(`SELECT 1 FROM action_recommendations WHERE dedupe_key=$1 AND status='dismissed' AND updated_at > now() - INTERVAL '24 hours' LIMIT 1`, [r.dedupeKey])).rowCount;
        if (dismissed) continue;
        const ins = await c.query(
          `INSERT INTO action_recommendations (funnel_id, business_id, opportunity_id, lead_id, recommendation_type, dedupe_key, title, explanation, evidence,
              confidence, learning_source, priority_score, urgency, expected_effect, affected_objects, proposed_action, requires_approval, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'proposed') RETURNING id`,
          [journeyId, businessId, r.opportunityId, r.leadId, r.recommendationType, r.dedupeKey, r.title, r.explanation, JSON.stringify(r.evidence),
           r.confidence, r.learningSource, r.priorityScore, r.urgency, r.expectedEffect, JSON.stringify([{ type: 'opportunity', id: r.opportunityId }]), JSON.stringify(r.proposedAction), r.requiresApproval]);
        await logStatus(c, ins.rows[0].id, null, 'proposed', 'generated');
        created++;
      }
    }

    // expire recommendations whose opportunity no longer surfaces
    const live = (await c.query(`SELECT id, dedupe_key FROM action_recommendations WHERE funnel_id=$1 AND status IN ('proposed','accepted')`, [journeyId])).rows;
    let expired = 0;
    for (const row of live) {
      if (!liveKeys.has(row.dedupe_key)) {
        await c.query(`UPDATE action_recommendations SET status='expired', updated_at=now() WHERE id=$1`, [row.id]);
        await logStatus(c, row.id, 'proposed', 'expired', 'opportunity resolved or gone');
        expired++;
      }
    }
    await emit(c, 'recommendations_refreshed', { journeyId, created, updated, expired });
    return { created, updated, expired, total: recs.length };
  });
}

export async function listRecommendations(tenantId: string, journeyId: string | null, filter = 'all') {
  return withTenant(tenantId, async (c) => {
    const statuses = filter === 'applied' ? `('applied')` : filter === 'all_active' ? `('proposed','accepted','applied')` : `('proposed','accepted')`;
    const where = [`status IN ${statuses}`]; const params: any[] = [];
    if (journeyId) { params.push(journeyId); where.push(`funnel_id=$${params.length}`); }
    const typeFilter: Record<string, string[]> = {
      payment: ['draft_payment_reminder', 'improve_payment_instructions'],
      whatsapp: ['draft_whatsapp_reply'], proof: ['review_proof'], delivery: ['deliver_access'],
      leak: ['build_repair_plan'], playbook: ['apply_playbook'],
    };
    if (typeFilter[filter]) { params.push(typeFilter[filter]); where.push(`recommendation_type = ANY($${params.length})`); }
    return (await c.query(`SELECT * FROM action_recommendations WHERE ${where.join(' AND ')} ORDER BY priority_score DESC, created_at DESC`, params)).rows;
  });
}

export async function getRecommendation(tenantId: string, id: string) {
  return withTenant(tenantId, async (c) => {
    const rec = (await c.query(`SELECT * FROM action_recommendations WHERE id=$1`, [id])).rows[0];
    if (!rec) return null;
    const history = (await c.query(`SELECT * FROM recommendation_status_history WHERE recommendation_id=$1 ORDER BY created_at`, [id])).rows;
    return { recommendation: rec, history };
  });
}

/** Generate (refresh) recommendations for a single opportunity's funnel. */
export async function recommendForOpportunityId(tenantId: string, opportunityId: string) {
  return withTenant(tenantId, async (c) => {
    const opp = (await c.query(`SELECT funnel_id FROM revenue_opportunities WHERE id=$1`, [opportunityId])).rows[0];
    return opp?.funnel_id ?? null;
  }).then(async (funnelId) => {
    if (!funnelId) return { error: 'not found' };
    await refreshRecommendations(tenantId, funnelId);
    return withTenant(tenantId, async (c) =>
      (await c.query(`SELECT * FROM action_recommendations WHERE opportunity_id=$1 AND status IN ('proposed','accepted') ORDER BY priority_score DESC`, [opportunityId])).rows);
  });
}

/**
 * Apply a recommendation. Mutating recommendations are approval-gated: the
 * caller must pass approved=true. Creates the real task/draft/plan and LINKS it.
 * Never sends WhatsApp; drafts only.
 */
export async function applyRecommendation(tenantId: string, id: string, approved: boolean) {
  return withTenant(tenantId, async (c) => {
    const r = (await c.query(`SELECT * FROM action_recommendations WHERE id=$1`, [id])).rows[0];
    if (!r) return { error: 'not found' };
    if (r.requires_approval && !approved) return { needsApproval: true, recommendationType: r.recommendation_type, title: r.title };

    let linkedType: string | null = null, linkedId: string | null = null;
    const t = r.recommendation_type;
    if (t === 'create_task' || t === 'review_proof' || t === 'deliver_access' || t === 'mark_needs_followup') {
      const kind = t === 'review_proof' ? 'confirm_proof' : t === 'deliver_access' ? 'deliver' : 'whatsapp_followup';
      const task = await c.query(`INSERT INTO tasks (funnel_id, lead_id, title, kind, done, due_at) VALUES ($1,$2,$3,$4,FALSE, now() + INTERVAL '1 day') RETURNING id`,
        [r.funnel_id, r.lead_id, r.title, kind]).catch(() => null);
      if (task) { linkedType = 'task'; linkedId = task.rows[0].id; }
    } else if ((t === 'draft_whatsapp_reply' || t === 'draft_payment_reminder') && r.lead_id) {
      // create a DRAFT only — never sent
      const draft = await c.query(
        `INSERT INTO whatsapp_draft_replies (lead_id, body, marked_sent) VALUES ($1,$2,FALSE) RETURNING id`,
        [r.lead_id, t === 'draft_payment_reminder' ? 'تذكير دفع مقترح — راجِعه قبل الإرسال.' : 'ردّ أول مقترح — راجِعه قبل الإرسال.']).catch(() => null);
      if (draft) { linkedType = 'whatsapp_draft'; linkedId = draft.rows[0].id; }
    }
    // build_repair_plan / apply_playbook / update_page_cta / improve_payment_instructions: surface intent + link the opportunity; actual build stays in their own approval flow
    await c.query(`UPDATE action_recommendations SET status='applied', applied_at=now(), updated_at=now(), linked_object_type=$2, linked_object_id=$3 WHERE id=$1`, [id, linkedType, linkedId]);
    await logStatus(c, id, r.status, 'applied', 'applied by user');
    await emit(c, 'recommendation_applied', { id, recommendationType: t, linkedType });
    return { ok: true, recommendationType: t, linkedObjectType: linkedType, linkedObjectId: linkedId };
  });
}

export async function dismissRecommendation(tenantId: string, id: string, reason?: string) {
  return withTenant(tenantId, async (c) => {
    const r = (await c.query(`SELECT status FROM action_recommendations WHERE id=$1`, [id])).rows[0];
    if (!r) return { error: 'not found' };
    await c.query(`UPDATE action_recommendations SET status='dismissed', dismissed_at=now(), updated_at=now() WHERE id=$1`, [id]);
    await logStatus(c, id, r.status, 'dismissed', reason ?? 'dismissed by user');
    return { ok: true };
  });
}

export async function recommendationsSummary(tenantId: string, journeyId?: string) {
  return withTenant(tenantId, async (c) => {
    const where = journeyId ? `AND funnel_id=$1` : ''; const params = journeyId ? [journeyId] : [];
    const open = (await c.query(`SELECT id, recommendation_type, title, priority_score, urgency, confidence, learning_source FROM action_recommendations WHERE status IN ('proposed','accepted') ${where} ORDER BY priority_score DESC`, params)).rows;
    const applied = (await c.query(`SELECT COUNT(*)::int AS n FROM action_recommendations WHERE status='applied' ${where} AND applied_at > now() - INTERVAL '7 days'`, params)).rows[0].n;
    return { open: open.length, top: open[0] ?? null, appliedThisWeek: applied, list: open.slice(0, 5) };
  });
}
