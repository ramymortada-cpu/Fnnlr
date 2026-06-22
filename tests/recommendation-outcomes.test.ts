import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { interpretRecommendationOutcome, aggregateRecLearning, applyRecLearningToScore, type RecSignals, type RecLearningRecord } from '../modules/recommendations/src/outcome-engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 29 — Recommendation Outcome Loop. The outcome engine + learning + scoring
 * feedback are pure and tested here: evidence-based `worked` only, awaiting until
 * a draft is sent, honest confidence, learning never overrides obvious urgency.
 */

function sig(over: Partial<RecSignals> = {}): RecSignals {
  return { recommendationType: 'create_task', appliedHoursAgo: 30, ...over };
}

test('task recommendation worked when task completed and lead progressed', () => {
  const r = interpretRecommendationOutcome(sig({ recommendationType: 'create_task', taskCompleted: true, leadProgressed: true }));
  assert.equal(r.status, 'worked');
});

test('WhatsApp draft recommendation awaiting until marked sent', () => {
  const r = interpretRecommendationOutcome(sig({ recommendationType: 'draft_whatsapp_reply', draftMarkedSent: false }));
  assert.equal(r.status, 'awaiting_evidence');
  assert.ok(r.interpretation.includes('ماتبعتتش'));
});

test('WhatsApp draft worked when reply marked sent and lead progressed', () => {
  const r = interpretRecommendationOutcome(sig({ recommendationType: 'draft_whatsapp_reply', draftMarkedSent: true, leadProgressed: true }));
  assert.equal(r.status, 'worked');
});

test('payment reminder worked when confirmed and attribution matches', () => {
  const r = interpretRecommendationOutcome(sig({ recommendationType: 'draft_payment_reminder', draftMarkedSent: true, paymentConfirmed: true, attributionPointsHere: true, attributionStrength: 'strong', capturedValue: 500, currency: 'EGP' }));
  assert.equal(r.status, 'worked');
  assert.equal(r.attributedToRecommendation, true);
  assert.equal(r.confidence, 'high');
  assert.equal(r.capturedValue, 500);
});

test('repair recommendation worked when repair outcome improved', () => {
  assert.equal(interpretRecommendationOutcome(sig({ recommendationType: 'build_repair_plan', repairImproved: true })).status, 'worked');
});

test('playbook recommendation worked when application outcome improved', () => {
  assert.equal(interpretRecommendationOutcome(sig({ recommendationType: 'apply_playbook', appliedHoursAgo: 60, applicationImproved: true })).status, 'worked');
});

test('NO fake worked without evidence → awaiting or no_result', () => {
  const early = interpretRecommendationOutcome(sig({ recommendationType: 'create_task', appliedHoursAgo: 2 }));
  assert.equal(early.status, 'awaiting_evidence');
  const late = interpretRecommendationOutcome(sig({ recommendationType: 'create_task', appliedHoursAgo: 50, taskCompleted: true, leadProgressed: false }));
  assert.equal(late.status, 'no_result');
});

test('failed when lead lost after the action', () => {
  assert.equal(interpretRecommendationOutcome(sig({ leadLost: true })).status, 'failed');
});

test('early signal: movement within window, no clear result yet', () => {
  const r = interpretRecommendationOutcome(sig({ recommendationType: 'create_task', appliedHoursAgo: 5, taskCompleted: true, leadProgressed: false }));
  assert.equal(r.status, 'early_signal');
});

test('learning aggregation by recommendation_type: work rate over decided only', () => {
  const recs: RecLearningRecord[] = [
    { recommendationType: 'draft_payment_reminder', status: 'worked' },
    { recommendationType: 'draft_payment_reminder', status: 'worked' },
    { recommendationType: 'draft_payment_reminder', status: 'no_result' },
    { recommendationType: 'draft_payment_reminder', status: 'awaiting_evidence' },  // excluded from rate
  ];
  const agg = aggregateRecLearning(recs)[0];
  assert.equal(agg.decided, 3);
  assert.ok(Math.abs((agg.workRate ?? 0) - 2 / 3) < 1e-9);
});

test('no high confidence from low sample learning', () => {
  const agg = aggregateRecLearning([{ recommendationType: 'create_task', status: 'worked' }])[0];
  assert.equal(agg.confidence, 'low');
  assert.equal(agg.limited, true);
});

test('high confidence not inflated by mostly-awaiting records', () => {
  const decided = Array.from({ length: 25 }, () => ({ recommendationType: 'x', status: 'worked' as const }));
  const awaiting = Array.from({ length: 40 }, () => ({ recommendationType: 'x', status: 'awaiting_evidence' as const }));
  const agg = aggregateRecLearning([...decided, ...awaiting])[0];
  assert.notEqual(agg.confidence, 'high');
});

test('scoring uses recommendation learning cautiously; never lowers critical', () => {
  const lowWork = aggregateRecLearning([
    ...Array.from({ length: 8 }, () => ({ recommendationType: 'x', status: 'no_result' as const })),
    ...Array.from({ length: 2 }, () => ({ recommendationType: 'x', status: 'worked' as const })),
  ])[0];
  assert.ok(applyRecLearningToScore(70, 'critical', lowWork).score >= 70);   // urgency protected
  const highWork = aggregateRecLearning(Array.from({ length: 10 }, () => ({ recommendationType: 'x', status: 'worked' as const })))[0];
  const r = applyRecLearningToScore(50, 'medium', highWork);
  assert.ok(r.score > 50);
  assert.ok(r.note);
});

test('limited learning does not change the score', () => {
  const learning = aggregateRecLearning([{ recommendationType: 'x', status: 'worked' }])[0];
  assert.equal(applyRecLearningToScore(60, 'medium', learning).score, 60);
});

test('command classifier routes recommendation-outcome intents', () => {
  assert.equal(classifyCommand('إيه التوصيات اللي جابت نتيجة؟').intent, 'which_recommendations_worked');
  assert.equal(classifyCommand('اتعلمنا إيه من التوصيات؟').intent, 'what_learned_recommendations');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: method === 'POST' ? '{}' : undefined,
  });
  return { status: res.status };
}

test('SECURITY: recommendation outcome routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/recommendations/r1/outcome/check', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/recommendations/learning', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/recommendations/outcomes/summary', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/recommendations/r1/mark-worked', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
