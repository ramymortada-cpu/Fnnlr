import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Customer Zero support snapshot + release decision. Admin-only, read-only,
 * no secrets. The snapshot gives support a one-call triage view; the release
 * decision turns the release checker + a config into a clear READY / BLOCKED.
 */

export interface SupportSnapshot {
  activation: { stage: string; readinessScore: number; nextAction: string | null } | null;
  revenueDeskTop: string | null;
  liveSignals: { pageViews: number; whatsappClicks: number; leads: number; paymentStates: number };
  errors24h: number;
  webhookFailures24h: number;
  retriesPending: number;
  scheduledRuns24h: number;
  recommendations: number;
  outcomesMeasured: number;
}

export async function customerSnapshot(tenantId: string, funnelId: string): Promise<SupportSnapshot> {
  const { activationSummary } = await import('../../activation/src/service.js');
  const { revenueDeskSummary } = await import('../../revenue-desk/src/service.js');
  const act = await activationSummary(tenantId, funnelId).catch(() => null);
  const desk = await revenueDeskSummary(tenantId, funnelId).catch(() => null);

  const counts = await withTenant(tenantId, async (c) => {
    const n = async (sql: string, params: any[] = []): Promise<number> => { try { return (await c.query(sql, params)).rows[0]?.n ?? 0; } catch { return 0; } };
    return {
      pageViews: await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 AND pe.type IN ('view','page_view')`, [funnelId]),
      whatsappClicks: await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 AND pe.type IN ('cta_click','whatsapp_click')`, [funnelId]),
      leads: await n(`SELECT COUNT(*)::int AS n FROM leads`),
      paymentStates: await n(`SELECT COUNT(*)::int AS n FROM payment_states`),
      errors24h: await n(`SELECT COUNT(*)::int AS n FROM integration_events WHERE processed_status='error' AND created_at > now() - INTERVAL '24 hours'`),
      webhookFailures24h: await n(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status IN ('failed','abandoned') AND created_at > now() - INTERVAL '24 hours'`),
      retriesPending: await n(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status='retrying'`),
      scheduledRuns24h: await n(`SELECT COUNT(*)::int AS n FROM scheduled_runs WHERE created_at > now() - INTERVAL '24 hours'`),
      recommendations: await n(`SELECT COUNT(*)::int AS n FROM action_recommendations WHERE funnel_id=$1`, [funnelId]),
      outcomesMeasured: await n(`SELECT COUNT(*)::int AS n FROM recommendation_outcomes WHERE funnel_id=$1`, [funnelId]),
    };
  });

  return {
    activation: act ? { stage: act.stage, readinessScore: act.readinessScore, nextAction: act.nextAction?.nextAction ?? null } : null,
    revenueDeskTop: desk?.top?.title ?? null,
    liveSignals: { pageViews: counts.pageViews, whatsappClicks: counts.whatsappClicks, leads: counts.leads, paymentStates: counts.paymentStates },
    errors24h: counts.errors24h,
    webhookFailures24h: counts.webhookFailures24h,
    retriesPending: counts.retriesPending,
    scheduledRuns24h: counts.scheduledRuns24h,
    recommendations: counts.recommendations,
    outcomesMeasured: counts.outcomesMeasured,
  };
}

export interface ReleaseDecision {
  decision: 'READY_FOR_CUSTOMER_ZERO' | 'BLOCKED';
  blocking: string[];
  warnings: string[];
  manualSteps: string[];
  nextAction: string;
  owner: string | null;
}

/** Combine the release checker + config validation into a single go/no-go. */
export async function releaseDecision(cfg: { supportOwner?: string } = {}): Promise<ReleaseDecision> {
  const { runReleaseChecker } = await import('../../release/src/checker.js');
  const rc = await runReleaseChecker({ probeProvisioning: false });
  const blocking = rc.blocking.map((b) => b.message);
  const warnings = rc.warnings.map((w) => w.message);
  const manualSteps: string[] = [];
  if (!process.env.ANTHROPIC_API_KEY) manualSteps.push('Set ANTHROPIC_API_KEY for full AI (otherwise degraded fallback).');
  if (process.env.FNNLR_DISABLE_JOBS === 'true') manualSteps.push('Scheduled jobs are disabled (kill-switch). Enable when ready.');

  const ready = blocking.length === 0;
  return {
    decision: ready ? 'READY_FOR_CUSTOMER_ZERO' : 'BLOCKED',
    blocking, warnings, manualSteps,
    nextAction: ready ? 'Run customer:create then customer:smoke.' : 'Resolve blocking issues, then re-run deploy:check.',
    owner: cfg.supportOwner ?? null,
  };
}
