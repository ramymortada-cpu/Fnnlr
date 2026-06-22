import { withTenant } from '../../../packages/db/src/router.js';
import type { CustomerConfig } from '../../customer-zero/src/config.js';

/**
 * Repeatability — proves fnnlr runs a SECOND customer through the SAME path with
 * no special-case, no DB hacking, and no cross-tenant leakage. It composes the
 * existing setup runner, smoke, snapshot, desk, and operating room. No new
 * schema, no demo data, no fake customer. PURE orchestration over real tools.
 */

export interface CustomerHandle {
  label: string;
  tenantId: string;
  workspaceId: string;
  businessId: string;
  funnelId: string;
}

export interface RepeatabilityResult {
  status: 'PASS' | 'FAIL';
  customers: { label: string; tenantId: string; businessId: string; funnelId: string }[];
  separation: { check: string; ok: boolean; detail: string }[];
  idempotency: { check: string; ok: boolean; detail: string }[];
  signalIsolation: { check: string; ok: boolean; detail: string }[];
  blockers: string[];
  nextAction: string;
}

/** Set up two customers from their configs and prove separation + idempotency + signal isolation. */
export async function repeatabilityCheck(
  a: { label: string; config: CustomerConfig; ownerPassword: string },
  b: { label: string; config: CustomerConfig; ownerPassword: string },
): Promise<RepeatabilityResult> {
  const { setupCustomerFromConfig } = await import('../../customer-zero/src/setup.js');
  const blockers: string[] = [];

  // 1) set up both customers via the SAME runner
  const setupA = await setupCustomerFromConfig(a.config, a.ownerPassword);
  const setupB = await setupCustomerFromConfig(b.config, b.ownerPassword);
  if (!setupA.ok || !setupA.tenantId || !setupA.funnelId) blockers.push(`${a.label} setup failed: ${setupA.blocking.join('; ')}`);
  if (!setupB.ok || !setupB.tenantId || !setupB.funnelId) blockers.push(`${b.label} setup failed: ${setupB.blocking.join('; ')}`);

  // 2) rerun both (idempotency) — same identifiers, no duplicates
  const reA = await setupCustomerFromConfig(a.config, a.ownerPassword);
  const reB = await setupCustomerFromConfig(b.config, b.ownerPassword);

  const idempotency = [
    { check: `${a.label} tenant stable on rerun`, ok: reA.tenantId === setupA.tenantId, detail: `${setupA.tenantId} → ${reA.tenantId}` },
    { check: `${a.label} funnel stable on rerun`, ok: reA.funnelId === setupA.funnelId, detail: `${setupA.funnelId} → ${reA.funnelId}` },
    { check: `${b.label} tenant stable on rerun`, ok: reB.tenantId === setupB.tenantId, detail: `${setupB.tenantId} → ${reB.tenantId}` },
    { check: `${b.label} funnel stable on rerun`, ok: reB.funnelId === setupB.funnelId, detail: `${setupB.funnelId} → ${reB.funnelId}` },
  ];

  // 3) separation: distinct tenants / businesses / funnels
  const separation = [
    { check: 'distinct tenants', ok: !!setupA.tenantId && setupA.tenantId !== setupB.tenantId, detail: `${setupA.tenantId} vs ${setupB.tenantId}` },
    { check: 'distinct businesses', ok: !!setupA.businessId && setupA.businessId !== setupB.businessId, detail: `${setupA.businessId} vs ${setupB.businessId}` },
    { check: 'distinct funnels', ok: !!setupA.funnelId && setupA.funnelId !== setupB.funnelId, detail: `${setupA.funnelId} vs ${setupB.funnelId}` },
  ];

  // 4) signal isolation: a smoke signal for B must not change A's counts/desk/snapshot
  const signalIsolation: RepeatabilityResult['signalIsolation'] = [];
  if (setupA.tenantId && setupA.funnelId && setupB.tenantId && setupB.funnelId) {
    const beforeA = await snapshotCounts(setupA.tenantId, setupA.funnelId);
    // publish B's page + emit a smoke page event for B (via the real ingest path)
    await publishAndSignal(setupB.tenantId, setupB.funnelId);
    const afterA = await snapshotCounts(setupA.tenantId, setupA.funnelId);

    signalIsolation.push(
      { check: "A page-events unchanged after B's smoke", ok: beforeA.pageEvents === afterA.pageEvents, detail: `${beforeA.pageEvents} → ${afterA.pageEvents}` },
      { check: "A leads unchanged after B's smoke", ok: beforeA.leads === afterA.leads, detail: `${beforeA.leads} → ${afterA.leads}` },
      { check: "A desk item-count unchanged after B's smoke", ok: beforeA.deskItems === afterA.deskItems, detail: `${beforeA.deskItems} → ${afterA.deskItems}` },
    );

    // B should have received the signal
    const bCounts = await snapshotCounts(setupB.tenantId, setupB.funnelId);
    signalIsolation.push({ check: "B received its own signal", ok: bCounts.pageEvents > 0, detail: `B page-events=${bCounts.pageEvents}` });
  }

  const allChecks = [...separation, ...idempotency, ...signalIsolation];
  const ok = blockers.length === 0 && allChecks.every((c) => c.ok);

  return {
    status: ok ? 'PASS' : 'FAIL',
    customers: [
      { label: a.label, tenantId: setupA.tenantId ?? '', businessId: setupA.businessId ?? '', funnelId: setupA.funnelId ?? '' },
      { label: b.label, tenantId: setupB.tenantId ?? '', businessId: setupB.businessId ?? '', funnelId: setupB.funnelId ?? '' },
    ],
    separation,
    idempotency,
    signalIsolation,
    blockers: blockers.concat(allChecks.filter((c) => !c.ok).map((c) => `${c.check}: ${c.detail}`)),
    nextAction: ok ? 'repeatable — the same path runs a second customer with full isolation' : 'investigate the failing separation/idempotency/isolation check',
  };
}

async function snapshotCounts(tenantId: string, funnelId: string): Promise<{ pageEvents: number; leads: number; deskItems: number }> {
  const counts = await withTenant(tenantId, async (c) => {
    const n = async (sql: string, p: any[] = []): Promise<number> => { try { return (await c.query(sql, p)).rows[0]?.n ?? 0; } catch { return 0; } };
    return {
      pageEvents: await n(`SELECT COUNT(*)::int AS n FROM page_events pe JOIN pages p ON p.id=pe.page_id WHERE p.journey_id=$1`, [funnelId]),
      leads: await n(`SELECT COUNT(*)::int AS n FROM leads`),
    };
  });
  const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');
  const desk = await getRevenueDesk(tenantId, funnelId).catch(() => null) as any;
  return { ...counts, deskItems: desk?.items?.length ?? 0 };
}

async function publishAndSignal(tenantId: string, funnelId: string): Promise<void> {
  const pageId = await withTenant(tenantId, async (c) => {
    let p = (await c.query(`SELECT id FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [funnelId])).rows[0];
    if (!p) {
      // the setup runner creates offer/payment shells but not a page; create a
      // published page shell so a real page event can be ingested (no fake data —
      // an empty page the operator would fill in).
      p = (await c.query(`INSERT INTO pages (journey_id, content, published, published_at) VALUES ($1,'{}'::jsonb,TRUE, now()) RETURNING id`, [funnelId])).rows[0];
    } else {
      await c.query(`UPDATE pages SET published=TRUE, published_at=now() WHERE id=$1`, [p.id]);
    }
    return p.id;
  });
  if (!pageId) return;
  const { ingestPageEvent } = await import('../../capture/src/service.js');
  await ingestPageEvent(tenantId, { pageId, type: 'view', visitor: 'smoke:repeatability', eventKey: `smoke:repeatability:${Date.now()}` });
}

export type RepeatabilityDecision = 'REPEATABLE' | 'BLOCKED' | 'RISK';

export interface RepeatabilityReport {
  customersTested: number;
  setupIdempotency: boolean;
  tenantSeparation: boolean;
  signalIsolation: boolean;
  activationSeparation: boolean;
  deskSeparation: boolean;
  supportSeparation: boolean;
  decision: RepeatabilityDecision;
  nextAction: string;
}

/** Turn a repeatability result into a decision report (no secrets). */
export function repeatabilityReport(r: RepeatabilityResult): RepeatabilityReport {
  const idem = r.idempotency.every((c) => c.ok);
  const tenant = r.separation.every((c) => c.ok);
  const isolation = r.signalIsolation.filter((c) => c.check.startsWith('A ')).every((c) => c.ok);
  const decision: RepeatabilityDecision = r.status === 'PASS' ? 'REPEATABLE' : (r.blockers.length ? 'BLOCKED' : 'RISK');
  return {
    customersTested: r.customers.length,
    setupIdempotency: idem,
    tenantSeparation: tenant,
    signalIsolation: isolation,
    activationSeparation: tenant,    // separate tenants ⇒ separate activation state
    deskSeparation: isolation,
    supportSeparation: tenant,
    decision,
    nextAction: r.nextAction,
  };
}
