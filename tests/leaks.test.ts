import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectLeaks, biggestLeak, laneSummary, hasEnoughData, type FunnelSnapshot } from '../modules/leaks/src/engine.js';

/**
 * Sprint 8 — leak detection engine (pure, the moat's correctness guarantee).
 * Proves: detection from observed data, NO fabricated leak without data,
 * evidence on every finding, money impact only when a deal value is known.
 */

function emptySnapshot(over: Partial<FunnelSnapshot> = {}): FunnelSnapshot {
  return {
    hasTrackedLinks: true, linksCount: 1, linksWithoutUtm: 0, inactiveLinkInUse: false,
    totalClicks: 0, leadsCount: 0, leadsWithoutAttribution: 0,
    pagePublished: false, pageViews: 0, scrollReached50: 0, priceReached: 0, ctaClicks: 0,
    whatsappClicks: 0, pageUsesTrackedLink: false,
    leadsByStage: {}, leadsStuckWhatsappClicked: 0, conversationsWithoutContact: 0, leadsWithoutNextAction: 0,
    hasWhatsappFlow: true, hasFirstReplyTemplate: true, hasFollowupTemplate: true, clickedNoReplySent: 0,
    waitingPaymentCount: 0, waitingPaymentStuck: 0, proofUploadedNotConfirmed: 0, paidNotDelivered: 0, paymentStuckCount: 0,
    hasPaymentMethod: true, paymentMethodsMissingInstructions: 0, proofRequiredNoProofStep: 0,
    proofUploadedNotReviewed: 0, confirmedNotDelivered: 0, inactiveMethodInUse: false,
    detailsSentNoWaiting: 0, waitingNoFollowupTask: 0,
    overdueTasks: 0, leadsNeedingFollowupNoDate: 0, lostWithoutReason: 0, highRiskNoAction: 0,
    avgDealValue: null, ...over,
  };
}

test('NO data → hasEnoughData is false (board must show "not enough data", not fake leaks)', () => {
  const s = emptySnapshot({ hasTrackedLinks: false, linksCount: 0 });
  assert.equal(hasEnoughData(s), false);
});

test('does not fabricate a leak when there is signal but nothing wrong', () => {
  // healthy funnel: clicks → leads, good CTA rate, nothing stuck
  const s = emptySnapshot({
    totalClicks: 20, leadsCount: 18, pagePublished: true, pageUsesTrackedLink: true,
    pageViews: 100, ctaClicks: 30, priceReached: 60,
  });
  assert.equal(hasEnoughData(s), true);
  const f = detectLeaks(s);
  // none of the leak codes for stuck/overdue/etc should appear
  assert.equal(f.find((x) => x.code === 'payment.waiting_stuck'), undefined);
  assert.equal(f.find((x) => x.code === 'whatsapp.stuck_clicked'), undefined);
});

test('every finding includes evidence (no leak without evidence)', () => {
  const s = emptySnapshot({
    hasTrackedLinks: false, linksCount: 0, totalClicks: 5, leadsCount: 3,
    pagePublished: true, pageViews: 50, ctaClicks: 2, priceReached: 5,
    waitingPaymentStuck: 4, overdueTasks: 6, avgDealValue: 1000,
  });
  const f = detectLeaks(s);
  assert.ok(f.length > 0);
  for (const finding of f) {
    assert.ok(finding.evidence && Object.keys(finding.evidence).length > 0, `${finding.code} must have evidence`);
    assert.ok(finding.fastestFix.length > 0, `${finding.code} must have a fastest fix`);
    assert.ok(finding.title.length > 0);
  }
});

test('detects a page leak from low CTA rate', () => {
  const s = emptySnapshot({ totalClicks: 1, leadsCount: 1, pagePublished: true, pageUsesTrackedLink: true, pageViews: 120, ctaClicks: 8, priceReached: 50 });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'page.low_cta');
  assert.ok(leak, 'low CTA leak detected');
  assert.equal(leak!.evidence.pageViews, 120);
  assert.equal(leak!.evidence.ctaClicks, 8);
});

test('detects waiting-payment leak and is critical when several stuck', () => {
  const s = emptySnapshot({ leadsCount: 10, waitingPaymentCount: 5, waitingPaymentStuck: 4, avgDealValue: 2000 });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'payment.waiting_stuck');
  assert.ok(leak);
  assert.equal(leak!.severity, 'critical');
  assert.equal(leak!.moneyImpact, 8000, 'money impact = avgDealValue * stuck (only because avgDealValue known)');
});

test('money impact is null when no deal value is observed (never fabricated)', () => {
  const s = emptySnapshot({ leadsCount: 10, waitingPaymentCount: 5, waitingPaymentStuck: 4, avgDealValue: null });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'payment.waiting_stuck');
  assert.equal(leak!.moneyImpact, null);
});

test('detects WhatsApp stage leak (clicked but stuck)', () => {
  const s = emptySnapshot({ totalClicks: 23, leadsCount: 23, leadsStuckWhatsappClicked: 17 });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'whatsapp.stuck_clicked');
  assert.ok(leak);
  assert.equal(leak!.evidence.stuck, 17);
  assert.equal(leak!.severity, 'high');
});

test('detects overdue follow-up leak', () => {
  const s = emptySnapshot({ leadsCount: 5, overdueTasks: 6 });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'followup.overdue_tasks');
  assert.ok(leak);
  assert.equal(leak!.evidence.overdueTasks, 6);
});

test('detects missing tracking setup', () => {
  const s = emptySnapshot({ hasTrackedLinks: false, linksCount: 0, totalClicks: 0, leadsCount: 2, pageViews: 5 });
  const f = detectLeaks(s);
  assert.ok(f.find((x) => x.code === 'tracking.no_links'));
});

test('detects missing attribution', () => {
  const s = emptySnapshot({ leadsCount: 10, leadsWithoutAttribution: 4, totalClicks: 10 });
  const f = detectLeaks(s);
  const leak = f.find((x) => x.code === 'tracking.leads_no_attribution');
  assert.ok(leak);
  assert.equal(leak!.evidence.leadsWithoutAttribution, 4);
});

test('biggestLeak prefers critical, then money impact', () => {
  const s = emptySnapshot({
    leadsCount: 20, totalClicks: 20, waitingPaymentStuck: 4, avgDealValue: 1000,
    overdueTasks: 6, pageViews: 100, ctaClicks: 5,
  });
  const f = detectLeaks(s);
  const big = biggestLeak(f);
  assert.ok(big);
  assert.equal(big!.severity, 'critical', 'critical waiting-payment is the biggest');
});

test('laneSummary groups findings across the 6 lanes', () => {
  const s = emptySnapshot({ hasTrackedLinks: false, linksCount: 0, totalClicks: 3, leadsCount: 3, overdueTasks: 2 });
  const sum = laneSummary(detectLeaks(s));
  assert.ok('traffic' in sum && 'page' in sum && 'whatsapp' in sum && 'payment' in sum && 'followup' in sum && 'tracking' in sum);
  assert.ok(sum.followup.count >= 1);
});
