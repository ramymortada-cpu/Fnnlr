import { withTenant } from '../../../packages/db/src/router.js';
import { detectDue, type DueCandidate } from './due.js';
import { anthropicLLM, failingLLM } from '../../../packages/ai-core/src/llm.js';

const llmFor = (_tenantId: string) => (process.env.ANTHROPIC_API_KEY ? anthropicLLM() : failingLLM);

/**
 * Scheduled intelligence — the operating rhythm of fnnlr. Every run is
 * idempotent (one per job_type + idempotency_key), audited (scheduled_runs +
 * scheduled_run_items), and safe to retry. No external sending, no auto-apply,
 * no fabricated results — jobs only refresh records and surface what needs
 * attention.
 */

async function emit(c: any, type: string, payload: unknown) {
  await c.query(`INSERT INTO events (type, source, payload) VALUES ($1,'scheduler',$2)`, [type, JSON.stringify(payload ?? {})]);
}

/** Day bucket for idempotency (UTC date). */
function dayKey(d = new Date()): string { return d.toISOString().slice(0, 10); }
/** ISO week bucket for weekly idempotency. */
function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}

/**
 * Start (or resume) an idempotent run. If a run with the same job_type +
 * idempotency_key already completed, returns it without re-executing.
 */
async function beginRun(c: any, jobType: string, targetType: string, targetId: string | null, idem: string) {
  const existing = (await c.query(`SELECT * FROM scheduled_runs WHERE job_type=$1 AND idempotency_key=$2`, [jobType, idem])).rows[0];
  if (existing && existing.status === 'completed') return { run: existing, alreadyDone: true };
  if (existing) {
    await c.query(`UPDATE scheduled_runs SET status='running', started_at=now(), error=NULL WHERE id=$1`, [existing.id]);
    return { run: existing, alreadyDone: false };
  }
  const r = await c.query(
    `INSERT INTO scheduled_runs (job_type, target_type, target_id, status, idempotency_key, started_at)
     VALUES ($1,$2,$3,'running',$4, now()) RETURNING *`, [jobType, targetType, targetId, idem]);
  return { run: r.rows[0], alreadyDone: false };
}

async function finishRun(c: any, runId: string, status: string, summary: unknown, error?: string) {
  await c.query(`UPDATE scheduled_runs SET status=$2, finished_at=now(), summary=$3, error=$4 WHERE id=$1`,
    [runId, status, JSON.stringify(summary ?? {}), error ?? null]);
}

async function addItem(c: any, runId: string, itemType: string, itemId: string | null, status: string, message: string, metadata?: unknown) {
  await c.query(`INSERT INTO scheduled_run_items (run_id, item_type, item_id, status, message, metadata) VALUES ($1,$2,$3,$4,$5,$6)`,
    [runId, itemType, itemId, status, message, JSON.stringify(metadata ?? {})]);
}

async function getBusinessId(c: any): Promise<string | null> {
  return (await c.query(`SELECT id FROM businesses ORDER BY created_at LIMIT 1`)).rows[0]?.id ?? null;
}

// ============================================================================
// Outcome-due checks (repairs + playbook applications)
// ============================================================================

const REPAIR_MIN_HOURS: Record<string, number> = {
  payment_recovery: 24, access_delivery_fix: 12, whatsapp_first_reply: 24, whatsapp_followup: 24,
  page_cta_fix: 48, page_hero_fix: 48, followup_fix: 24, tracking_fix: 24, attribution_fix: 24,
};
const APP_MIN_HOURS: Record<string, number> = { page: 48, whatsapp: 24, payment: 24, followup: 24, offer: 48, funnel: 48, all: 48 };

/** Find repairs due for outcome measurement (does NOT measure — surfaces only). */
export async function repairOutcomeDueCheck(tenantId: string) {
  return runIdempotent(tenantId, 'repair_outcome_due_check', 'business', dayKey(), async (c, runId) => {
    const rows = (await c.query(
      `SELECT rp.id, rp.type, EXTRACT(EPOCH FROM (now()-rp.applied_at))/3600 AS hours,
              (SELECT status FROM repair_outcomes o WHERE o.repair_plan_id=rp.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
         FROM repair_plans rp WHERE rp.applied_at IS NOT NULL AND rp.status IN ('applied','partially_applied')`)).rows;
    const candidates: DueCandidate[] = rows.map((r: any) => ({ id: r.id, appliedHoursAgo: Number(r.hours), lastOutcome: r.last_outcome, minHours: REPAIR_MIN_HOURS[r.type] ?? 24 }));
    const due = detectDue(candidates);
    for (const d of due) await addItem(c, runId, 'repair_due', d.id, 'completed', d.reason);
    return { due: due.length, checked: candidates.length };
  });
}

/** Find playbook applications due for outcome measurement (surfaces only). */
export async function applicationOutcomeDueCheck(tenantId: string) {
  return runIdempotent(tenantId, 'playbook_application_outcome_due_check', 'business', dayKey(), async (c, runId) => {
    const rows = (await c.query(
      `SELECT ap.id, ap.scope, EXTRACT(EPOCH FROM (now()-ap.applied_at))/3600 AS hours,
              (SELECT status FROM playbook_application_outcomes o WHERE o.application_plan_id=ap.id ORDER BY measured_at DESC LIMIT 1) AS last_outcome
         FROM playbook_application_plans ap WHERE ap.applied_at IS NOT NULL AND ap.status IN ('applied','partially_applied')`)).rows;
    const candidates: DueCandidate[] = rows.map((r: any) => ({ id: r.id, appliedHoursAgo: Number(r.hours), lastOutcome: r.last_outcome, minHours: APP_MIN_HOURS[r.scope] ?? 24 }));
    const due = detectDue(candidates);
    for (const d of due) await addItem(c, runId, 'application_due', d.id, 'completed', d.reason);
    return { due: due.length, checked: candidates.length };
  });
}

// ============================================================================
// Stale data check
// ============================================================================

export async function staleDataCheck(tenantId: string) {
  return runIdempotent(tenantId, 'stale_data_check', 'business', dayKey(), async (c, runId) => {
    // portfolio insights older than 7d → stale
    const stalePortfolio = await c.query(
      `UPDATE portfolio_insights SET stale=TRUE
        WHERE status='open' AND stale=FALSE AND created_at < now() - INTERVAL '7 days' RETURNING id`);
    for (const r of stalePortfolio.rows) await addItem(c, runId, 'stale_portfolio_insight', r.id, 'completed', 'older than 7 days');
    // reports older than 7d → stale
    const staleReports = await c.query(
      `UPDATE reports SET stale=TRUE WHERE stale=FALSE AND created_at < now() - INTERVAL '7 days' RETURNING id`).catch(() => ({ rows: [] }));
    for (const r of staleReports.rows) await addItem(c, runId, 'stale_report', r.id, 'completed', 'older than 7 days');
    return { stalePortfolio: stalePortfolio.rows.length, staleReports: staleReports.rows.length };
  });
}

// ============================================================================
// Portfolio analysis refresh
// ============================================================================

export async function portfolioAnalysisRefresh(tenantId: string) {
  // delegate to the portfolio service; wrap in an audited run
  return runIdempotent(tenantId, 'portfolio_analysis_refresh', 'business', dayKey(), async (c, runId) => {
    const { analyzePortfolio } = await import('../../portfolio/src/service.js');
    // analyzePortfolio opens its own tenant scope; call outside this connection
    return { deferred: true, runId };
  }, async (tenantId2, runId) => {
    const { analyzePortfolio } = await import('../../portfolio/src/service.js');
    const r = await analyzePortfolio(tenantId2).catch(() => null) as any;
    await withTenant(tenantId2, async (c) => {
      await c.query(`UPDATE portfolio_insights SET last_refreshed_at=now() WHERE status='open'`);
      await addItem(c, runId, 'portfolio_analyzed', null, 'completed', `insights=${r?.insights ?? 0} transfers=${r?.transfers ?? 0}`);
    });
    return { insights: r?.insights ?? 0, transfers: r?.transfers ?? 0 };
  });
}

// ============================================================================
// Daily business refresh — orchestrates the rhythm
// ============================================================================

export async function dailyBusinessRefresh(tenantId: string) {
  const idem = dayKey();
  // idempotency check up front
  const pre = await withTenant(tenantId, async (c) => {
    const existing = (await c.query(`SELECT * FROM scheduled_runs WHERE job_type='daily_business_refresh' AND idempotency_key=$1`, [idem])).rows[0];
    return existing && existing.status === 'completed' ? existing : null;
  });
  if (pre) return { runId: pre.id, alreadyDone: true, summary: pre.summary };

  const { run } = await withTenant(tenantId, async (c) => beginRun(c, 'daily_business_refresh', 'business', await getBusinessId(c), idem));
  const runId = run.id;
  const summary: any = { funnelsChecked: 0, newLeaks: 0, actionsCreated: 0, repairsDue: 0, applicationsDue: 0, portfolioInsights: 0, stale: 0, skipped: 0 };

  try {
    // 1. funnels list
    const funnels = await withTenant(tenantId, async (c) => (await c.query(`SELECT id, name FROM journeys WHERE deleted_at IS NULL`)).rows);
    summary.funnelsChecked = funnels.length;

    // 2. refresh actions + leaks + opportunities per funnel (leak refresh only when enough data)
    const { refreshActions } = await import('../../actions/src/service.js');
    const { runDiagnosis } = await import('../../leaks/src/service.js');
    const { refreshOpportunities } = await import('../../opportunities/src/service.js');
    const { checkOpportunityOutcome } = await import('../../opportunities/src/outcomes.js');
    const { refreshRecommendations } = await import('../../recommendations/src/service.js');
    summary.opportunities = 0; summary.opportunitiesChecked = 0; summary.recommendations = 0;
    for (const f of funnels) {
      const acts = await refreshActions(tenantId, f.id).catch(() => []);
      summary.actionsCreated += acts.length;
      const opp = await refreshOpportunities(tenantId, f.id).catch(() => null) as any;
      if (opp) summary.opportunities += (opp.created ?? 0);
      // re-check outcomes of open opportunities (evidence-based capture/expire)
      const openOpps = await withTenant(tenantId, async (cc) =>
        (await cc.query(`SELECT id FROM revenue_opportunities WHERE funnel_id=$1 AND status IN ('open','in_progress')`, [f.id]).catch(() => ({ rows: [] }))).rows);
      for (const op of openOpps) { await checkOpportunityOutcome(tenantId, op.id).catch(() => null); summary.opportunitiesChecked++; }
      // refresh recommendations from the (now-updated) opportunities + attribution learning
      const rc = await refreshRecommendations(tenantId, f.id).catch(() => null) as any;
      if (rc) summary.recommendations += (rc.created ?? 0);
      // check outcomes of applied recommendations (evidence-based)
      const { checkRecommendationOutcome } = await import('../../recommendations/src/outcomes.js');
      const appliedRecs = await withTenant(tenantId, async (cc) =>
        (await cc.query(`SELECT id FROM action_recommendations WHERE funnel_id=$1 AND status='applied' AND (last_outcome_status IS NULL OR last_outcome_status IN ('awaiting_evidence','early_signal'))`, [f.id]).catch(() => ({ rows: [] }))).rows);
      summary.recommendationsChecked = (summary.recommendationsChecked ?? 0);
      for (const rr of appliedRecs) { await checkRecommendationOutcome(tenantId, rr.id).catch(() => null); summary.recommendationsChecked++; }
      const diag = await runDiagnosis(tenantId, f.id).catch(() => ({ enoughData: false, findings: [] as any[] })) as any;
      if (diag.enoughData) {
        summary.newLeaks += (diag.findings?.length ?? 0);
        await withTenant(tenantId, async (c) => {
          await c.query(`UPDATE leak_findings SET last_refreshed_at=now() WHERE journey_id=$1 AND status IN ('open','fixing')`, [f.id]);
          await addItem(c, runId, 'funnel_refreshed', f.id, 'completed', `leaks=${diag.findings?.length ?? 0} actions=${acts.length}`);
        });
      } else {
        summary.skipped++;
        await withTenant(tenantId, async (c) => addItem(c, runId, 'funnel_refreshed', f.id, 'skipped', 'insufficient data for diagnosis'));
      }
    }

    // 3. outcome-due checks (surface only, no measurement)
    const rd = await repairOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
    const ad = await applicationOutcomeDueCheck(tenantId).catch(() => ({ due: 0 })) as any;
    summary.repairsDue = rd.due ?? 0; summary.applicationsDue = ad.due ?? 0;

    // 4. portfolio refresh
    const pr = await portfolioAnalysisRefresh(tenantId).catch(() => ({ insights: 0 })) as any;
    summary.portfolioInsights = pr.insights ?? 0;

    // 5. stale check
    const st = await staleDataCheck(tenantId).catch(() => ({ stalePortfolio: 0, staleReports: 0 })) as any;
    summary.stale = (st.stalePortfolio ?? 0) + (st.staleReports ?? 0);

    summary.itemsNeedingAttention = summary.repairsDue + summary.applicationsDue + summary.newLeaks;
    await withTenant(tenantId, async (c) => { await finishRun(c, runId, 'completed', summary); await emit(c, 'daily_business_refresh_completed', summary); });
    return { runId, alreadyDone: false, summary };
  } catch (e: any) {
    await withTenant(tenantId, async (c) => finishRun(c, runId, 'failed', summary, String(e?.message ?? e).slice(0, 300)));
    return { runId, error: String(e?.message ?? e) };
  }
}

// ============================================================================
// Weekly business report — workspace-level, not a single funnel
// ============================================================================

export async function weeklyBusinessReport(tenantId: string) {
  const idem = weekKey();
  const pre = await withTenant(tenantId, async (c) => {
    const existing = (await c.query(`SELECT * FROM scheduled_runs WHERE job_type='weekly_business_report' AND idempotency_key=$1`, [idem])).rows[0];
    return existing && existing.status === 'completed' ? existing : null;
  });
  if (pre) return { runId: pre.id, alreadyDone: true, summary: pre.summary };

  const { run } = await withTenant(tenantId, async (c) => beginRun(c, 'weekly_business_report', 'business', await getBusinessId(c), idem));
  const runId = run.id;
  try {
    const { portfolioReportSummary, getPortfolioMetrics } = await import('../../portfolio/src/service.js');
    const portfolio = await portfolioReportSummary(tenantId).catch(() => null);
    const { opportunitySummary } = await import('../../opportunities/src/service.js');
    const opportunities = await opportunitySummary(tenantId).catch(() => null);
    const { outcomesSummary } = await import('../../opportunities/src/outcomes.js');
    const opportunityOutcomes = await outcomesSummary(tenantId).catch(() => null);
    const { attributionSummary } = await import('../../attribution/src/service.js');
    const attribution = await attributionSummary(tenantId).catch(() => null);
    const { recommendationsSummary } = await import('../../recommendations/src/service.js');
    const recommendations = await recommendationsSummary(tenantId).catch(() => null);
    const { recOutcomesSummary } = await import('../../recommendations/src/outcomes.js');
    const recommendationOutcomes = await recOutcomesSummary(tenantId).catch(() => null);
    const { funnels } = await getPortfolioMetrics(tenantId);
    // revenue desk snapshot for the primary funnel (top item + counts)
    const { revenueDeskSummary } = await import('../../revenue-desk/src/service.js');
    const primaryFunnel = (funnels as any[])[0];
    const revenueDesk = primaryFunnel ? await revenueDeskSummary(tenantId, primaryFunnel.funnelId ?? primaryFunnel.id).catch(() => null) : null;
    // per-funnel report headlines (reuse the funnel weekly report, honest + no fake ROI)
    const { generateReport } = await import('../../reports/src/service.js');
    const llm = llmFor(tenantId);
    const headlines: any[] = [];
    for (const f of (funnels as any[]).slice(0, 5)) {
      const rep = await generateReport(tenantId, f.funnelId, llm).catch(() => null) as any;
      if (rep) headlines.push({ funnelId: f.funnelId, name: f.name, summary: rep.report?.executiveSummary ?? null, health: f.health });
    }
    const summary = {
      funnels: (funnels as any[]).length,
      topFunnels: [...(funnels as any[])].sort((a, b) => b.health - a.health).slice(0, 3).map((f) => ({ name: f.name, health: f.health })),
      needingAttention: (funnels as any[]).filter((f) => f.openLeaks > 0 || !f.published || !f.hasTracking).map((f) => f.name),
      portfolio, opportunities, opportunityOutcomes, attribution, recommendations, recommendationOutcomes, revenueDesk, headlines,
    };
    await withTenant(tenantId, async (c) => {
      for (const h of headlines) await addItem(c, runId, 'funnel_report', h.funnelId, 'completed', h.name);
      await finishRun(c, runId, 'completed', summary);
      await emit(c, 'weekly_business_report_completed', { funnels: summary.funnels });
    });
    return { runId, alreadyDone: false, summary };
  } catch (e: any) {
    await withTenant(tenantId, async (c) => finishRun(c, runId, 'failed', {}, String(e?.message ?? e).slice(0, 300)));
    return { runId, error: String(e?.message ?? e) };
  }
}

// ============================================================================
// Generic idempotent run wrapper (for simple single-step jobs)
// ============================================================================

async function runIdempotent(
  tenantId: string, jobType: string, targetType: string, idem: string,
  fn: (c: any, runId: string) => Promise<any>,
  deferred?: (tenantId: string, runId: string) => Promise<any>,
) {
  const begun = await withTenant(tenantId, async (c) => {
    const b = await beginRun(c, jobType, targetType, await getBusinessId(c), idem);
    if (b.alreadyDone) return { run: b.run, alreadyDone: true, result: b.run.summary };
    return { run: b.run, alreadyDone: false };
  });
  if ((begun as any).alreadyDone) return { runId: begun.run.id, alreadyDone: true, ...(begun as any).result };

  const runId = begun.run.id;
  try {
    const inline = await withTenant(tenantId, async (c) => fn(c, runId));
    let result = inline;
    if (inline && inline.deferred && deferred) result = await deferred(tenantId, runId);
    await withTenant(tenantId, async (c) => finishRun(c, runId, 'completed', result));
    return { runId, alreadyDone: false, ...result };
  } catch (e: any) {
    await withTenant(tenantId, async (c) => finishRun(c, runId, 'failed', {}, String(e?.message ?? e).slice(0, 300)));
    return { runId, error: String(e?.message ?? e) };
  }
}

// ============================================================================
// Reads
// ============================================================================

export async function listRuns(tenantId: string, limit = 20) {
  return withTenant(tenantId, async (c) =>
    (await c.query(`SELECT * FROM scheduled_runs ORDER BY created_at DESC LIMIT $1`, [limit])).rows);
}

export async function getRun(tenantId: string, runId: string) {
  return withTenant(tenantId, async (c) => {
    const run = (await c.query(`SELECT * FROM scheduled_runs WHERE id=$1`, [runId])).rows[0];
    if (!run) return null;
    const items = (await c.query(`SELECT * FROM scheduled_run_items WHERE run_id=$1 ORDER BY created_at`, [runId])).rows;
    return { run, items };
  });
}

/** Operating-rhythm status: last runs of each kind + what's due. */
export async function rhythmStatus(tenantId: string) {
  return withTenant(tenantId, async (c) => {
    const last = async (jobType: string) =>
      (await c.query(`SELECT id, status, finished_at, summary FROM scheduled_runs WHERE job_type=$1 AND status='completed' ORDER BY finished_at DESC LIMIT 1`, [jobType])).rows[0] ?? null;
    const lastDaily = await last('daily_business_refresh');
    const lastWeekly = await last('weekly_business_report');
    const lastPortfolio = await last('portfolio_analysis_refresh');
    const openInsights = (await c.query(`SELECT COUNT(*)::int AS n FROM portfolio_insights WHERE status='open'`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    const staleInsights = (await c.query(`SELECT COUNT(*)::int AS n FROM portfolio_insights WHERE status='open' AND stale=TRUE`).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n;
    return { lastDaily, lastWeekly, lastPortfolio, openInsights, staleInsights };
  });
}
