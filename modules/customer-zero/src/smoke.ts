import { withTenant } from '../../../packages/db/src/router.js';

/**
 * Customer smoke runner. Verifies a customer can receive a real signal end to
 * end. Any record it creates is MARKED as a smoke/test artifact (a 'smoke:'
 * visitor / source) so it is identifiable and removable, and it NEVER fabricates
 * revenue, payments, or opportunities. Page events / leads created here exist
 * only to prove the pipe works.
 */

const SMOKE_MARK = 'smoke:customer-zero';

export interface SmokeResult {
  ok: boolean;
  steps: { name: string; status: 'ok' | 'skip' | 'fail'; detail: string }[];
}

export async function smokeCustomer(tenantId: string, funnelId: string): Promise<SmokeResult> {
  const steps: SmokeResult['steps'] = [];
  const add = (name: string, status: 'ok' | 'skip' | 'fail', detail: string) => steps.push({ name, status, detail });

  // 1) tenant health
  try {
    const counts = await withTenant(tenantId, async (c) => ({
      businesses: (await c.query(`SELECT COUNT(*)::int AS n FROM businesses WHERE deleted_at IS NULL`)).rows[0].n,
      funnels: (await c.query(`SELECT COUNT(*)::int AS n FROM journeys WHERE deleted_at IS NULL`)).rows[0].n,
    }));
    add('tenant_health', 'ok', `businesses=${counts.businesses} funnels=${counts.funnels}`);
  } catch (e: any) { add('tenant_health', 'fail', String(e?.message ?? e).slice(0, 80)); return { ok: false, steps }; }

  // 2) page publish status
  const page = await withTenant(tenantId, async (c) => (await c.query(`SELECT id, COALESCE(published,FALSE) AS published FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [funnelId])).rows[0]);
  if (!page) { add('page', 'skip', 'no page yet — publish a page to receive traffic'); }
  else add('page', page.published ? 'ok' : 'skip', page.published ? 'page published' : 'page exists but not published');

  // 3) tracked link present
  const link = await withTenant(tenantId, async (c) => (await c.query(`SELECT code FROM tracked_links WHERE journey_id=$1 LIMIT 1`, [funnelId])).rows[0]);
  add('tracked_link', link ? 'ok' : 'skip', link ? `code=${link.code}` : 'no tracked link yet');

  // 4) ingest a SMOKE page view (only if a page exists) — clearly marked
  if (page) {
    const { ingestPageEvent } = await import('../../capture/src/service.js');
    await ingestPageEvent(tenantId, { pageId: page.id, type: 'view', visitor: SMOKE_MARK, eventKey: `${SMOKE_MARK}:view` });
    const seen = await withTenant(tenantId, async (c) => (await c.query(`SELECT COUNT(*)::int AS n FROM page_events WHERE visitor=$1`, [SMOKE_MARK])).rows[0].n);
    add('smoke_page_view', seen > 0 ? 'ok' : 'fail', `smoke view ingested (visitor=${SMOKE_MARK})`);
  } else add('smoke_page_view', 'skip', 'no page to ingest against');

  // 5) activation status
  const { getActivationStatus } = await import('../../activation/src/service.js');
  const act = await getActivationStatus(tenantId, funnelId).catch(() => null);
  add('activation', act ? 'ok' : 'fail', act ? `stage=${act.stage} score=${act.readinessScore}%` : 'activation unavailable');

  // 6) revenue desk status (activation mode before real signals — never fake opportunities)
  const { getRevenueDesk } = await import('../../revenue-desk/src/service.js');
  const desk = await getRevenueDesk(tenantId, funnelId).catch(() => null) as any;
  add('revenue_desk', desk ? 'ok' : 'fail', desk ? (desk.activationMode ? 'activation mode (no fabricated opportunities)' : `live: ${desk.items.length} items`) : 'desk unavailable');

  const ok = !steps.some((s) => s.status === 'fail');
  return { ok, steps };
}

/** Remove smoke artifacts (safe cleanup of test-marked rows). */
export async function cleanupSmoke(tenantId: string): Promise<{ removed: number }> {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`DELETE FROM page_events WHERE visitor=$1`, [SMOKE_MARK]);
    return { removed: r.rowCount ?? 0 };
  });
}
