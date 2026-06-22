import { withTenant } from '../../../packages/db/src/router.js';
import type { ExecutionManifest } from './manifest.js';
import { logExecution } from './log.js';
import { logIssue } from './issues.js';

/**
 * Live execution — turning READY into LIVE for Customer Zero, and documenting the
 * first 72 hours. Composes the existing execution lock / activation / operating
 * room / support surfaces. No new feature, no parallel truth, no fake traffic /
 * leads / revenue. Known revenue is reported only when a real payment amount
 * exists.
 */

export interface GoLiveResult {
  status: 'LAUNCHED' | 'BLOCKED';
  lockStatus: string;
  steps: { name: string; status: 'ok' | 'skip' | 'fail'; detail: string }[];
  firstSignal: { ok: boolean; marked: boolean; seenIn: string[] } | null;
  blockers: string[];
}

/**
 * customer:go-live. Refuses to launch on a BLOCKED execution lock. Publishes the
 * page if needed, verifies link + payment, runs the first-signal protocol, and
 * records launch_started / first_signal_received / launch_completed | launch_blocked
 * in the execution log. A script-generated first signal is marked test.
 */
export async function goLive(tenantId: string, funnelId: string, manifest: Partial<ExecutionManifest>, opts: { production?: boolean; actor?: string; realEvent?: boolean } = {}): Promise<GoLiveResult> {
  const actor = opts.actor ?? 'go-live';
  const steps: GoLiveResult['steps'] = [];
  const add = (name: string, status: 'ok' | 'skip' | 'fail', detail: string) => steps.push({ name, status, detail });

  await logExecution(tenantId, actor, 'launch_started', { funnelId, launchWindow: manifest.launchWindow ?? null }).catch(() => {});

  // 1) confirm launch window is present (we don't gate on clock — operator-driven — but it must be declared)
  add('launch_window', manifest.launchWindow ? 'ok' : 'fail', manifest.launchWindow ? `window: ${manifest.launchWindow}` : 'no launch window declared');

  // 2) execution lock — the gate. BLOCKED → refuse.
  const { executionLock } = await import('./service.js');
  const lock = await executionLock(tenantId, funnelId, manifest, { production: opts.production });
  add('execution_lock', lock.status === 'BLOCKED' ? 'fail' : 'ok', `execution lock: ${lock.status}`);
  if (lock.status === 'BLOCKED' || !manifest.launchWindow) {
    const blockers = [...lock.blocking, ...(manifest.launchWindow ? [] : ['no launch window declared'])];
    await logIssue(tenantId, actor, { severity: 'P1', source: 'go-live', evidence: blockers.join('; ').slice(0, 300), owner: 'platform', nextAction: lock.nextAction }).catch(() => {});
    await logExecution(tenantId, actor, 'launch_blocked', { reason: blockers.slice(0, 3) }).catch(() => {});
    return { status: 'BLOCKED', lockStatus: lock.status, steps, firstSignal: null, blockers };
  }

  // 3) publish page if not published
  const pub = await withTenant(tenantId, async (c) => {
    const p = (await c.query(`SELECT id, COALESCE(published,FALSE) AS published FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [funnelId])).rows[0];
    if (!p) return { published: false, existed: false };
    if (!p.published) { await c.query(`UPDATE pages SET published=TRUE, published_at=now() WHERE id=$1`, [p.id]); return { published: true, existed: true, justPublished: true }; }
    return { published: true, existed: true, justPublished: false };
  });
  add('page_published', pub.published ? 'ok' : 'fail', pub.published ? (pub.justPublished ? 'page published now' : 'page already published') : 'no page to publish');

  // 4-5) verify tracked link + payment
  const presence = await withTenant(tenantId, async (c) => ({
    link: (await c.query(`SELECT COUNT(*)::int AS n FROM tracked_links WHERE journey_id=$1`, [funnelId])).rows[0].n,
    payment: (await c.query(`SELECT COUNT(*)::int AS n FROM payment_methods WHERE journey_id=$1`, [funnelId])).rows[0].n,
  }));
  add('tracked_link', presence.link > 0 ? 'ok' : 'fail', presence.link > 0 ? 'tracked link present' : 'no tracked link');
  add('payment', presence.payment > 0 ? 'ok' : 'fail', presence.payment > 0 ? 'payment instructions present' : 'no payment method');

  // 6) first-signal protocol (marked test unless a real event is explicitly indicated)
  const { firstSignal } = await import('./service.js');
  const sig = await firstSignal(tenantId, funnelId, { scriptGenerated: !opts.realEvent });
  add('first_signal', sig.ok ? 'ok' : 'skip', sig.note);
  if (sig.ok) await logExecution(tenantId, actor, 'first_signal_received', { marked: sig.marked, seenIn: sig.seenIn }).catch(() => {});

  const failed = steps.filter((s) => s.status === 'fail');
  if (failed.length) {
    await logExecution(tenantId, actor, 'launch_blocked', { reason: failed.map((f) => f.name) }).catch(() => {});
    return { status: 'BLOCKED', lockStatus: lock.status, steps, firstSignal: { ok: sig.ok, marked: sig.marked, seenIn: sig.seenIn }, blockers: failed.map((f) => f.detail) };
  }

  await logExecution(tenantId, actor, 'launch_completed', { lockStatus: lock.status, firstSignalSeenIn: sig.seenIn }).catch(() => {});
  return { status: 'LAUNCHED', lockStatus: lock.status, steps, firstSignal: { ok: sig.ok, marked: sig.marked, seenIn: sig.seenIn }, blockers: [] };
}

export interface Monitor72h {
  launchStatus: 'launched' | 'blocked' | 'unknown';
  launchedAt: string | null;
  activationStage: string | null;
  readinessScore: number | null;
  firstSignalAt: string | null;
  signals: { pageViews: number; whatsappClicks: number; leads: number; paymentStates: number };
  revenueDeskTop: string | null;
  recommendations: number;
  incidents: { P0: number; P1: number; P2: number; P3: number };
  openBlockers: string[];
  knownRevenue: number | null;   // only when a real payment amount exists
  decision: string;
}

/** customer:72h-monitor — the first-72h snapshot. Known revenue only if amount exists. */
export async function monitor72h(tenantId: string, funnelId: string): Promise<Monitor72h> {
  const { dailyCheck } = await import('../../operating-room/src/service.js');
  const dc = await dailyCheck(tenantId, funnelId);
  const { activationSummary } = await import('../../activation/src/service.js');
  const act = await activationSummary(tenantId, funnelId).catch(() => null);

  const extra = await withTenant(tenantId, async (c) => {
    const scalar = async (sql: string, p: any[] = []): Promise<any> => { try { return (await c.query(sql, p)).rows[0] ?? null; } catch { return null; } };
    const launchRow = await scalar(`SELECT created_at FROM audit_events WHERE action='launch_completed' ORDER BY created_at DESC LIMIT 1`);
    const blockedRow = await scalar(`SELECT created_at FROM audit_events WHERE action='launch_blocked' ORDER BY created_at DESC LIMIT 1`);
    const firstSignal = await scalar(`SELECT MIN(occurred_at) AS t FROM page_events`);
    const amt = await scalar(`SELECT SUM(amount)::numeric AS s FROM payment_states WHERE amount IS NOT NULL`);
    return {
      launchedAt: launchRow?.created_at ?? null,
      blockedAt: blockedRow?.created_at ?? null,
      firstSignalAt: firstSignal?.t ?? null,
      knownRevenue: amt?.s != null ? Number(amt.s) : null,
    };
  });

  const counts = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const i of dc.incidents) counts[i.severity]++;

  const launchStatus: Monitor72h['launchStatus'] = extra.launchedAt ? 'launched' : extra.blockedAt ? 'blocked' : 'unknown';

  return {
    launchStatus,
    launchedAt: extra.launchedAt ? new Date(extra.launchedAt).toISOString() : null,
    activationStage: act?.stage ?? null,
    readinessScore: act?.readinessScore ?? null,
    firstSignalAt: extra.firstSignalAt ? new Date(extra.firstSignalAt).toISOString() : null,
    signals: dc.signals24h,
    revenueDeskTop: dc.revenueDeskTop,
    recommendations: dc.recommendations,
    incidents: counts,
    openBlockers: dc.decision.blockers,
    knownRevenue: extra.knownRevenue,   // null unless a real amount exists — never fabricated
    decision: dc.decision.decision,
  };
}

export interface EventLedger {
  firstEvent: { type: string; at: string } | null;
  latestEvent: { type: string; at: string } | null;
  counts: { pageEvents: number; trackedLinkClicks: number; leads: number; conversations: number; paymentStates: number; scheduledRuns: number; integrationEvents: number };
  conversionPathSeen: string[];
  missingSignals: string[];
  suspiciousGaps: string[];
}

/** Live event ledger — assembled from existing evidence; no parallel truth. */
export async function eventLedger(tenantId: string, funnelId: string): Promise<EventLedger> {
  return withTenant(tenantId, async (c) => {
    const n = async (sql: string, p: any[] = []): Promise<number> => { try { return (await c.query(sql, p)).rows[0]?.n ?? 0; } catch { return 0; } };
    const scalar = async (sql: string, p: any[] = []): Promise<any> => { try { return (await c.query(sql, p)).rows[0] ?? null; } catch { return null; } };

    const pageEvents = await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1`, [funnelId]);
    const clicks = await n(`SELECT COALESCE(SUM(clicks),0)::int AS n FROM tracked_links WHERE journey_id=$1`, [funnelId]);
    const leads = await n(`SELECT COUNT(*)::int AS n FROM leads`);
    const conversations = await n(`SELECT COUNT(*)::int AS n FROM conversations`);
    const paymentStates = await n(`SELECT COUNT(*)::int AS n FROM payment_states`);
    const scheduledRuns = await n(`SELECT COUNT(*)::int AS n FROM scheduled_runs`);
    const integrationEvents = await n(`SELECT COUNT(*)::int AS n FROM integration_events`);

    const firstPe = await scalar(`SELECT type, occurred_at FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 ORDER BY occurred_at ASC LIMIT 1`, [funnelId]);
    const lastPe = await scalar(`SELECT type, occurred_at FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1 ORDER BY occurred_at DESC LIMIT 1`, [funnelId]);

    // conversion path seen so far (only stages with real evidence)
    const path: string[] = [];
    if (pageEvents > 0) path.push('page_view');
    if (clicks > 0) path.push('whatsapp_click');
    if (leads > 0) path.push('lead');
    if (conversations > 0) path.push('conversation');
    if (paymentStates > 0) path.push('payment_state');

    const missing: string[] = [];
    if (pageEvents === 0) missing.push('page_view');
    if (clicks === 0) missing.push('whatsapp_click');
    if (leads === 0) missing.push('lead');
    if (paymentStates === 0) missing.push('payment_state');

    // suspicious gaps: a later stage exists without an earlier one
    const gaps: string[] = [];
    if (leads > 0 && pageEvents === 0) gaps.push('leads exist but no page events recorded');
    if (paymentStates > 0 && leads === 0) gaps.push('payment states exist but no leads recorded');
    if (clicks > 0 && leads === 0) gaps.push('clicks recorded but no lead created');

    return {
      firstEvent: firstPe ? { type: firstPe.type, at: new Date(firstPe.occurred_at).toISOString() } : null,
      latestEvent: lastPe ? { type: lastPe.type, at: new Date(lastPe.occurred_at).toISOString() } : null,
      counts: { pageEvents, trackedLinkClicks: clicks, leads, conversations, paymentStates, scheduledRuns, integrationEvents },
      conversionPathSeen: path,
      missingSignals: missing,
      suspiciousGaps: gaps,
    };
  });
}

/** customer:72h-update — customer-facing. Safe: no secrets, no stack traces, no fake results. */
export async function update72h(tenantId: string, funnelId: string, manifest: Partial<ExecutionManifest>): Promise<{
  launched: string[]; firstSignals: string[]; weAreMonitoring: string[]; weNeedFromYou: string[]; topActionNow: string; clearBlocker: string | null; supportContact: string | null; whatFnnlrWontDo: string[];
}> {
  const mon = await monitor72h(tenantId, funnelId);
  const { customerStatus } = await import('../../operating-room/src/service.js');
  const status = await customerStatus(tenantId, funnelId);

  const launched: string[] = [];
  if (mon.launchStatus === 'launched') launched.push('تم تشغيل الصفحة والرابط.');
  else if (mon.launchStatus === 'blocked') launched.push('الإطلاق متوقف على خطوة ناقصة (شوف اللي محتاجينه منك).');
  else launched.push('لسه ماتمّش تسجيل إطلاق مكتمل.');

  const firstSignals = status.signalsArrived;

  const clearBlocker = mon.decision === 'ROLLBACK_OR_DISABLE'
    ? 'فيه مشكلة تشغيلية بنعالجها — هنرجعلك.'
    : (mon.openBlockers[0] ?? null);

  return {
    launched,
    firstSignals,
    weAreMonitoring: status.watching,
    weNeedFromYou: status.needsCustomerInput,
    topActionNow: status.nextAction,
    clearBlocker,
    supportContact: manifest.supportOwner ?? null,
    whatFnnlrWontDo: [
      'مش هنبعت رسائل واتساب أوتوماتيك — إنت اللي بتبعت.',
      'مش بنعالج مدفوعات — بنسجّل حالة الدفع يدويًا.',
    ],
  };
}
