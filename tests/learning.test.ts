import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { summarizeLearning, type LearningRecord } from '../modules/repairs/src/learning.js';
import { alternativeFor } from '../modules/repairs/src/planner.js';

/**
 * Sprint 19 — Evidence-Weighted Repair Planner. Learning aggregation +
 * confidence are pure and tested here. The DB-backed planner weighting runs in
 * the live suite. Core honesty rule: no false high confidence.
 */

function rec(successStatus: string, market: string | null = null, repairType = 'payment_recovery'): LearningRecord {
  return { repairType, market, successStatus, confidence: 'medium' };
}

test('aggregation counts outcomes by repair type', () => {
  const s = summarizeLearning([rec('improved'), rec('improved'), rec('no_change'), rec('worsened')], 'payment_recovery');
  assert.equal(s.sampleSize, 4);
  assert.equal(s.improvedCount, 2);
  assert.equal(s.noChangeCount, 1);
  assert.equal(s.worsenedCount, 1);
  assert.equal(s.decidedCount, 4);
  assert.equal(s.successRate, 0.5);
});

test('confidence is low when decided sample size < 3', () => {
  const s = summarizeLearning([rec('improved'), rec('no_change')], 'payment_recovery');
  assert.equal(s.confidence, 'low');
  assert.equal(s.limited, true);
});

test('confidence is medium for 3–10 decided, high for >10', () => {
  const five = Array.from({ length: 5 }, () => rec('improved'));
  assert.equal(summarizeLearning(five, 'payment_recovery').confidence, 'medium');
  const twelve = Array.from({ length: 12 }, () => rec('improved'));
  assert.equal(summarizeLearning(twelve, 'payment_recovery').confidence, 'high');
});

test('NO false high confidence when mostly awaiting_data/inconclusive', () => {
  // 4 decided (would be 'medium'), but 9 awaiting → mostly undecided, stays capped
  const recs = [
    ...Array.from({ length: 4 }, () => rec('improved')),
    ...Array.from({ length: 9 }, () => rec('awaiting_data')),
  ];
  const s = summarizeLearning(recs, 'payment_recovery');
  assert.notEqual(s.confidence, 'high');
  // successRate is over decided only — awaiting never inflates it
  assert.equal(s.successRate, 1);
  assert.equal(s.decidedCount, 4);
});

test('awaiting_data and early_signal never count as decided', () => {
  const s = summarizeLearning([rec('awaiting_data'), rec('early_signal'), rec('early_signal')], 'payment_recovery');
  assert.equal(s.decidedCount, 0);
  assert.equal(s.successRate, null);
  assert.equal(s.confidence, 'low');
  assert.ok(s.note.includes('محدودة') || s.note.includes('مفيش'));
});

test('market scoping filters records', () => {
  const recs = [rec('improved', 'eg'), rec('no_change', 'eg'), rec('improved', 'sa')];
  const eg = summarizeLearning(recs, 'payment_recovery', 'eg');
  assert.equal(eg.sampleSize, 2);
  assert.equal(eg.improvedCount, 1);
});

test('empty learning → honest "no data" note, low confidence', () => {
  const s = summarizeLearning([], 'whatsapp_first_reply');
  assert.equal(s.sampleSize, 0);
  assert.equal(s.confidence, 'low');
  assert.equal(s.successRate, null);
});

test('alternatives exist for the main repair types', () => {
  assert.ok(alternativeFor('payment_recovery'));
  assert.ok(alternativeFor('page_cta_fix'));
  assert.ok(alternativeFor('whatsapp_first_reply'));
  assert.ok(alternativeFor('followup_fix'));
  // each alternative has a title, whenToUse, and steps
  const alt = alternativeFor('payment_recovery')!;
  assert.ok(alt.title && alt.whenToUse && alt.steps.length > 0);
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) },
  });
  return { status: res.status };
}

test('SECURITY: learning + switch-strategy routes reject header tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/repair-learning', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/repairs/r1/switch-strategy', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
