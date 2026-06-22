import { withTenant } from '../../../packages/db/src/router.js';
import { buildDesk, type DeskSource } from './aggregator.js';

/**
 * Revenue Desk service. Gathers every operating signal for a funnel in a single
 * tenant scope and runs the pure aggregator. One read path, deduped + sectioned.
 * Read-only — surfaces what to do, never executes.
 */

export async function getRevenueDesk(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const src: DeskSource = {};

    // opportunities (open) + whether each has a live recommendation
    const opps = (await c.query(
      `SELECT o.id, o.opportunity_type, o.title, o.priority_score, o.urgency, o.estimated_value, o.value_currency, o.recommended_action, o.affected_objects,
              r.id AS rec_id, r.title AS rec_title
         FROM revenue_opportunities o
         LEFT JOIN LATERAL (
           SELECT id, title FROM action_recommendations ar
            WHERE ar.opportunity_id = o.id AND ar.status IN ('proposed','accepted') ORDER BY priority_score DESC LIMIT 1
         ) r ON TRUE
        WHERE o.funnel_id=$1 AND o.status IN ('open','in_progress') ORDER BY o.priority_score DESC LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows;
    src.opportunities = opps.map((o: any) => {
      const affected = typeof o.affected_objects === 'string' ? JSON.parse(o.affected_objects) : (o.affected_objects ?? []);
      const leadId = (affected ?? []).find((a: any) => a.type === 'lead')?.id ?? null;
      return { id: o.id, opportunityType: o.opportunity_type, title: o.title, priorityScore: o.priority_score, urgency: o.urgency, estimatedValue: o.estimated_value != null ? Number(o.estimated_value) : null, valueCurrency: o.value_currency, recommendedAction: o.recommended_action, leadId, hasRecommendation: !!o.rec_id, recommendationId: o.rec_id, recommendationTitle: o.rec_title };
    });

    // recommendations (live + applied-awaiting-measure)
    src.recommendations = (await c.query(
      `SELECT id, recommendation_type, title, explanation, priority_score, urgency, confidence, status, opportunity_id, requires_approval, last_outcome_status, applied_at
         FROM action_recommendations
        WHERE funnel_id=$1 AND (status IN ('proposed','accepted') OR (status='applied' AND (last_outcome_status IS NULL OR last_outcome_status IN ('awaiting_evidence','early_signal'))))
        ORDER BY priority_score DESC LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, recommendationType: r.recommendation_type, title: r.title, explanation: r.explanation, priorityScore: r.priority_score, urgency: r.urgency, confidence: r.confidence, status: r.status, opportunityId: r.opportunity_id, requiresApproval: r.requires_approval, lastOutcomeStatus: r.last_outcome_status, appliedAwaitingMeasure: r.status === 'applied' }));

    // repairs pending approval / partially applied
    src.pendingRepairs = (await c.query(
      `SELECT id, title, status, leak_id FROM repair_plans WHERE journey_id=$1 AND status IN ('proposed','approved','partially_applied') ORDER BY created_at DESC LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, title: r.title, status: r.status, leakId: r.leak_id }));
    // repairs applied & due for measurement (applied >24h, latest outcome awaiting/none)
    src.measurableRepairs = (await c.query(
      `SELECT rp.id, rp.title, (SELECT status FROM repair_outcomes o WHERE o.repair_plan_id=rp.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
         FROM repair_plans rp WHERE rp.journey_id=$1 AND rp.status='applied' AND rp.applied_at < now() - INTERVAL '24 hours' ORDER BY rp.applied_at DESC LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .filter((r: any) => !r.last_outcome || ['awaiting_data', 'early_signal'].includes(r.last_outcome))
      .map((r: any) => ({ id: r.id, title: r.title, lastOutcome: r.last_outcome }));

    // open leaks
    src.openLeaks = (await c.query(
      `SELECT id, title, severity, recommended_action FROM leak_findings WHERE journey_id=$1 AND COALESCE(stale,FALSE)=FALSE ORDER BY created_at DESC LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, title: r.title, severity: r.severity, recommendedAction: r.recommended_action }));

    // playbook applications pending / measurable
    src.pendingApplications = (await c.query(
      `SELECT id, scope, status, confidence FROM playbook_application_plans WHERE funnel_id=$1 AND status IN ('proposed','approved') ORDER BY created_at DESC LIMIT 10`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, scope: r.scope, status: r.status, confidence: r.confidence ?? 'low' }));
    src.measurableApplications = (await c.query(
      `SELECT ap.id, ap.scope, (SELECT status FROM playbook_application_outcomes o WHERE o.application_plan_id=ap.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
         FROM playbook_application_plans ap WHERE ap.funnel_id=$1 AND ap.status='applied' AND ap.applied_at < now() - INTERVAL '24 hours' ORDER BY ap.applied_at DESC LIMIT 10`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .filter((r: any) => !r.last_outcome || ['awaiting_data', 'early_signal'].includes(r.last_outcome))
      .map((r: any) => ({ id: r.id, scope: r.scope, lastOutcome: r.last_outcome }));

    // overdue tasks
    src.overdueTasks = (await c.query(
      `SELECT id, lead_id, title, due_at, kind FROM tasks WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now() ORDER BY due_at LIMIT 20`, [journeyId]).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, leadId: r.lead_id, title: r.title, dueAt: r.due_at, kind: r.kind }));

    // scheduled failures (last 7 days)
    src.scheduledFailures = (await c.query(
      `SELECT id, job_type, COALESCE(error,'') AS error FROM scheduled_runs WHERE status='failed' AND created_at > now() - INTERVAL '7 days' ORDER BY created_at DESC LIMIT 5`).catch(() => ({ rows: [] }))).rows
      .map((r: any) => ({ id: r.id, jobType: r.job_type, error: r.error }));

    // weekly report ready (a completed weekly run in the last 7 days)
    src.weeklyReportReady = ((await c.query(
      `SELECT 1 FROM scheduled_runs WHERE job_type='weekly_business_report' AND status='completed' AND created_at > now() - INTERVAL '7 days' LIMIT 1`).catch(() => ({ rowCount: 0 }))).rowCount ?? 0) > 0;

    const desk = buildDesk(src);

    // Activation-aware: if there are NO real operating items AND no live signals
    // yet, surface activation-focused steps instead of an empty desk. We never
    // fabricate opportunities before observed data — these are setup actions.
    if (desk.items.length === 0) {
      const { getActivationStatus } = await import('../../activation/src/service.js');
      const act = await getActivationStatus(tenantId, journeyId).catch(() => null);
      if (act && !act.launchReady) {
        return buildActivationDesk(act);
      }
    }
    return desk;
  });
}

/** Build a desk whose items are activation steps (setup mode). */
function buildActivationDesk(act: any) {
  const pending = (act.steps as any[]).filter((s) => s.status !== 'done').slice(0, 6);
  const items = pending.map((s, i) => ({
    id: `activation:${s.id}`,
    type: 'best_next_action' as const,
    domain: 'system' as const,
    section: 'do_now' as const,
    label: 'خطوة تفعيل',
    icon: '🚀',
    severity: (i === 0 ? 'high' : 'medium') as 'high' | 'medium',
    title: s.label,
    explanation: s.nextAction,
    whyRankedHere: s.evidence,
    primaryAction: s.nextAction,
    route: s.route,
    status: s.status,
    value: null, valueCurrency: null, confidence: null,
    priorityScore: 100 - i,
    requiresApproval: false,
    sourceType: 'activation',
    sourceId: s.id,
    secondary: null,
  }));
  return {
    items,
    sections: [{ section: 'do_now' as const, label: 'كمّل التفعيل', items }],
    topItem: items[0] ?? null,
    counts: { total: items.length, doNow: items.length, waitingApproval: 0, opportunities: 0, needsMeasurement: 0, systemAttention: 0 },
    activationMode: true,
  };
}

/** Compact summary for the dashboard + command bar. */
export async function revenueDeskSummary(tenantId: string, journeyId: string) {
  const desk = await getRevenueDesk(tenantId, journeyId);
  return {
    top: desk.topItem ? { title: desk.topItem.title, label: desk.topItem.label, icon: desk.topItem.icon, primaryAction: desk.topItem.primaryAction, whyRankedHere: desk.topItem.whyRankedHere, route: desk.topItem.route } : null,
    counts: desk.counts,
  };
}
