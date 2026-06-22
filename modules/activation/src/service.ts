import { withTenant } from '../../../packages/db/src/router.js';
import { buildActivation, type ActivationEvidence } from './engine.js';

/**
 * Activation service. Gathers evidence for a funnel (and its business) from the
 * real tenant DB in one scope, then runs the pure engine. Evidence-based: a
 * step is only `done` when the record/event actually exists. Read-only.
 */

async function gatherEvidence(tenantId: string, journeyId: string): Promise<{ evidence: ActivationEvidence; businessId: string | null }> {
  return withTenant(tenantId, async (c) => {
    const journey = (await c.query(`SELECT id, business_id FROM journeys WHERE id=$1`, [journeyId])).rows[0];
    const businessId = journey?.business_id ?? null;

    const n = async (sql: string, params: any[]): Promise<number> => {
      try { return (await c.query(sql, params)).rows[0]?.n ?? 0; } catch { return 0; }
    };

    const hasBusiness = !!businessId;
    const hasOffer = (await n(`SELECT COUNT(*)::int AS n FROM offers WHERE journey_id=$1`, [journeyId])) > 0;
    const hasBlueprint = (await n(`SELECT COUNT(*)::int AS n FROM funnel_stages WHERE journey_id=$1`, [journeyId])) > 0;
    const pageRow = (await c.query(`SELECT id, COALESCE(published,FALSE) AS published FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]).catch(() => ({ rows: [] as any[] }))).rows[0];
    const hasPage = !!pageRow;
    const pagePublished = !!pageRow?.published;
    const hasTrackedLink = (await n(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [journeyId])) > 0;
    const hasPaymentMethod = (await n(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [journeyId])) > 0;

    // signals
    const pageViews = await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 AND pe.type IN ('view','page_view')`, [journeyId]);
    const whatsappClicks = await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 AND pe.type IN ('cta_click','whatsapp_click')`, [journeyId]);
    const leads = businessId ? await n(`SELECT COUNT(*)::int AS n FROM leads WHERE business_id=$1`, [businessId]) : 0;
    const paymentStates = businessId ? await n(`SELECT COUNT(*)::int AS n FROM payment_states ps JOIN leads l ON l.id=ps.lead_id WHERE l.business_id=$1`, [businessId]) : 0;
    const revenueDeskItems = await n(`SELECT COUNT(*)::int AS n FROM revenue_opportunities WHERE funnel_id=$1 AND status IN ('open','in_progress')`, [journeyId]);
    const recommendations = await n(`SELECT COUNT(*)::int AS n FROM action_recommendations WHERE funnel_id=$1`, [journeyId]);
    const outcomesMeasured = await n(`SELECT COUNT(*)::int AS n FROM recommendation_outcomes WHERE funnel_id=$1`, [journeyId]);

    const evidence: ActivationEvidence = {
      hasBusiness, hasOffer, hasBlueprint, hasPage, pagePublished, hasTrackedLink, hasPaymentMethod,
      pageViews, whatsappClicks, leads, paymentStates, revenueDeskItems, recommendations, outcomesMeasured,
    };
    return { evidence, businessId };
  });
}

export async function getActivationStatus(tenantId: string, journeyId: string) {
  const { evidence } = await gatherEvidence(tenantId, journeyId);
  const activation = buildActivation(evidence);
  return { ...activation, evidence };
}

/** Compact summary for dashboard + command bar. */
export async function activationSummary(tenantId: string, journeyId: string) {
  const a = await getActivationStatus(tenantId, journeyId);
  return {
    stage: a.stage,
    readinessScore: a.readinessScore,
    launchReady: a.launchReady,
    blockingReason: a.blockingReason,
    nextAction: a.nextAction ? { label: a.nextAction.label, nextAction: a.nextAction.nextAction, route: a.nextAction.route, evidence: a.nextAction.evidence } : null,
  };
}

/** The next best activation step (or null when fully activated). */
export async function getNextActivationAction(tenantId: string, journeyId: string) {
  const a = await getActivationStatus(tenantId, journeyId);
  return a.nextAction;
}

/** Whether the funnel has crossed into live operational mode (real signals seen). */
export async function isLiveMode(tenantId: string, journeyId: string): Promise<boolean> {
  const { evidence } = await gatherEvidence(tenantId, journeyId);
  return evidence.pageViews > 0 || evidence.whatsappClicks > 0 || evidence.leads > 0;
}
