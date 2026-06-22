import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';

/**
 * Sprint 6 — capture/tracking. DB-backed paths (click → lead/conversation) run
 * against Postgres in the live suite; here we assert the routing, validation,
 * and the production-safe tenant resolution that protect every public request.
 */

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, opts: { tenant?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
  });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

test('DEV: create tracked link requires a destination phone or url', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels/j1/links', { tenant: 't1', body: { source: 'meta' } });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /destination/);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: tracked redirect in production does NOT use a client tenant param', async () => {
  // No control-plane mapping exists for this code and we are NOT in dev mode,
  // so even with an x-tenant-id header the redirect must refuse (404), never
  // trusting the client-supplied tenant.
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/r/nonexistent`, {
      headers: { 'x-tenant-id': 'attacker-tenant' }, redirect: 'manual',
    });
    assert.equal(res.status, 404, 'must not honor client tenant in production');
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('public page read in production ignores client tenant header', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/p/someslug`, {
      headers: { 'x-tenant-id': 'attacker-tenant' }, redirect: 'manual',
    });
    assert.equal(res.status, 404, 'no control-plane mapping → 404, not data leak');
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('page-event tracking requires a type', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/track/page-event', { tenant: 't1', body: { slug: 'x' } });
    assert.equal(r.status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});
