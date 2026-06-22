import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';

/**
 * Sprint 32 — Webhook / public-route / cron tenant-resolution security.
 * Webhooks and public routes must resolve the tenant SERVER-SIDE (from
 * connectionId / code / slug), never from a client header. A spoofed
 * x-tenant-id grants nothing; an unknown connection is a safe 404; an unsigned
 * cron call is 401. These reject before any tenant data is touched, so they run
 * without a live DB (resolveTenantByConnection fails safe to null).
 */

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, opts: { tenant?: string; cronSecret?: string; body?: any } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}),
      ...(opts.cronSecret ? { 'x-cron-secret': opts.cronSecret } : {}),
    },
    body: method === 'POST' ? JSON.stringify(opts.body ?? {}) : undefined,
  });
  let json: any = null; try { json = await res.json(); } catch { /* non-json */ }
  return { status: res.status, json };
}

test('WhatsApp webhook: unknown connectionId → safe 404 (no header trust)', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/webhooks/whatsapp/does-not-exist', { tenant: 'attacker-tenant' });
    assert.equal(r.status, 404);   // resolved from connectionId, not the spoofed header
  } finally { server.close(); }
});

test('Payment webhook: unknown connectionId → safe 404', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/webhooks/payments/paymob/unknown-conn', { tenant: 'attacker-tenant' });
    assert.equal(r.status, 404);
  } finally { server.close(); }
});

test('spoofed x-tenant-id on a protected route grants nothing in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/leads', { tenant: 'victim-tenant' });
    assert.equal(r.status, 401);   // no session → rejected, header ignored
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('cron: missing secret → 401', async () => {
  const prev = process.env.FNNLR_CRON_SECRET; process.env.FNNLR_CRON_SECRET = 'the-real-secret';
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/internal/cron/daily-refresh', { body: { tenantId: 't1' } });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev === undefined) delete process.env.FNNLR_CRON_SECRET; else process.env.FNNLR_CRON_SECRET = prev; }
});

test('cron: wrong secret → 401', async () => {
  const prev = process.env.FNNLR_CRON_SECRET; process.env.FNNLR_CRON_SECRET = 'the-real-secret';
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/internal/cron/daily-refresh', { cronSecret: 'wrong', body: { tenantId: 't1' } });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev === undefined) delete process.env.FNNLR_CRON_SECRET; else process.env.FNNLR_CRON_SECRET = prev; }
});

test('cron: correct secret but no tenantId in body → 422 (never falls back to a header)', async () => {
  const prev = process.env.FNNLR_CRON_SECRET; process.env.FNNLR_CRON_SECRET = 'the-real-secret';
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/internal/cron/daily-refresh', { cronSecret: 'the-real-secret', tenant: 'header-tenant', body: {} });
    assert.equal(r.status, 422);   // tenant must come from the signed body, not the header
  } finally { server.close(); if (prev === undefined) delete process.env.FNNLR_CRON_SECRET; else process.env.FNNLR_CRON_SECRET = prev; }
});

test('public redirect /r/:code with unknown code does not leak tenant data', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/r/nonexistent-code');
    assert.ok(r.status === 404 || r.status === 302, 'unknown code is 404 or a safe redirect, never tenant data');
  } finally { server.close(); }
});
