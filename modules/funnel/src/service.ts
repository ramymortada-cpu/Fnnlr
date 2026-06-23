import { withTenant } from '../../../packages/db/src/router.js';
import { AIGateway, type LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { logAiOutputWithUsage, logAiUsageEvent, type AiOutputLogRow } from '../../ai-ops/src/usage.js';
import { FunnelArchitectBrain } from '../../../packages/ai-core/src/brains/funnel-architect.js';
import { OfferBrain } from '../../../packages/ai-core/src/brains/offer.js';
import type { OnboardingInput, FunnelBlueprint, Offer } from '../../../packages/ai-core/src/contracts.js';

/**
 * Funnel service — the Phase 2 product core.
 *
 * createFunnelFromOnboarding(): runs the Architect + Offer brains and PERSISTS
 * the result as editable records (business? journey, offer, funnel_stages) in
 * the tenant's isolated DB, logging each AI output to ai_outputs and emitting
 * funnel_created / offer_generated events. The blueprint is a system of record,
 * not a PDF — every piece is editable afterwards.
 */

export interface CreateFunnelResult {
  journeyId: string;
  offerId: string;
  stageIds: string[];
  blueprint: FunnelBlueprint;
  offer: Offer;
  degraded: boolean;   // true if the LLM was unavailable and fallbacks were used
}

async function logAiOutput(tenantId: string) {
  return async (row: AiOutputLogRow) => logAiOutputWithUsage(tenantId, row);
}

async function emit(tenantId: string, type: string, payload: unknown) {
  await withTenant(tenantId, async (c) => {
    await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'funnel',$2)`,
      [type, JSON.stringify(payload ?? {})]);
  });
}

export async function createFunnelFromOnboarding(
  tenantId: string,
  businessId: string,
  input: OnboardingInput,
  llm: LLMClient,
): Promise<CreateFunnelResult> {
  const gateway = new AIGateway(llm);
  const ctx = { tenantId, logOutput: await logAiOutput(tenantId), logUsage: logAiUsageEvent };

  // Sprint 20: fold learning-derived playbook context into the inputs (honest;
  // may be absent / limited). Never auto-applied — it only informs generation.
  let funnelCtx: string | null = null, offerCtx: string | null = null;
  try {
    const { getPlaybookContext } = await import('../../playbooks/src/service.js');
    funnelCtx = (await getPlaybookContext(tenantId, 'funnel')).context;
    offerCtx = (await getPlaybookContext(tenantId, 'offer')).context;
  } catch { /* learning not available yet — proceed with defaults */ }
  const archInput = { ...input, playbookContext: funnelCtx };
  const offerInput = { ...input, playbookContext: offerCtx };

  // Run the two brains (each falls back to a usable draft if the LLM fails).
  const arch = await gateway.run(FunnelArchitectBrain, archInput, ctx);
  const off = await gateway.run(OfferBrain, offerInput, ctx);
  const blueprint = arch.output;
  const offer = off.output;
  const degraded = arch.degraded || off.degraded;

  // Persist as editable records inside the tenant DB.
  return withTenant(tenantId, async (c) => {
    const j = await c.query(
      `INSERT INTO journeys (business_id, name, channel, status)
       VALUES ($1,$2,$3,'draft') RETURNING id`,
      [businessId, `${input.businessName} — ${blueprint.funnelType}`, input.salesChannel],
    );
    const journeyId = j.rows[0].id as string;

    const o = await c.query(
      `INSERT INTO offers (journey_id, content, version) VALUES ($1,$2,1) RETURNING id`,
      [journeyId, JSON.stringify(offer)],
    );
    const offerId = o.rows[0].id as string;

    const stageIds: string[] = [];
    for (let i = 0; i < blueprint.stages.length; i++) {
      const s = blueprint.stages[i];
      const r = await c.query(
        `INSERT INTO funnel_stages
           (journey_id, position, name, purpose, channel, conversion_event, assets_needed, expected_leak, tracking_requirement)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [journeyId, i, s.name, s.purpose, s.channel, s.conversionEvent,
         JSON.stringify(s.assetsNeeded), s.expectedLeak, s.trackingRequirement],
      );
      stageIds.push(r.rows[0].id);
    }

    await emit(tenantId, 'funnel_created', { journeyId, funnelType: blueprint.funnelType, degraded });
    await emit(tenantId, 'offer_generated', { offerId, journeyId });

    return { journeyId, offerId, stageIds, blueprint, offer, degraded };
  });
}

// ---- Editing (the records are a system of record, fully editable) ----------

export async function getFunnel(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const j = await c.query(`SELECT * FROM journeys WHERE id=$1`, [journeyId]);
    if (!j.rowCount) return null;
    const offer = await c.query(`SELECT * FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId]);
    const stages = await c.query(`SELECT * FROM funnel_stages WHERE journey_id=$1 ORDER BY position`, [journeyId]);
    return { journey: j.rows[0], offer: offer.rows[0] ?? null, stages: stages.rows };
  });
}

export async function listFunnels(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT id, name, channel, status, created_at FROM journeys WHERE deleted_at IS NULL ORDER BY created_at DESC`);
    return r.rows;
  });
}

export async function updateOffer(tenantId: string, journeyId: string, offer: Offer) {
  await withTenant(tenantId, async (c) => {
    // New version (keep history).
    const v = await c.query(`SELECT COALESCE(max(version),0)+1 AS next FROM offers WHERE journey_id=$1`, [journeyId]);
    await c.query(`INSERT INTO offers (journey_id, content, version) VALUES ($1,$2,$3)`,
      [journeyId, JSON.stringify(offer), v.rows[0].next]);
    await emit(tenantId, 'offer_edited', { journeyId });
  });
}

export async function updateStage(tenantId: string, stageId: string, patch: Record<string, unknown>) {
  await withTenant(tenantId, async (c) => {
    const allowed = ['name', 'purpose', 'channel', 'conversion_event', 'expected_leak', 'tracking_requirement', 'active', 'position'];
    const entries = Object.entries(patch).filter(([k]) => allowed.includes(k));
    if (!entries.length) return;
    const cols = entries.map(([k], i) => `${k}=$${i + 2}`).join(', ');
    await c.query(`UPDATE funnel_stages SET ${cols}, updated_at=now() WHERE id=$1`, [stageId, ...entries.map(([, v]) => v)]);
  });
}

export async function addStage(tenantId: string, journeyId: string, name: string) {
  return withTenant(tenantId, async (c) => {
    const p = await c.query(`SELECT COALESCE(max(position),-1)+1 AS pos FROM funnel_stages WHERE journey_id=$1`, [journeyId]);
    const r = await c.query(
      `INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,$2,$3) RETURNING id`,
      [journeyId, p.rows[0].pos, name],
    );
    return r.rows[0].id as string;
  });
}

export async function removeStage(tenantId: string, stageId: string) {
  await withTenant(tenantId, async (c) => {
    await c.query(`DELETE FROM funnel_stages WHERE id=$1`, [stageId]);
  });
}

// ---- Sprint 4: offer read + AI actions + stage ops ------------------------

import { OfferActionBrain, type OfferAction } from '../../../packages/ai-core/src/brains/offer-action.js';

/** Read the latest offer for a funnel. */
export async function getOffer(tenantId: string, journeyId: string): Promise<{ offer: Offer; version: number } | null> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT content, version FROM offers WHERE journey_id=$1 ORDER BY version DESC LIMIT 1`, [journeyId]);
    if (!r.rowCount) return null;
    return { offer: r.rows[0].content as Offer, version: r.rows[0].version as number };
  });
}

/**
 * Run an AI action on a funnel's current offer. Returns a PREVIEW offer and logs
 * a versioned ai_outputs row — but does NOT persist it as the live offer. The
 * caller persists only on explicit apply (via updateOffer). This guarantees the
 * AI never overwrites the user's work without consent.
 */
export async function runOfferAction(
  tenantId: string,
  journeyId: string,
  action: OfferAction,
  llm: LLMClient,
): Promise<{ preview: Offer; degraded: boolean } | null> {
  const current = await getOffer(tenantId, journeyId);
  if (!current) return null;
  const gateway = new AIGateway(llm);
  const ctx = {
    tenantId,
    logOutput: async (row: AiOutputLogRow) => logAiOutputWithUsage(tenantId, row),
    logUsage: logAiUsageEvent,
  };
  const { output, degraded } = await gateway.run(OfferActionBrain, { offer: current.offer, action }, ctx);
  return { preview: output, degraded };
}

/** List a funnel's stages in order. */
export async function listStages(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM funnel_stages WHERE journey_id=$1 ORDER BY position`, [journeyId]);
    return r.rows;
  });
}

/** Reorder stages: takes an ordered array of stage ids and rewrites positions. */
export async function reorderStages(tenantId: string, journeyId: string, orderedIds: string[]): Promise<void> {
  await withTenant(tenantId, async (c) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await c.query(
        `UPDATE funnel_stages SET position=$2, updated_at=now() WHERE id=$1 AND journey_id=$3`,
        [orderedIds[i], i, journeyId],
      );
    }
  });
}
