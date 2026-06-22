import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { interpretOutcome, type OutcomeInput } from '../modules/repairs/src/outcome-engine.js';

/**
 * Sprint 18 — Repair Outcome Intelligence. The interpreter is pure and tested
 * here: minimum-data gating, honest status, confidence. DB-backed measurement
 * + learning storage run in the live suite.
 */

test('payment repair: awaiting_data when not enough time has passed', () => {
  const r = interpretOutcome({ type: 'payment_recovery', baseline: { waitingPayment: 12 }, current: { waitingPayment: 12 }, hoursElapsed: 2 });
  assert.equal(r.status, 'awaiting_data');
  assert.equal(r.confidence, 'low');
});

test('payment repair: improved when waiting_payment drops after the window', () => {
  const r = interpretOutcome({ type: 'payment_recovery', baseline: { waitingPayment: 12 }, current: { waitingPayment: 5 }, hoursElapsed: 36 });
  assert.equal(r.status, 'improved');
  assert.ok(r.confidence === 'high' || r.confidence === 'medium');
  assert.ok(r.interpretation.includes('قلّ') || r.interpretation.includes('تحسّن'));
});

test('payment repair: early_signal when movement shows before the full window', () => {
  const r = interpretOutcome({ type: 'payment_recovery', baseline: { waitingPayment: 12 }, current: { waitingPayment: 9 }, hoursElapsed: 6 });
  assert.equal(r.status, 'early_signal');
  assert.equal(r.confidence, 'low');
});

test('payment repair: no_change when nothing moves after the window', () => {
  const r = interpretOutcome({ type: 'payment_recovery', baseline: { waitingPayment: 10 }, current: { waitingPayment: 10 }, hoursElapsed: 30 });
  assert.equal(r.status, 'no_change');
  assert.equal(r.recommendedNextAction, 'apply_next_repair');
});

test('whatsapp first-reply: improved from clicked→contacted movement', () => {
  const r = interpretOutcome({ type: 'whatsapp_first_reply', baseline: { clickedNotContacted: 8 }, current: { clickedNotContacted: 3, movedToContacted: 5, repliesMarkedSent: 5 }, hoursElapsed: 20 });
  assert.equal(r.status, 'improved');
});

test('page CTA: waits for minimum views even after time passes', () => {
  // 48h passed but only 10 new views (<30 min) → awaiting_data
  const r = interpretOutcome({ type: 'page_cta_fix', baseline: { pageViews: 100, ctaRate: 0.02 }, current: { pageViews: 110, ctaRate: 0.05 }, hoursElapsed: 60 });
  assert.equal(r.status, 'awaiting_data');
});

test('page CTA: improved when CTA rate rises with enough views', () => {
  const r = interpretOutcome({ type: 'page_cta_fix', baseline: { pageViews: 100, ctaRate: 0.02 }, current: { pageViews: 150, ctaRate: 0.06 }, hoursElapsed: 60 });
  assert.equal(r.status, 'improved');
});

test('tracking repair: improved when attribution coverage rises', () => {
  const r = interpretOutcome({ type: 'tracking_fix', baseline: { attributedLeads: 0, trackedLinks: 0 }, current: { attributedLeads: 4, trackedLinks: 1 }, hoursElapsed: 2 });
  assert.equal(r.status, 'improved');
});

test('NO fake improvement: zero data, zero time → awaiting_data, never improved', () => {
  const r = interpretOutcome({ type: 'followup_fix', baseline: { overdueTasks: 5 }, current: { overdueTasks: 5 }, hoursElapsed: 0 });
  assert.notEqual(r.status, 'improved');
  assert.equal(r.status, 'awaiting_data');
});

test('confidence is strong only for a large primary move', () => {
  const small = interpretOutcome({ type: 'followup_fix', baseline: { overdueTasks: 5 }, current: { overdueTasks: 4 }, hoursElapsed: 30 });
  const big = interpretOutcome({ type: 'followup_fix', baseline: { overdueTasks: 9 }, current: { overdueTasks: 1 }, hoursElapsed: 30 });
  assert.equal(small.status, 'improved');
  assert.equal(small.confidence, 'medium');
  assert.equal(big.confidence, 'high');
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

test('SECURITY: outcome routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/repairs/r1/outcomes/measure', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/funnels/j1/repair-outcomes', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/repair-outcomes/o1/confirm', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
