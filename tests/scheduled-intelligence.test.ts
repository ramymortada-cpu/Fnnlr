import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { detectDue, isStale, type DueCandidate } from '../modules/scheduler/src/due.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 24 — Scheduled Intelligence. The due-detection + stale logic is pure
 * and tested here: never due before the minimum window, never re-measures a
 * settled outcome. DB-backed idempotency + run records run in the live suite.
 */

function c(over: Partial<DueCandidate> = {}): DueCandidate {
  return { id: 'r1', appliedHoursAgo: 50, lastOutcome: null, minHours: 24, ...over };
}

test('NOT due before the minimum window, even if never measured', () => {
  assert.equal(detectDue([c({ appliedHoursAgo: 10, minHours: 24, lastOutcome: null })]).length, 0);
});

test('due when never measured and window passed', () => {
  const due = detectDue([c({ appliedHoursAgo: 30, minHours: 24, lastOutcome: null })]);
  assert.equal(due.length, 1);
  assert.equal(due[0].reason, 'never_measured');
});

test('due when awaiting_data and window now passed', () => {
  const due = detectDue([c({ appliedHoursAgo: 30, minHours: 24, lastOutcome: 'awaiting_data' })]);
  assert.equal(due[0].reason, 'awaiting_window_passed');
});

test('early_signal triggers a re-check after the window', () => {
  const due = detectDue([c({ appliedHoursAgo: 60, minHours: 48, lastOutcome: 'early_signal' })]);
  assert.equal(due[0].reason, 'early_signal_recheck');
});

test('settled outcomes are NOT due (improved / no_change / worsened / inconclusive)', () => {
  for (const s of ['improved', 'no_change', 'worsened', 'inconclusive']) {
    assert.equal(detectDue([c({ appliedHoursAgo: 100, lastOutcome: s })]).length, 0, `${s} should not be due`);
  }
});

test('isStale: never refreshed → stale; recent → fresh; old → stale', () => {
  assert.equal(isStale(null, 24), true);
  assert.equal(isStale(2, 24), false);
  assert.equal(isStale(48, 24), true);
});

test('command classifier routes scheduled-intelligence intents', () => {
  assert.equal(classifyCommand('حدّث ذكاء البيزنس').intent, 'refresh_business_intelligence');
  assert.equal(classifyCommand('اعمل تقرير أسبوعي للبيزنس').intent, 'weekly_business_report');
  assert.equal(classifyCommand('إيه اللي محتاج قياس؟').intent, 'what_needs_measuring');
  assert.equal(classifyCommand('إيه اللي اتأخر؟').intent, 'what_is_overdue');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, headers: Record<string, string> = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? '{}' : undefined,
  });
  return { status: res.status };
}

test('SECURITY: scheduled routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/scheduled/daily-refresh', { 'x-tenant-id': 'attacker' })).status, 401);
    assert.equal((await call(port, 'GET', '/scheduled/status', { 'x-tenant-id': 'attacker' })).status, 401);
    assert.equal((await call(port, 'GET', '/scheduled/runs', { 'x-tenant-id': 'attacker' })).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('SECURITY: internal cron endpoint rejects unsigned / wrong-secret calls, never trusts tenant header', async () => {
  const prevSecret = process.env.FNNLR_CRON_SECRET;
  const prevDev = process.env.FNNLR_DEV_MODE;
  process.env.FNNLR_CRON_SECRET = 'right-secret';
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/internal/cron/daily-refresh')).status, 401);                        // no secret
    assert.equal((await call(port, 'POST', '/internal/cron/daily-refresh', { 'x-cron-secret': 'wrong' })).status, 401); // wrong secret
    // correct secret but tenant only as header (no body tenantId) → 422, never honored
    const r = await fetch(`http://localhost:${port}/internal/cron/daily-refresh`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': 'right-secret', 'x-tenant-id': 'attacker' }, body: '{}',
    });
    assert.equal(r.status, 422);
  } finally {
    server.close();
    if (prevSecret !== undefined) process.env.FNNLR_CRON_SECRET = prevSecret; else delete process.env.FNNLR_CRON_SECRET;
    if (prevDev !== undefined) process.env.FNNLR_DEV_MODE = prevDev;
  }
});
