import { withTenant, getControlPool } from '../../../packages/db/src/router.js';
import { computeChecklist, type ChecklistState } from './checklist.js';
import { DEMO_EMAIL } from './seed.js';

/** Compute the pilot checklist for a funnel from observed DB state. */
export async function getChecklist(tenantId: string, journeyId: string) {
  const state = await withTenant(tenantId, async (c): Promise<ChecklistState> => {
    const one = async (sql: string, params: unknown[] = [journeyId]) => ((await c.query(sql, params)).rowCount ?? 0) > 0;
    const journey = await one(`SELECT 1 FROM journeys WHERE id=$1`);
    const offer = await one(`SELECT 1 FROM offers WHERE journey_id=$1`);
    const stages = await one(`SELECT 1 FROM funnel_stages WHERE journey_id=$1`);
    const page = await c.query(`SELECT published FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
    const links = await one(`SELECT 1 FROM tracked_links WHERE journey_id=$1`);
    const pm = await one(`SELECT 1 FROM payment_methods WHERE journey_id=$1`);
    const wa = await one(`SELECT 1 FROM whatsapp_flows WHERE journey_id=$1`);
    const leads = await one(`SELECT 1 FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL`);
    const payStates = await one(`SELECT 1 FROM payment_states p JOIN leads l ON l.id=p.lead_id WHERE l.funnel_id=$1`);
    const leaks = await one(`SELECT 1 FROM leak_findings WHERE journey_id=$1`);
    const actions = await one(`SELECT 1 FROM action_items WHERE journey_id=$1`);
    const report = await one(`SELECT 1 FROM reports WHERE journey_id=$1`);
    return {
      funnelCreated: journey, offerCompleted: offer, funnelMapReady: stages,
      pageGenerated: (page.rowCount ?? 0) > 0, pagePublished: page.rows[0]?.published ?? false,
      trackedLinkCreated: links, paymentMethodsAdded: pm, whatsappFlowGenerated: wa,
      leadsReceiving: leads, paymentStatesActive: payStates, leakDiagnosisRun: leaks,
      actionCenterPopulated: actions, weeklyReportGenerated: report, commandBarReady: true,
    };
  });
  return computeChecklist(state);
}

/** Is this tenant the demo workspace? (used to show the demo banner) */
export async function isDemoTenant(tenantId: string): Promise<boolean> {
  const control = getControlPool();
  const r = await control.query(
    `SELECT 1 FROM users u JOIN workspace_members m ON m.user_id=u.id
       JOIN workspaces w ON w.id=m.workspace_id
      WHERE u.email=$1 AND w.tenant_id=$2 LIMIT 1`, [DEMO_EMAIL, tenantId]);
  return (r.rowCount ?? 0) > 0;
}
