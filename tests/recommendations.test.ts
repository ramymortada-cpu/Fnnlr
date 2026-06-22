import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { recommendForOpportunity, rankRecommendations, type OppForRec, type ActionLearningLite } from '../modules/recommendations/src/engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 28 — Action Recommendation Engine. The engine is pure and tested here:
 * best next action per opportunity, honest confidence (high only with real
 * learning), explained scoring, and an explicit fallback when learning is thin.
 */

function opp(over: Partial<OppForRec> = {}): OppForRec {
  return { opportunityId: 'o1', opportunityType: 'waiting_payment_recovery', leadId: 'l1', funnelId: 'f1', priorityScore: 60, urgency: 'high', estimatedValue: null, valueCurrency: null, serviceWindow: 'unknown', ...over };
}
function learn(rate: number, attempts = 10): Record<string, ActionLearningLite> {
  return { payment_reminder_drafted: { attributedActionType: 'payment_reminder_drafted', captureRate: rate, capturedCount: Math.round(rate * attempts), attempts, limited: attempts < 5 } };
}

test('waiting payment recommends payment reminder when attribution learning supports it', () => {
  const r = recommendForOpportunity(opp(), learn(0.6))!;
  assert.equal(r.recommendationType, 'draft_payment_reminder');
  assert.equal(r.confidence, 'high');
  assert.equal(r.learningSource, 'attribution');
});

test('access delivery is high priority even without learning', () => {
  const r = recommendForOpportunity(opp({ opportunityType: 'access_delivery', urgency: 'critical', priorityScore: 90 }), {})!;
  assert.equal(r.recommendationType, 'deliver_access');
  assert.equal(r.urgency, 'critical');
  assert.ok(r.priorityScore >= 90);
});

test('NO high confidence without learning data → falls back with explicit note', () => {
  const r = recommendForOpportunity(opp(), {})!;   // no learning
  assert.equal(r.confidence, 'low');
  assert.equal(r.learningSource, 'heuristic');
  assert.ok(r.explanation.includes('بيانات التعلّم محدودة'));
});

test('limited learning (small sample) does not grant high confidence', () => {
  const r = recommendForOpportunity(opp(), learn(0.8, 3))!;   // attempts < 5 → limited
  assert.notEqual(r.confidence, 'high');
  assert.equal(r.learningSource, 'heuristic');
});

test('recommendation scoring explanation exists ("ranked high because")', () => {
  const r = recommendForOpportunity(opp({ estimatedValue: 500, valueCurrency: 'EGP' }), learn(0.6))!;
  assert.ok(r.explanation.includes('الترتيب عالي علشان'));
  assert.ok(Array.isArray((r.evidence as any).reasons));
});

test('service window expiring boosts WhatsApp recommendation score', () => {
  const open = recommendForOpportunity(opp({ opportunityType: 'whatsapp_first_reply', serviceWindow: 'open', priorityScore: 50 }), {})!;
  const exp = recommendForOpportunity(opp({ opportunityType: 'whatsapp_first_reply', serviceWindow: 'expiring_soon', priorityScore: 50 }), {})!;
  assert.ok(exp.priorityScore > open.priorityScore);
});

test('every mutating recommendation requires approval', () => {
  for (const t of ['waiting_payment_recovery', 'proof_review', 'access_delivery', 'leak_repair']) {
    const r = recommendForOpportunity(opp({ opportunityType: t }), {})!;
    assert.equal(r.requiresApproval, true);
  }
});

test('high known-value capture rate raises the score', () => {
  const base = recommendForOpportunity(opp({ priorityScore: 50, estimatedValue: null }), learn(0.2))!;
  const boosted = recommendForOpportunity(opp({ priorityScore: 50, estimatedValue: 500, valueCurrency: 'EGP' }), learn(0.6))!;
  assert.ok(boosted.priorityScore > base.priorityScore);
});

test('ranking orders by urgency then score', () => {
  const recs = rankRecommendations([
    opp({ opportunityId: 'a', opportunityType: 'followup_reactivation', urgency: 'medium', priorityScore: 80 }),
    opp({ opportunityId: 'b', opportunityType: 'access_delivery', urgency: 'critical', priorityScore: 40 }),
  ], {});
  assert.equal(recs[0].opportunityId, 'b');   // critical first despite lower score
});

test('unknown opportunity type yields no recommendation', () => {
  assert.equal(recommendForOpportunity(opp({ opportunityType: 'mystery' }), {}), null);
});

test('command classifier routes recommendation intents', () => {
  assert.equal(classifyCommand('اعمل إيه دلوقتي؟').intent, 'what_to_do_now');
  assert.equal(classifyCommand('هات أفضل 5 إجراءات النهارده').intent, 'top_actions_today');
});

// ---- API security + approval gate ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string, body?: any) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
  });
  return { status: res.status };
}

test('SECURITY: recommendation routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/recommendations', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/recommendations/summary', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/recommendations/refresh', 'attacker', { funnelId: 'f1' })).status, 401);
    assert.equal((await call(port, 'POST', '/recommendations/r1/apply', 'attacker', { approved: true })).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
