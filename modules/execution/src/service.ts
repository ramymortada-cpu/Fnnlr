import { withTenant } from '../../../packages/db/src/router.js';
import { validateExecutionManifest, type ExecutionManifest } from './manifest.js';

/**
 * Execution service — the final gate and the launch-day mechanics for Customer
 * Zero. It composes the EXISTING checkers (release checker, activation, daily
 * check / incidents, support snapshot, smoke) into one execution lock. It claims
 * readiness only when all of them agree. No new feature, no parallel truth, no
 * fake revenue, no auto-send, no payment processing.
 */

export type LockStatus = 'READY' | 'WARN' | 'BLOCKED';

export interface ExecutionLock {
  status: LockStatus;
  checks: { id: string; level: 'ok' | 'warn' | 'fail'; message: string }[];
  blocking: string[];
  warnings: string[];
  decision: string;        // operating-room decision
  nextAction: string;
}

/**
 * The final gate before a real launch. Runs the release checker, validates the
 * manifest, confirms setup + activation + page/link/payment, and folds in the
 * operating-room decision. BLOCKED on any fail; WARN on needs-config / hold /
 * P2; READY only when everything is clean.
 */
export async function executionLock(tenantId: string, funnelId: string, manifest: Partial<ExecutionManifest>, opts: { production?: boolean } = {}): Promise<ExecutionLock> {
  const checks: ExecutionLock['checks'] = [];
  const add = (id: string, level: 'ok' | 'warn' | 'fail', message: string) => checks.push({ id, level, message });

  // 1) release checker
  const { runReleaseChecker } = await import('../../release/src/checker.js');
  const rc = await runReleaseChecker({ probeProvisioning: false }).catch(() => null);
  if (!rc) add('release_checker', 'fail', 'release checker could not run');
  else if (!rc.pass) add('release_checker', 'fail', `release checker blocking: ${rc.blocking.map((b) => b.message).slice(0, 2).join('; ')}`);
  else add('release_checker', 'ok', 'release checker passed');

  // 2) manifest valid
  const mv = validateExecutionManifest(manifest, opts);
  if (!mv.ok) mv.issues.filter((i) => i.level === 'fail').forEach((i) => add(`manifest:${i.field}`, 'fail', i.message));
  else add('manifest', 'ok', 'execution manifest valid');

  // 3) customer setup exists (business + funnel resolvable)
  const setup = await withTenant(tenantId, async (c) => {
    const fun = await c.query(`SELECT id, business_id FROM journeys WHERE id=$1 AND deleted_at IS NULL`, [funnelId]);
    return fun.rows[0] ?? null;
  }).catch(() => null);
  if (!setup) add('setup', 'fail', 'customer funnel not found'); else add('setup', 'ok', 'customer setup exists');

  // 4) activation: launch-ready (page published + link + payment)
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const act = setup ? await getActivationStatus(tenantId, funnelId).catch(() => null) : null;
  if (!act) add('activation', 'fail', 'activation status unavailable');
  else if (!act.launchReady) add('activation', 'fail', act.blockingReason ?? 'activation not launch-ready');
  else add('activation', 'ok', `activation launch-ready (${act.stage})`);

  // 5) explicit page/link/payment presence (clear messages even if activation aggregates them)
  if (setup) {
    const presence = await withTenant(tenantId, async (c) => ({
      publishedPage: (await c.query(`SELECT COUNT(*)::int AS n FROM pages WHERE journey_id=$1 AND COALESCE(published,FALSE)=TRUE`, [funnelId])).rows[0].n,
      link: (await c.query(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [funnelId])).rows[0].n,
      payment: (await c.query(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [funnelId])).rows[0].n,
    }));
    add('page_published', presence.publishedPage > 0 ? 'ok' : 'fail', presence.publishedPage > 0 ? 'page published' : 'no published page');
    add('tracked_link', presence.link > 0 ? 'ok' : 'fail', presence.link > 0 ? 'tracked WhatsApp link exists' : 'no tracked link');
    add('payment', presence.payment > 0 ? 'ok' : 'fail', presence.payment > 0 ? 'payment instructions configured' : 'no payment method');
  }

  // 6) operating room decision (no P0; no ROLLBACK)
  let decision = 'UNKNOWN';
  if (setup) {
    const { dailyCheck } = await import('../../operating-room/src/service.js');
    const dc = await dailyCheck(tenantId, funnelId).catch(() => null);
    if (dc) {
      decision = dc.decision.decision;
      const p0 = dc.incidents.filter((i) => i.severity === 'P0');
      const p1 = dc.incidents.filter((i) => i.severity === 'P1');
      if (p0.length) add('incidents', 'fail', `P0: ${p0[0].reason}`);
      else if (p1.length) add('incidents', 'warn', `P1: ${p1[0].reason}`);
      else add('incidents', 'ok', 'no P0/P1 incidents');
      if (decision === 'ROLLBACK_OR_DISABLE') add('operating_room', 'fail', 'operating room says ROLLBACK/DISABLE');
      else if (decision === 'NEEDS_CONFIGURATION' || decision === 'HOLD') add('operating_room', 'warn', `operating room decision: ${decision}`);
      else add('operating_room', 'ok', `operating room decision: ${decision}`);
    }
  }

  // 7) support snapshot safe (must not throw, must not carry secrets)
  if (setup) {
    const { customerSnapshot } = await import('../../customer-zero/src/support.js');
    const snap = await customerSnapshot(tenantId, funnelId).catch(() => null);
    const safe = snap && !/password|secret|token/i.test(JSON.stringify(snap));
    add('support_snapshot', safe ? 'ok' : 'fail', safe ? 'support snapshot safe' : 'support snapshot unavailable/unsafe');
  }

  const blocking = checks.filter((c) => c.level === 'fail').map((c) => c.message);
  const warnings = checks.filter((c) => c.level === 'warn').map((c) => c.message);
  const status: LockStatus = blocking.length ? 'BLOCKED' : warnings.length ? 'WARN' : 'READY';
  const nextAction = status === 'BLOCKED'
    ? `BLOCKED: ${blocking[0]}. Fix it, then re-run customer:launch-check and customer:execution-lock.`
    : status === 'WARN'
    ? `WARN: ${warnings[0]}. Review the owner/explanation; you may proceed if it's expected (e.g. no traffic yet).`
    : 'READY: release checker, manifest, activation, page/link/payment, operating room, and support snapshot all verified — proceed with the launch checklist.';
  return { status, checks, blocking, warnings, decision, nextAction };
}

/** Launch checklist — environment + customer + funnel + signals + operating room. */
export async function launchCheck(tenantId: string, funnelId: string): Promise<{ status: LockStatus; sections: Record<string, { id: string; level: 'ok' | 'warn' | 'fail'; message: string }[]> }> {
  const env: any[] = [], customer: any[] = [], funnel: any[] = [], signals: any[] = [], operating: any[] = [];
  const mk = (level: 'ok' | 'warn' | 'fail', id: string, message: string) => ({ id, level, message });

  // environment
  const { fullHealth } = await import('../../release/src/health.js');
  const health = await fullHealth();
  env.push(mk(health.checks.find((c) => c.name === 'control_db')?.status === 'ok' ? 'ok' : 'fail', 'db', health.checks.find((c) => c.name === 'control_db')?.status === 'ok' ? 'control DB reachable' : 'control DB unreachable → check CONTROL_PLANE_DATABASE_URL + run npm run verify:release-candidate'));
  env.push(mk(process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY ? 'ok' : (process.env.NODE_ENV === 'production' ? 'fail' : 'warn'), 'encryption', process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY ? 'encryption key present' : 'no encryption key → set INTEGRATION_ENCRYPTION_KEY (required in production)'));
  env.push(mk(process.env.FNNLR_CRON_SECRET ? 'ok' : 'warn', 'cron', process.env.FNNLR_CRON_SECRET ? 'cron secret present' : 'no cron secret → set FNNLR_CRON_SECRET so scheduled jobs can run'));

  // customer + funnel
  const info = await withTenant(tenantId, async (c) => ({
    funnel: (await c.query(`SELECT id, business_id FROM journeys WHERE id=$1 AND deleted_at IS NULL`, [funnelId])).rows[0] ?? null,
    offers: (await c.query(`SELECT COUNT(*)::int AS n FROM offers WHERE journey_id=$1`, [funnelId])).rows[0].n,
    publishedPage: (await c.query(`SELECT COUNT(*)::int AS n FROM pages WHERE journey_id=$1 AND COALESCE(published,FALSE)=TRUE`, [funnelId])).rows[0].n,
    anyPage: (await c.query(`SELECT COUNT(*)::int AS n FROM pages WHERE journey_id=$1`, [funnelId])).rows[0].n,
    link: (await c.query(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [funnelId])).rows[0].n,
    payment: (await c.query(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [funnelId])).rows[0].n,
  })).catch(() => null);
  customer.push(mk(info?.funnel ? 'ok' : 'fail', 'funnel', info?.funnel ? 'funnel exists' : 'no funnel → run customer:create, then customer:launch-check'));
  if (info) {
    funnel.push(mk(info.offers > 0 ? 'ok' : 'fail', 'offer', info.offers > 0 ? 'offer exists' : 'no offer → set it in Funnel → Offer'));
    funnel.push(mk(info.anyPage > 0 ? 'ok' : 'fail', 'page', info.anyPage > 0 ? 'page exists' : 'no page → create it in Funnel → Page'));
    funnel.push(mk(info.publishedPage > 0 ? 'ok' : 'fail', 'page_published', info.publishedPage > 0 ? 'page published' : 'page not published → publish in Funnel → Page, then re-run customer:launch-check'));
    funnel.push(mk(info.link > 0 ? 'ok' : 'fail', 'tracked_link', info.link > 0 ? 'tracked link exists' : 'no tracked link → create a WhatsApp link in Funnel → Links'));
    funnel.push(mk(info.payment > 0 ? 'ok' : 'fail', 'payment', info.payment > 0 ? 'payment method exists' : 'no payment method → add instructions in Funnel → Payment'));
  }

  // signals + operating room
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const act = await getActivationStatus(tenantId, funnelId).catch(() => null);
  if (act) {
    const view = act.steps.find((s: any) => s.id === 'first_page_view_seen');
    signals.push(mk(view?.status === 'done' ? 'ok' : 'warn', 'page_event', view?.status === 'done' ? 'page event observed' : 'no page event yet → share the tracked link / run customer:first-signal'));
    const lead = act.steps.find((s: any) => s.id === 'first_lead_created');
    signals.push(mk(lead?.status === 'done' ? 'ok' : 'warn', 'lead', lead?.status === 'done' ? 'lead created' : 'no lead yet → expected until a real WhatsApp click arrives'));
  }
  const { dailyCheck } = await import('../../operating-room/src/service.js');
  const dc = await dailyCheck(tenantId, funnelId).catch(() => null);
  if (dc) {
    const p0 = dc.incidents.some((i) => i.severity === 'P0');
    operating.push(mk(p0 ? 'fail' : 'ok', 'no_p0', p0 ? 'P0 incident present' : 'no P0'));
    operating.push(mk(dc.status === 'BLOCKED' ? 'fail' : dc.status === 'WARN' ? 'warn' : 'ok', 'daily_check', `daily check: ${dc.status} — ${dc.nextAction}`));
  }

  const all = [...env, ...customer, ...funnel, ...signals, ...operating];
  const status: LockStatus = all.some((c) => c.level === 'fail') ? 'BLOCKED' : all.some((c) => c.level === 'warn') ? 'WARN' : 'READY';
  return { status, sections: { environment: env, customer, funnel, signals, operating } };
}

/**
 * First-signal protocol. When script-generated, the event is MARKED as a smoke
 * test (identifiable/removable). A real customer event arriving via the normal
 * ingest path is NOT marked. Never creates fake revenue or payment state.
 */
const FIRST_SIGNAL_MARK = 'smoke:first-signal';
export async function firstSignal(tenantId: string, funnelId: string, opts: { scriptGenerated?: boolean } = {}): Promise<{ ok: boolean; marked: boolean; seenIn: string[]; note: string }> {
  const page = await withTenant(tenantId, async (c) => (await c.query(`SELECT id FROM pages WHERE journey_id=$1 AND COALESCE(published,FALSE)=TRUE ORDER BY created_at DESC LIMIT 1`, [funnelId])).rows[0]);
  if (!page) return { ok: false, marked: false, seenIn: [], note: 'no published page to receive a signal — publish first' };

  const marked = opts.scriptGenerated !== false; // default: a script-driven first-signal is marked test
  const { ingestPageEvent } = await import('../../capture/src/service.js');
  await ingestPageEvent(tenantId, { pageId: page.id, type: 'view', visitor: marked ? FIRST_SIGNAL_MARK : 'visitor', eventKey: marked ? `${FIRST_SIGNAL_MARK}:${Date.now()}` : undefined });

  const seenIn: string[] = [];
  const inPageEvents = await withTenant(tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1`, [funnelId])).rows[0].n);
  if (inPageEvents > 0) seenIn.push('page_events');
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const act = await getActivationStatus(tenantId, funnelId).catch(() => null);
  if (act?.steps.find((s: any) => s.id === 'first_page_view_seen')?.status === 'done') seenIn.push('activation');
  const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');
  const desk = await getRevenueDesk(tenantId, funnelId).catch(() => null) as any;
  if (desk) seenIn.push(desk.activationMode ? 'revenue_desk(activation_mode)' : 'revenue_desk(live)');
  const { dailyCheck } = await import('../../operating-room/src/service.js');
  const dc = await dailyCheck(tenantId, funnelId).catch(() => null);
  if (dc) seenIn.push(`operating_room(${dc.status})`);

  return { ok: seenIn.includes('page_events'), marked, seenIn, note: marked ? 'signal marked as smoke/test (removable)' : 'real customer signal (not marked)' };
}

/** Customer-facing launch summary — safe, no secrets, no stack traces, no fake results. */
export async function launchSummary(tenantId: string, funnelId: string, manifest: Partial<ExecutionManifest>): Promise<{
  configured: string[]; live: string[]; weNeedFromYou: string[]; weAreMonitoring: string[]; firstNextAction: string; supportContact: string | null; whatFnnlrWontDo: string[];
}> {
  const { customerStatus } = await import('../../operating-room/src/service.js');
  const status = await customerStatus(tenantId, funnelId);

  return {
    configured: status.configured,
    live: status.signalsArrived,
    weNeedFromYou: status.needsCustomerInput,
    weAreMonitoring: status.watching,
    firstNextAction: status.nextAction,
    supportContact: manifest.supportOwner ?? null,
    whatFnnlrWontDo: [
      'مش هنبعت رسائل واتساب أوتوماتيك — إحنا بنجهّز، وإنت اللي بتبعت.',
      'مش بنعالج مدفوعات — بنسجّل حالة الدفع يدويًا، مش بناخد فلوس.',
    ],
  };
}
