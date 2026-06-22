import { withTenant } from '../../../packages/db/src/router.js';
import { buildAllPlaybooks, buildPlaybook, playbookToContext, type LearningInput, type PlaybookType, type PlaybookRecommendation } from './builder.js';

/**
 * Adaptive playbook service. Regenerates playbooks from accumulated learning,
 * persists them honestly (with sample size + confidence), and serves relevant
 * playbook context to the funnel/offer/page/whatsapp/payment brains. Nothing is
 * auto-applied; applying is recorded only when the user acts.
 */

async function loadLearning(c: any): Promise<LearningInput[]> {
  const r = await c.query(`SELECT repair_outcome_id AS "sourceId", repair_type AS "repairType", market, success_status AS "successStatus" FROM repair_learning_records`);
  // also fold in playbook-application outcomes (Sprint 22): playbook_type maps directly
  const appR = await c.query(
    `SELECT application_outcome_id AS "sourceId", playbook_type AS "repairType", market, status AS "successStatus" FROM playbook_application_learning_records`
  ).catch(() => ({ rows: [] }));
  return [...r.rows, ...appR.rows] as LearningInput[];
}

/** Current business market (for market-scoped playbooks). */
async function getMarket(c: any): Promise<string | null> {
  const r = await c.query(`SELECT market FROM businesses ORDER BY created_at LIMIT 1`).catch(() => ({ rows: [{}] }));
  return r.rows[0]?.market ?? null;
}

/** Regenerate and upsert all playbooks from current learning. Idempotent-ish. */
export async function regeneratePlaybooks(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const records = await loadLearning(c);
    const market = await getMarket(c);
    const recs = [...buildAllPlaybooks(records, null), ...(market ? buildAllPlaybooks(records, market) : [])];
    // archive previous, insert fresh (simple + honest; no stale confidence lingering)
    await c.query(`UPDATE adaptive_playbooks SET status='archived', updated_at=now() WHERE status='active'`);
    for (const p of recs) {
      await c.query(
        `INSERT INTO adaptive_playbooks (scope, playbook_type, market, recommendation, evidence_summary, sample_size, confidence, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'active')`,
        [p.scope, p.playbookType, p.market, JSON.stringify(p.recommendation), JSON.stringify(p.evidenceSummary), p.sampleSize, p.confidence]);
    }
    return { generated: recs.length };
  });
}

export async function listPlaybooks(tenantId: string) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM adaptive_playbooks WHERE status='active' ORDER BY playbook_type, scope DESC`)).rows);
}

/**
 * Get the most relevant active playbook of a type (prefers market scope when it
 * has data), rebuilt fresh from learning so context is never stale.
 */
export async function getRelevantPlaybook(tenantId: string, type: PlaybookType): Promise<PlaybookRecommendation> {
  return withTenant(tenantId, async (c) => {
    const records = await loadLearning(c);
    const market = await getMarket(c);
    if (market) {
      const scoped = buildPlaybook(type, records, market);
      if (!scoped.limited) return scoped;
    }
    return buildPlaybook(type, records, null);
  });
}

/** A short string a brain can fold into its prompt (or null if not useful). */
export async function getPlaybookContext(tenantId: string, type: PlaybookType): Promise<{ context: string | null; playbook: PlaybookRecommendation }> {
  const playbook = await getRelevantPlaybook(tenantId, type);
  return { context: playbookToContext(playbook), playbook };
}

/** Record that a playbook informed an object (no auto-apply; user-driven). */
export async function recordApplication(tenantId: string, input: { playbookType: PlaybookType; funnelId: string; objectType: string; objectId?: string; appliedBy?: string }) {
  return withTenant(tenantId, async (c) => {
    const pb = await c.query(`SELECT id FROM adaptive_playbooks WHERE playbook_type=$1 AND status='active' ORDER BY scope DESC LIMIT 1`, [input.playbookType]);
    await c.query(
      `INSERT INTO playbook_applications (playbook_id, funnel_id, object_type, object_id, applied_by)
       VALUES ($1,$2,$3,$4,$5)`,
      [pb.rows[0]?.id ?? null, input.funnelId, input.objectType, input.objectId ?? null, input.appliedBy ?? 'user']);
    return { ok: true };
  });
}

/** Explain a playbook for the command bar / "why is the funnel ordered this way?". */
export async function explainPlaybook(tenantId: string, type: PlaybookType) {
  const { playbook } = await getPlaybookContext(tenantId, type);
  return {
    playbookType: type,
    confidence: playbook.confidence,
    sampleSize: playbook.sampleSize,
    decidedCount: playbook.evidenceSummary.decidedCount,
    note: playbook.recommendation.note,
    adjustments: playbook.recommendation.adjustments,
    limited: playbook.limited,
  };
}

/** Roll up playbooks for the weekly report (which have data, which don't). */
export async function playbookReportSummary(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const records = await loadLearning(c);
    const all = buildAllPlaybooks(records, null);
    return {
      used: all.filter((p) => !p.limited).map((p) => ({ type: p.playbookType, confidence: p.confidence, note: p.recommendation.note })),
      insufficient: all.filter((p) => p.limited).map((p) => p.playbookType),
    };
  });
}
