import { withTenant } from '../../../packages/db/src/router.js';
import { classifyIncidents, highestSeverity, type OperatingEvidence, type Incident } from './incidents.js';
import { decideGate, type DecisionResult } from './decision.js';

/**
 * Operating Room service. Composes the EXISTING evidence surfaces (health,
 * release checker, activation, support snapshot, ops) into one operating view
 * for a customer's first week. No parallel truth, no new storage, no secrets,
 * no fabricated revenue.
 */

async function gatherEvidence(tenantId: string, funnelId: string): Promise<OperatingEvidence> {
  const { fullHealth } = await import('../../release/src/health.js');
  const { runReleaseChecker } = await import('../../release/src/checker.js');
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const { customerSnapshot } = await import('../../customer-zero/src/support.js');
  const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');

  const health = await fullHealth();
  const hl = (name: string) => health.checks.find((c) => c.name === name)?.status ?? 'ok';
  const rc = await runReleaseChecker({ probeProvisioning: false }).catch(() => ({ pass: false, blocking: [{ message: 'release checker error' }] } as any));
  const act = await getActivationStatus(tenantId, funnelId).catch(() => null);
  const snap = await customerSnapshot(tenantId, funnelId);
  const desk = await getRevenueDesk(tenantId, funnelId).catch(() => null) as any;

  // ops failures over 24h (from existing tables, scoped)
  const ops = await withTenant(tenantId, async (c) => {
    const n = async (sql: string): Promise<number> => { try { return (await c.query(sql)).rows[0]?.n ?? 0; } catch { return 0; } };
    return {
      jobFailures24h: await n(`SELECT COUNT(*)::int AS n FROM scheduled_runs WHERE status='failed' AND created_at > now() - INTERVAL '24 hours'`),
      webhookFailures24h: snap.webhookFailures24h,
      retriesPending: snap.retriesPending,
      abandoned24h: await n(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status='abandoned' AND created_at > now() - INTERVAL '24 hours'`),
    };
  });

  return {
    health: { control_db: hl('control_db') as any, integrations: hl('integrations') as any, llm: hl('llm') as any, jobs: hl('jobs') as any },
    releaseChecker: { pass: rc.pass, blocking: (rc.blocking ?? []).map((b: any) => b.message) },
    isProd: process.env.NODE_ENV === 'production',
    devTrustInProd: process.env.NODE_ENV === 'production' && process.env.FNNLR_DEV_MODE === 'true',
    encryptionFailClosed: rc.checklist ? !rc.checklist.some((c: any) => c.id === 'failclosed:encryption' && c.level === 'fail') : true,
    activation: act ? { stage: act.stage, launchReady: act.launchReady, blockingReason: act.blockingReason } : null,
    signals: snap.liveSignals,
    desk: desk ? { activationMode: desk.activationMode === true, itemCount: desk.items?.length ?? 0 } : null,
    ops,
    recommendations: { count: snap.recommendations, outcomesMeasured: snap.outcomesMeasured },
  };
}

export type DailyStatus = 'PASS' | 'WARN' | 'BLOCKED';

export interface DailyCheck {
  status: DailyStatus;
  activationStage: string | null;
  readinessScore: number | null;
  signals24h: OperatingEvidence['signals'];
  revenueDeskTop: string | null;
  recommendations: number;
  outcomesMeasured: number;
  incidents: Incident[];
  highestSeverity: string | null;
  decision: DecisionResult;
  nextAction: string;
}

export async function dailyCheck(tenantId: string, funnelId: string): Promise<DailyCheck> {
  const e = await gatherEvidence(tenantId, funnelId);
  const incidents = classifyIncidents(e);
  const decision = decideGate(e, incidents);
  const sev = highestSeverity(incidents);

  // status: BLOCKED if P0/P1 or gate blocks; WARN if P2 or needs-config; else PASS
  let status: DailyStatus = 'PASS';
  if (sev === 'P0' || sev === 'P1' || decision.decision === 'ROLLBACK_OR_DISABLE') status = 'BLOCKED';
  else if (decision.decision === 'NEEDS_CONFIGURATION' || decision.decision === 'HOLD' || sev === 'P2') status = 'WARN';

  const { activationSummary } = await import('../../activation/src/service.js');
  const actS = await activationSummary(tenantId, funnelId).catch(() => null);
  const { revenueDeskSummary } = await import('../../revenue-desk/src/service.js');
  const deskS = await revenueDeskSummary(tenantId, funnelId).catch(() => null);

  return {
    status,
    activationStage: actS?.stage ?? null,
    readinessScore: actS?.readinessScore ?? null,
    signals24h: e.signals,
    revenueDeskTop: deskS?.top?.title ?? null,
    recommendations: e.recommendations.count,
    outcomesMeasured: e.recommendations.outcomesMeasured,
    incidents,
    highestSeverity: sev,
    decision,
    nextAction: decision.nextAction,
  };
}

/** Customer-facing status: safe, plain, no stack traces, no secrets, no fake results. */
export async function customerStatus(tenantId: string, funnelId: string): Promise<{
  configured: string[]; signalsArrived: string[]; stillMissing: string[]; watching: string[]; nextAction: string; needsCustomerInput: string[];
}> {
  const e = await gatherEvidence(tenantId, funnelId);
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const act = await getActivationStatus(tenantId, funnelId).catch(() => null);

  const configured: string[] = [];
  const stillMissing: string[] = [];
  if (act) for (const s of act.steps) {
    if (s.section === 'setup' || s.section === 'publish') (s.status === 'done' ? configured : stillMissing).push(s.label);
  }

  const signalsArrived: string[] = [];
  if (e.signals.pageViews > 0) signalsArrived.push(`زيارات للصفحة: ${e.signals.pageViews}`);
  if (e.signals.whatsappClicks > 0) signalsArrived.push(`ضغطات واتساب: ${e.signals.whatsappClicks}`);
  if (e.signals.leads > 0) signalsArrived.push(`عملاء محتملين: ${e.signals.leads}`);
  if (e.signals.paymentStates > 0) signalsArrived.push(`حالات دفع: ${e.signals.paymentStates}`);

  const needsCustomerInput: string[] = [];
  if (!e.activation?.launchReady && act?.blockingReason) needsCustomerInput.push(act.blockingReason);
  if (e.signals.pageViews === 0 && e.signals.whatsappClicks === 0) needsCustomerInput.push('ابعت أول ترافيك للصفحة.');

  return {
    configured,
    signalsArrived: signalsArrived.length ? signalsArrived : ['لسه مفيش إشارات حيّة.'],
    stillMissing,
    watching: ['التفعيل', 'أول زيارة/ضغطة', 'أول عميل محتمل', 'حالات الدفع'],
    nextAction: act?.nextAction?.nextAction ?? 'كل خطوات الإعداد تمّت — استنى أول إشارة.',
    needsCustomerInput,
  };
}

export interface Week1Review {
  activationStage: string | null;
  firstSignalAt: string | null;
  totals: { pageViews: number; whatsappClicks: number; leads: number; paymentStates: number };
  topRevenueDeskItems: string[];
  recommendations: number;
  actionsApplied: number;
  outcomesMeasured: number;
  knownPaymentAmount: number | null;   // only when a real amount exists; otherwise null
  incidents: Incident[];
  unresolvedBlockers: string[];
  dataQuality: string;
  decision: DecisionResult;
}

export async function week1Review(tenantId: string, funnelId: string): Promise<Week1Review> {
  const e = await gatherEvidence(tenantId, funnelId);
  const incidents = classifyIncidents(e);
  const decision = decideGate(e, incidents);

  const extra = await withTenant(tenantId, async (c) => {
    const scalar = async (sql: string): Promise<any> => { try { return (await c.query(sql)).rows[0] ?? null; } catch { return null; } };
    const firstSignal = await scalar(`SELECT MIN(occurred_at) AS t FROM page_events`);
    const applied = await scalar(`SELECT COUNT(*)::int AS n FROM action_recommendations WHERE status='applied' AND funnel_id='${funnelId}'`).catch(() => null);
    const deskItems = (await c.query(`SELECT title FROM revenue_opportunities WHERE funnel_id=$1 AND status IN ('open','in_progress') ORDER BY priority_score DESC LIMIT 5`, [funnelId]).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => r.title);
    // a KNOWN payment amount only if a real, non-null amount was recorded
    const amt = await scalar(`SELECT SUM(amount)::numeric AS s FROM payment_states WHERE amount IS NOT NULL`).catch(() => null);
    return { firstSignalAt: firstSignal?.t ?? null, actionsApplied: applied?.n ?? 0, deskItems, knownAmount: amt?.s != null ? Number(amt.s) : null };
  });

  return {
    activationStage: e.activation?.stage ?? null,
    firstSignalAt: extra.firstSignalAt ? new Date(extra.firstSignalAt).toISOString() : null,
    totals: e.signals,
    topRevenueDeskItems: extra.deskItems,
    recommendations: e.recommendations.count,
    actionsApplied: extra.actionsApplied,
    outcomesMeasured: e.recommendations.outcomesMeasured,
    knownPaymentAmount: extra.knownAmount,   // null unless a real amount exists — never fabricated
    incidents,
    unresolvedBlockers: [...decision.blockers],
    dataQuality: e.signals.leads >= 5 ? 'enough real activity for early signals' : 'limited — not enough activity for confident conclusions yet',
    decision,
  };
}

export type TriageIssue =
  | 'activation_stuck' | 'no_page_events' | 'no_whatsapp_leads' | 'webhook_failure'
  | 'payment_state_issue' | 'revenue_desk_empty' | 'recommendation_missing' | 'login_issue' | 'jobs_failed';

export interface TriageResult { issue: TriageIssue; checks: { name: string; result: string }[]; probableCause: string; safeNextAction: string; manualDbEdit: 'forbidden' | 'emergency_only'; }

export async function triage(tenantId: string, funnelId: string, issue: TriageIssue, ctx: { leadId?: string; connectionId?: string } = {}): Promise<TriageResult> {
  const checks: { name: string; result: string }[] = [];
  const add = (name: string, result: string) => checks.push({ name, result });

  return withTenant(tenantId, async (c) => {
    const n = async (sql: string, p: any[] = []): Promise<number> => { try { return (await c.query(sql, p)).rows[0]?.n ?? 0; } catch { return 0; } };

    if (issue === 'activation_stuck') {
      const { getActivationStatus } = await import('../../activation/src/service.js');
      const act = await getActivationStatus(tenantId, funnelId).catch(() => null);
      const missing = act ? act.steps.filter((s: any) => s.status !== 'done').slice(0, 5).map((s: any) => `${s.label}: ${s.nextAction}`) : [];
      missing.forEach((m, i) => add(`missing_step_${i + 1}`, m));
      return { issue, checks, probableCause: act?.blockingReason ?? 'missing setup evidence', safeNextAction: act?.nextAction?.nextAction ?? 'complete the next activation step', manualDbEdit: 'forbidden' };
    }
    if (issue === 'no_page_events' || issue === 'no_whatsapp_leads') {
      const links = await n(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [funnelId]);
      const pages = await n(`SELECT COUNT(*)::int AS n FROM pages WHERE journey_id=$1 AND COALESCE(published,FALSE)=TRUE`, [funnelId]);
      const views = await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1`, [funnelId]);
      const leads = await n(`SELECT COUNT(*)::int AS n FROM leads`);
      add('published_pages', String(pages)); add('tracked_links', String(links)); add('page_events', String(views)); add('leads', String(leads));
      const cause = pages === 0 ? 'no published page' : links === 0 ? 'no tracked link' : views === 0 ? 'no traffic reached the page' : leads === 0 ? 'traffic arrived but no lead created — check inbound mapping' : 'flow appears healthy';
      return { issue, checks, probableCause: cause, safeNextAction: pages === 0 ? 'publish the page' : links === 0 ? 'create a tracked WhatsApp link' : 'drive/verify first traffic', manualDbEdit: 'forbidden' };
    }
    if (issue === 'webhook_failure') {
      const conn = ctx.connectionId ? await n(`SELECT COUNT(*)::int AS n FROM integration_connections WHERE id=$1`, [ctx.connectionId]) : await n(`SELECT COUNT(*)::int AS n FROM integration_connections`);
      const errs = await n(`SELECT COUNT(*)::int AS n FROM integration_events WHERE processed_status='error' AND created_at > now() - INTERVAL '24 hours'`);
      const failed = await n(`SELECT COUNT(*)::int AS n FROM webhook_deliveries WHERE status IN ('failed','abandoned') AND created_at > now() - INTERVAL '24 hours'`);
      add('connections', String(conn)); add('inbound_errors_24h', String(errs)); add('outbound_failures_24h', String(failed));
      return { issue, checks, probableCause: errs > 0 ? 'inbound events erroring (check signature/connection)' : failed > 0 ? 'outbound deliveries failing (check destination)' : 'no recent webhook failures found', safeNextAction: 'verify the webhook secret + connection status; retries are automatic with backoff', manualDbEdit: 'forbidden' };
    }
    if (issue === 'payment_state_issue') {
      const ps = await n(`SELECT COUNT(*)::int AS n FROM payment_states`);
      const pm = await n(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [funnelId]);
      add('payment_methods', String(pm)); add('payment_states', String(ps));
      return { issue, checks, probableCause: pm === 0 ? 'no payment method configured' : ps === 0 ? 'no payment states yet (expected until a customer pays)' : 'payment states present', safeNextAction: pm === 0 ? 'configure a payment method + instructions' : 'no action — fnnlr records manual payment state, it does not process payments', manualDbEdit: 'forbidden' };
    }
    if (issue === 'revenue_desk_empty') {
      const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');
      const desk = await getRevenueDesk(tenantId, funnelId).catch(() => null) as any;
      const leads = await n(`SELECT COUNT(*)::int AS n FROM leads`);
      add('desk_activation_mode', String(desk?.activationMode === true)); add('desk_items', String(desk?.items?.length ?? 0)); add('leads', String(leads));
      return { issue, checks, probableCause: desk?.activationMode ? 'activation mode — no real signal yet (expected)' : leads === 0 ? 'no leads yet' : 'real signal exists but desk empty — escalate', safeNextAction: desk?.activationMode ? 'drive first traffic/lead' : 'escalate to platform if leads exist but desk is empty', manualDbEdit: 'forbidden' };
    }
    if (issue === 'recommendation_missing') {
      const recs = await n(`SELECT COUNT(*)::int AS n FROM action_recommendations WHERE funnel_id=$1`, [funnelId]);
      add('recommendations', String(recs));
      return { issue, checks, probableCause: recs === 0 ? 'insufficient observed evidence for recommendations' : 'recommendations exist', safeNextAction: 'recommendations appear once there is enough real activity', manualDbEdit: 'forbidden' };
    }
    if (issue === 'jobs_failed') {
      const failed = await n(`SELECT COUNT(*)::int AS n FROM scheduled_runs WHERE status='failed' AND created_at > now() - INTERVAL '24 hours'`);
      add('job_failures_24h', String(failed));
      return { issue, checks, probableCause: failed > 0 ? 'scheduled jobs failing — inspect errors' : 'no recent job failures', safeNextAction: 'check /ops/status; FNNLR_DISABLE_JOBS=true pauses jobs while investigating', manualDbEdit: 'emergency_only' };
    }
    // login_issue
    add('note', 'login issues are control-plane scoped; check user existence + session validity');
    return { issue, checks, probableCause: 'auth/session — check control-plane', safeNextAction: 'verify the user exists and the session is valid; never expose password hashes', manualDbEdit: 'forbidden' };
  });
}
