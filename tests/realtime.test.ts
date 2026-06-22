import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { computeServiceWindow, windowHint, SERVICE_WINDOW_HOURS } from '../modules/realtime/src/service-window.js';

/**
 * Sprint 16 — Real-Time Revenue Operations. The service-window math is pure and
 * tested here; the DB-backed processor (inbound enrichment, payment matching,
 * action generation) runs in the live suite. Webhook security re-verified.
 */

const H = 3600_000;

test('service window: open right after an inbound message', () => {
  const now = new Date();
  const w = computeServiceWindow(new Date(now.getTime() - 1 * H), now);
  assert.equal(w.status, 'open');
  assert.ok((w.hoursLeft ?? 0) > 20);
});

test('service window: expiring_soon within the last 3 hours', () => {
  const now = new Date();
  const w = computeServiceWindow(new Date(now.getTime() - (SERVICE_WINDOW_HOURS - 2) * H), now);
  assert.equal(w.status, 'expiring_soon');
});

test('service window: closed after 24h', () => {
  const now = new Date();
  const w = computeServiceWindow(new Date(now.getTime() - 25 * H), now);
  assert.equal(w.status, 'closed');
  assert.equal(w.hoursLeft, 0);
});

test('service window: unknown with no inbound', () => {
  assert.equal(computeServiceWindow(null).status, 'unknown');
});

test('window hints are Arabic and status-appropriate', () => {
  assert.ok(windowHint('open', 20).includes('مجاني'));
  assert.ok(windowHint('expiring_soon', 2).includes('هتقفل'));
  assert.ok(windowHint('closed', 0).includes('أغلقت'));
});

// ---- API surface ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, opts: { tenant?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

test('SECURITY: activity feed + conversation routes reject header tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/funnels/j1/activity', { tenant: 'attacker' })).status, 401);
    assert.equal((await call(port, 'GET', '/leads/l1/conversation', { tenant: 'attacker' })).status, 401);
    assert.equal((await call(port, 'POST', '/leads/l1/copilot/suggest-from-inbound', { tenant: 'attacker' })).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('SECURITY: payment webhook still resolves tenant from connectionId only (unknown → 404)', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/webhooks/payments/paymob/00000000-0000-0000-0000-000000000000', {
      tenant: 'attacker', body: { success: true, merchant_order_id: 'x' },
    });
    assert.equal(r.status, 404);
  } finally { server.close(); }
});

test('conversation note requires a note body', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/leads/l1/conversation/note', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});
