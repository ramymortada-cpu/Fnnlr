import { withTenant } from '../../../packages/db/src/router.js';
import { detectLeaks, biggestLeak, laneSummary, hasEnoughData, type FunnelSnapshot, type LeakFinding } from './engine.js';

/**
 * Leaks service — assembles a snapshot from OBSERVED data in the tenant DB,
 * runs the pure detection engine, and persists findings. No onboarding guesses;
 * if there isn't enough observed data, run() reports that honestly.
 */

const STUCK_HOURS = 24; // a lead "stuck" if it hasn't moved in this many hours

async function buildSnapshot(c: any, journeyId: string): Promise<FunnelSnapshot> {
  const links = await c.query(
    `SELECT COUNT(*)::int AS n,
            COALESCE(SUM(clicks),0)::int AS clicks,
            COUNT(*) FILTER (WHERE source IS NULL OR source='')::int AS no_utm,
            BOOL_OR(active=FALSE) AS any_inactive
       FROM tracked_links WHERE journey_id=$1`, [journeyId]);
  const lk = links.rows[0];

  const page = await c.query(`SELECT id, published, whatsapp_destination FROM pages WHERE journey_id=$1 ORDER BY created_at DESC LIMIT 1`, [journeyId]);
  const pageRow = page.rows[0];
  let pageViews = 0, ctaClicks = 0, priceReached = 0, scroll50 = 0, whatsappClicks = 0;
  if (pageRow) {
    const pe = await c.query(
      `SELECT type, COUNT(*)::int AS n FROM page_events
        WHERE page_id=$1 GROUP BY type`, [pageRow.id]);
    for (const row of pe.rows) {
      if (row.type === 'page_view') pageViews = row.n;
      else if (row.type === 'cta_clicked') ctaClicks = row.n;
      else if (row.type === 'price_reached') priceReached = row.n;
      else if (row.type === 'whatsapp_clicked') whatsappClicks = row.n;
      else if (row.type === 'scroll_depth') scroll50 = row.n;
    }
  }
  // is the published page connected to an active tracked link?
  const pageUsesTrackedLink = pageRow?.published
    ? (await c.query(`SELECT 1 FROM tracked_links WHERE journey_id=$1 AND active=TRUE LIMIT 1`, [journeyId])).rowCount > 0
    : false;

  // leads / stages
  const leads = await c.query(`SELECT stage, payment_status, risk_score, intent, next_action, attribution,
      followup_due_at, lost_reason, stage_changed_at, created_at FROM leads WHERE funnel_id=$1 AND deleted_at IS NULL`, [journeyId]);
  const rows = leads.rows as any[];
  const byStage: Record<string, number> = {};
  let stuckClicked = 0, waitingStuck = 0, waitingTotal = 0, paymentStuck = 0,
      noAttribution = 0, noNextAction = 0, needFollowupNoDate = 0, lostNoReason = 0, highRiskNoAction = 0;
  const now = Date.now();
  for (const r of rows) {
    byStage[r.stage] = (byStage[r.stage] || 0) + 1;
    const movedAgoH = r.stage_changed_at ? (now - new Date(r.stage_changed_at).getTime()) / 3.6e6 : (now - new Date(r.created_at).getTime()) / 3.6e6;
    if (r.stage === 'whatsapp_clicked' && movedAgoH >= STUCK_HOURS) stuckClicked++;
    if (r.stage === 'waiting_payment') { waitingTotal++; if (movedAgoH >= STUCK_HOURS) waitingStuck++; }
    if (r.payment_status === 'stuck') paymentStuck++;
    const attr = r.attribution || {};
    if (!attr.source && !r.attribution) noAttribution++;
    else if (attr && Object.keys(attr).length === 0) noAttribution++;
    if (!r.next_action) noNextAction++;
    if ((r.stage === 'needs_followup') && !r.followup_due_at) needFollowupNoDate++;
    if (r.stage === 'lost' && !r.lost_reason) lostNoReason++;
    if (((r.risk_score ?? 0) >= 0.7 || r.intent === 'high') && !r.next_action) highRiskNoAction++;
  }

  const proofUnconfirmed = await c.query(
    `SELECT COUNT(*)::int AS n FROM payment_states WHERE state='proof_uploaded'
       AND lead_id IN (SELECT id FROM leads WHERE funnel_id=$1)`, [journeyId]);
  const paidNotDelivered = (byStage['paid'] || 0);

  // payment flow config (Sprint 9)
  const pm = await c.query(
    `SELECT COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE customer_instructions IS NULL OR customer_instructions='')::int AS no_instr,
            COUNT(*) FILTER (WHERE proof_required=TRUE AND (customer_instructions IS NULL OR customer_instructions=''))::int AS proof_no_step,
            BOOL_OR(active=FALSE) AS any_inactive
       FROM payment_methods WHERE journey_id=$1`, [journeyId]);
  const proofNotReviewed = await c.query(
    `SELECT COUNT(*)::int AS n FROM payment_states
      WHERE proof_received=TRUE AND reviewed_at IS NULL
        AND lead_id IN (SELECT id FROM leads WHERE funnel_id=$1)`, [journeyId]);
  const confirmedNotDelivered = await c.query(
    `SELECT COUNT(*)::int AS n FROM payment_states
      WHERE state='confirmed' AND access_delivered=FALSE
        AND lead_id IN (SELECT id FROM leads WHERE funnel_id=$1)`, [journeyId]);
  const detailsNoWaiting = byStage['payment_details_sent'] || 0;
  const waitingNoTask = await c.query(
    `SELECT COUNT(*)::int AS n FROM leads le
      WHERE le.funnel_id=$1 AND le.stage='waiting_payment'
        AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id=le.id AND t.done=FALSE)`, [journeyId]);

  // conversations opened but lead never advanced past whatsapp_clicked
  const convNoContact = await c.query(
    `SELECT COUNT(*)::int AS n FROM conversations co
       JOIN leads le ON le.id = co.lead_id
      WHERE le.funnel_id=$1 AND le.stage='whatsapp_clicked'`, [journeyId]);

  // whatsapp flow (Sprint 10)
  const wa = await c.query(
    `SELECT f.id,
            BOOL_OR(t.step_type='first_reply') AS has_first,
            BOOL_OR(t.step_type IN ('no_response','recovery')) AS has_followup
       FROM whatsapp_flows f LEFT JOIN whatsapp_message_templates t ON t.flow_id=f.id
      WHERE f.journey_id=$1 GROUP BY f.id`, [journeyId]);
  const hasWhatsappFlow = wa.rowCount > 0;
  const clickedNoReply = await c.query(
    `SELECT COUNT(*)::int AS n FROM leads le
      WHERE le.funnel_id=$1 AND le.stage='whatsapp_clicked'
        AND NOT EXISTS (SELECT 1 FROM whatsapp_draft_replies d WHERE d.lead_id=le.id AND d.marked_sent=TRUE)`, [journeyId]);

  const overdue = await c.query(
    `SELECT COUNT(*)::int AS n FROM tasks WHERE funnel_id=$1 AND done=FALSE AND due_at IS NOT NULL AND due_at < now()`, [journeyId]);

  // avg deal value (only if any paid amount observed; else null → no fabricated money)
  const avg = await c.query(
    `SELECT AVG(amount)::numeric AS a FROM payment_states
       WHERE state IN ('confirmed','access_delivered') AND amount IS NOT NULL
         AND lead_id IN (SELECT id FROM leads WHERE funnel_id=$1)`, [journeyId]);
  const avgDealValue = avg.rows[0].a ? Number(avg.rows[0].a) : null;

  const totalClicks = lk.clicks;
  const leadsCount = rows.length;

  return {
    hasTrackedLinks: lk.n > 0, linksCount: lk.n, linksWithoutUtm: lk.no_utm, inactiveLinkInUse: !!lk.any_inactive,
    totalClicks, leadsCount, leadsWithoutAttribution: noAttribution,
    pagePublished: !!pageRow?.published, pageViews, scrollReached50: scroll50, priceReached, ctaClicks,
    whatsappClicks, pageUsesTrackedLink,
    leadsByStage: byStage, leadsStuckWhatsappClicked: stuckClicked,
    conversationsWithoutContact: convNoContact.rows[0].n, leadsWithoutNextAction: noNextAction,
    hasWhatsappFlow,
    hasFirstReplyTemplate: !!wa.rows[0]?.has_first,
    hasFollowupTemplate: !!wa.rows[0]?.has_followup,
    clickedNoReplySent: clickedNoReply.rows[0].n,
    waitingPaymentCount: waitingTotal, waitingPaymentStuck: waitingStuck,
    proofUploadedNotConfirmed: proofUnconfirmed.rows[0].n, paidNotDelivered,
    paymentStuckCount: paymentStuck,
    hasPaymentMethod: pm.rows[0].n > 0,
    paymentMethodsMissingInstructions: pm.rows[0].no_instr,
    proofRequiredNoProofStep: pm.rows[0].proof_no_step,
    proofUploadedNotReviewed: proofNotReviewed.rows[0].n,
    confirmedNotDelivered: confirmedNotDelivered.rows[0].n,
    inactiveMethodInUse: !!pm.rows[0].any_inactive,
    detailsSentNoWaiting: detailsNoWaiting,
    waitingNoFollowupTask: waitingNoTask.rows[0].n,
    overdueTasks: overdue.rows[0].n, leadsNeedingFollowupNoDate: needFollowupNoDate,
    lostWithoutReason: lostNoReason, highRiskNoAction,
    avgDealValue,
  };
}

export interface RunResult {
  enoughData: boolean;
  message?: string;
  findings: LeakFinding[];
}

/** Run diagnosis: observed snapshot → findings → persist (upsert by code). */
export async function runDiagnosis(tenantId: string, journeyId: string): Promise<RunResult> {
  return withTenant(tenantId, async (c) => {
    const snap = await buildSnapshot(c, journeyId);
    if (!hasEnoughData(snap)) {
      return {
        enoughData: false,
        message: 'لسه مفيش بيانات مرصودة كفاية. فعّل التتبّع وانشر الصفحة وابدأ تجيب ضغطات عشان نقدر نشخّص.',
        findings: [],
      };
    }
    const findings = detectLeaks(snap);

    // Upsert by (journey, code): keep user status if a finding persists; close stale ones.
    const existing = await c.query(`SELECT code, status FROM leak_findings WHERE journey_id=$1`, [journeyId]);
    const keepStatus = new Map(existing.rows.map((r: any) => [r.code, r.status]));
    const currentCodes = new Set(findings.map((f) => f.code));

    for (const f of findings) {
      const status = keepStatus.get(f.code) ?? 'open';
      await c.query(
        `INSERT INTO leak_findings (journey_id, lane, code, title, explanation, evidence, severity, confidence,
            money_impact, fastest_fix, recommended_action, status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
         ON CONFLICT DO NOTHING`,
        [journeyId, f.lane, f.code, f.title, f.explanation, JSON.stringify(f.evidence), f.severity, f.confidence,
         f.moneyImpact, f.fastestFix, f.recommendedAction, status],
      );
      // ensure fields refresh (since no unique constraint, update by code)
      await c.query(
        `UPDATE leak_findings SET lane=$2, title=$3, explanation=$4, evidence=$5, severity=$6, confidence=$7,
            money_impact=$8, fastest_fix=$9, recommended_action=$10, updated_at=now()
          WHERE journey_id=$1 AND code=$11`,
        [journeyId, f.lane, f.title, f.explanation, JSON.stringify(f.evidence), f.severity, f.confidence,
         f.moneyImpact, f.fastestFix, f.recommendedAction, f.code],
      );
    }
    // resolve findings that no longer fire (mark fixed)
    for (const row of existing.rows as any[]) {
      if (!currentCodes.has(row.code) && row.status !== 'fixed' && row.status !== 'ignored') {
        await c.query(`UPDATE leak_findings SET status='fixed', resolved_at=now(), updated_at=now() WHERE journey_id=$1 AND code=$2`, [journeyId, row.code]);
      }
    }

    return { enoughData: true, findings };
  });
}

export async function listLeaks(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT * FROM leak_findings WHERE journey_id=$1 ORDER BY
      CASE severity WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END DESC,
      money_impact DESC NULLS LAST, created_at DESC`, [journeyId]);
    return r.rows;
  });
}

export async function getBiggestLeak(tenantId: string, journeyId: string) {
  const leaks = await listLeaks(tenantId, journeyId);
  const open = leaks.filter((l: any) => l.status === 'open' || l.status === 'fixing');
  return open[0] ?? null;
}

export async function getSummary(tenantId: string, journeyId: string) {
  return withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT lane, code, title, severity, fastest_fix, status FROM leak_findings WHERE journey_id=$1`, [journeyId]);
    const findings = r.rows.map((x: any) => ({ ...x, lane: x.lane, fastestFix: x.fastest_fix })) as any;
    const lanes = laneSummary(findings as any);
    const biggest = biggestLeak(
      (r.rows as any[]).filter((x) => x.status === 'open' || x.status === 'fixing').map((x) => ({
        code: x.code, lane: x.lane, title: x.title, explanation: '', evidence: {}, severity: x.severity,
        confidence: 'medium', moneyImpact: null, fastestFix: x.fastest_fix, recommendedAction: '',
      })) as any,
    );
    return { lanes, biggest };
  });
}

export async function updateLeakStatus(tenantId: string, leakId: string, status: string) {
  await withTenant(tenantId, async (c) => {
    const resolved = (status === 'fixed') ? 'now()' : 'NULL';
    await c.query(`UPDATE leak_findings SET status=$2, resolved_at=${resolved}, updated_at=now() WHERE id=$1`, [leakId, status]);
  });
}
