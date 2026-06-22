import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';

/**
 * API surface tests (no DB): routing, validation, CORS, and — most importantly —
 * the Sprint 1 hardening: tenant comes from the session, NOT a client header.
 * In production mode an x-tenant-id header must NOT grant tenant access.
 */

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}

async function call(port: number, method: string, path: string,
  opts: { tenant?: string; bearer?: string; body?: unknown } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}),
      ...(opts.bearer ? { 'authorization': `Bearer ${opts.bearer}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

test('health check needs no auth', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.json.ok, true);
  } finally { server.close(); }
});

test('SECURITY: in production mode, x-tenant-id header does NOT grant access', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;            // production
  const server = createApiServer();
  const port = await listen(server);
  try {
    // Attempt to spoof a tenant purely via header, no session → must be 401.
    const r = await call(port, 'GET', '/automations', { tenant: 'victim-tenant-id' });
    assert.equal(r.status, 401, 'header-only tenant must be rejected in production');
    assert.match(r.json.error, /auth/i);
  } finally {
    server.close();
    if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev;
  }
});

test('requests with no session and no dev header are rejected', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/automations');
    assert.equal(r.status, 401);
  } finally {
    server.close();
    if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev;
  }
});

test('DEV mode honors x-tenant-id (explicitly opt-in only)', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    // In dev mode the header is accepted, so validation is reached (422), not 401.
    const r = await call(port, 'POST', '/automations', { tenant: 't1', body: { name: 'x' } });
    assert.equal(r.status, 422, 'dev mode reaches validation');
    assert.match(r.json.error, /actions/);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('DEV mode: POST /funnels validation', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels', { tenant: 't1', body: { businessId: 'b' } });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /onboarding/);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('auth signup validation (missing fields)', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/auth/signup', { body: { email: 'a@b.com' } });
    assert.equal(r.status, 422);
  } finally { server.close(); }
});

test('auth/me without a token is unauthenticated', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/auth/me');
    assert.equal(r.status, 401);
  } finally { server.close(); }
});

test('CORS preflight allows Authorization header', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/automations`, { method: 'OPTIONS' });
    assert.equal(res.status, 204);
    assert.match(res.headers.get('access-control-allow-headers') ?? '', /authorization/i);
  } finally { server.close(); }
});

test('DEV mode: offer action requires an action', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels/j1/offer/action', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /action/);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('DEV mode: stage reorder requires orderedIds[]', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels/j1/stages/reorder', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /orderedIds/);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('DEV mode: page section reorder requires pageId + orderedIds[]', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/funnels/j1/page/sections/reorder', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('DEV mode: section action requires an action', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/sections/s1/action', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /action/);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('public page read requires no auth; unmapped slug returns 404', async () => {
  // No session, no dev mapping → resolver finds no tenant → 404 (not a data leak, not 500).
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/p/somelug`);
    assert.equal(res.status, 404);
  } finally {
    server.close();
    if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev;
  }
});

test('public page-event tracking requires a type', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/track/page-event', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});

test('DEV: leak status update requires a status', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'PATCH', '/leaks/x1', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /status/);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: leak routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/funnels/j1/leaks', { tenant: 'attacker' });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('unknown routes return 404 (dev mode, tenant present)', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/nope', { tenant: 't1' });
    assert.equal(r.status, 404);
  } finally {
    server.close();
    delete process.env.FNNLR_DEV_MODE;
  }
});
