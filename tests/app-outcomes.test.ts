import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { interpretAppOutcome, scopeToPlaybookType } from '../modules/playbooks/src/app-outcome-engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 22 — Playbook Application Outcome Loop. The scope-keyed interpreter is
 * pure and tested here: minimum-data gating, honest status, no fake improvement.
 * DB-backed baseline capture + learning storage run in the live suite.
 */

const H = 1;

test('page application: awaiting_data before minimum views even after time', () => {
  // 60h passed but only 10 new views (<30) → awaiting_data
  const r = interpretAppOutcome({ scope: 'page', baseline: { pageViews: 100, ctaRate: 0.04 }, current: { pageViews: 110, ctaRate: 0.07 }, hoursElapsed: 60 });
  assert.equal(r.status, 'awaiting_data');
  assert.equal(r.confidence, 'low');
});

test('page application: improved when CTA rate rises with enough views', () => {
  const r = interpretAppOutcome({ scope: 'page', baseline: { pageViews: 100, ctaRate: 0.04 }, current: { pageViews: 150, ctaRate: 0.08 }, hoursElapsed: 60 });
  assert.equal(r.status, 'improved');
});

test('whatsapp application: early_signal when contacted movement shows before window', () => {
  const r = interpretAppOutcome({ scope: 'whatsapp', baseline: { clickedNotContacted: 8 }, current: { clickedNotContacted: 5 }, hoursElapsed: 6 });
  assert.equal(r.status, 'early_signal');
  assert.equal(r.confidence, 'low');
});

test('whatsapp application: improved after window with real contacted movement', () => {
  const r = interpretAppOutcome({ scope: 'whatsapp', baseline: { clickedNotContacted: 8 }, current: { clickedNotContacted: 3, contacted: 5, repliesMarkedSent: 5 }, hoursElapsed: 30 });
  assert.equal(r.status, 'improved');
});

test('payment application: improved when waiting payment drops', () => {
  const r = interpretAppOutcome({ scope: 'payment', baseline: { waitingPayment: 10 }, current: { waitingPayment: 4 }, hoursElapsed: 30 });
  assert.equal(r.status, 'improved');
  assert.ok(r.confidence === 'high' || r.confidence === 'medium');
});

test('followup application: improved when overdue tasks drop', () => {
  const r = interpretAppOutcome({ scope: 'followup', baseline: { overdueTasks: 9, tasksDone: 0 }, current: { overdueTasks: 1, tasksDone: 8 }, hoursElapsed: 30 });
  assert.equal(r.status, 'improved');
  assert.equal(r.confidence, 'high');
});

test('NO fake improvement: zero data, zero time → awaiting_data', () => {
  const r = interpretAppOutcome({ scope: 'payment', baseline: { waitingPayment: 5 }, current: { waitingPayment: 5 }, hoursElapsed: 0 });
  assert.notEqual(r.status, 'improved');
  assert.equal(r.status, 'awaiting_data');
});

test('no_change after the window keeps an honest verdict', () => {
  const r = interpretAppOutcome({ scope: 'payment', baseline: { waitingPayment: 6 }, current: { waitingPayment: 6 }, hoursElapsed: 30 });
  assert.equal(r.status, 'no_change');
  assert.equal(r.recommendedNextAction, 'apply_different_playbook');
});

test('scope maps to playbook type (all/funnel → funnel)', () => {
  assert.equal(scopeToPlaybookType('all'), 'funnel');
  assert.equal(scopeToPlaybookType('funnel'), 'funnel');
  assert.equal(scopeToPlaybookType('page'), 'page');
});

test('command classifier routes application-outcome intents', () => {
  assert.equal(classifyCommand('قيس نتيجة تطبيق الـ playbook').intent, 'measure_application_outcome');
  assert.equal(classifyCommand('هل تطبيق الـ playbook اشتغل؟').intent, 'did_application_work');
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

test('SECURITY: application outcome routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/playbook-applications/p1/measure', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/playbook-applications/p1/outcomes', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/playbook-application-summary', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
