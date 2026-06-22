import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { RateLimiter } from '../modules/security/src/rate-limit.js';
import { SECURITY_HEADERS, clientIp } from '../modules/security/src/headers.js';

/**
 * Sprint 34 — Security hardening. Rate limits, payload limits, webhook
 * fail-closed, security headers, and command-abuse guards. The DB-touching
 * checks (cross-tenant mutation, apply-twice on real rows) live in the live-DB
 * suite; here we prove the gates that reject BEFORE any tenant data is touched.
 */

// ---- pure rate limiter ----
test('rate limiter blocks after max and unblocks after the lockout window', () => {
  let now = 1000;
  const rl = new RateLimiter(() => now);
  const rule = { windowMs: 1000, max: 3, lockoutMs: 5000 };
  assert.equal(rl.check('k', rule).allowed, true);
  assert.equal(rl.check('k', rule).allowed, true);
  assert.equal(rl.check('k', rule).allowed, true);
  assert.equal(rl.check('k', rule).allowed, false, '4th is blocked');
  now += 6000;
  assert.equal(rl.check('k', rule).allowed, true, 'unblocked after lockout');
});

test('rate limiter reset clears the counter (success path)', () => {
  let now = 0; const rl = new RateLimiter(() => now);
  const rule = { windowMs: 1000, max: 2 };
  rl.check('k', rule); rl.check('k', rule);
  assert.equal(rl.check('k', rule).allowed, false);
  rl.reset('k');
  assert.equal(rl.check('k', rule).allowed, true);
});

test('clientIp takes the first x-forwarded-for hop then falls back', () => {
  assert.equal(clientIp({ headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, socket: {} } as any), '1.2.3.4');
  assert.equal(clientIp({ headers: {}, socket: { remoteAddress: '9.9.9.9' } } as any), '9.9.9.9');
});

// ---- API-level ----
function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('login is rate-limited and the error never reveals whether the email exists', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    let last: any;
    for (let i = 0; i < 12; i++) {
      const res = await fetch(`http://localhost:${port}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.7' }, body: JSON.stringify({ email: 'who@x.com', password: 'wrong' }) });
      last = res;
    }
    assert.equal(last.status, 429, 'eventually rate-limited');
    const body = await last.json();
    assert.equal(body.error, 'invalid credentials', 'generic message — no enumeration');
  } finally { server.close(); }
});

test('responses carry security headers', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    // a route that rejects before any DB access (invalid event type → 422)
    const res = await fetch(`http://localhost:${port}/track/page-event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'bad' }) });
    for (const h of Object.keys(SECURITY_HEADERS)) {
      assert.ok(res.headers.get(h.toLowerCase()) !== null, `${h} present`);
    }
  } finally { server.close(); }
});

test('oversized auth payload is rejected with 413', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const big = 'x'.repeat(10_000); // > MAX_BODY.auth (4096)
    const res = await fetch(`http://localhost:${port}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.50' }, body: JSON.stringify({ email: 'a@b.com', password: big }) });
    assert.equal(res.status, 413);
  } finally { server.close(); }
});

test('tracking rejects an invalid event type', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/track/page-event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'definitely_not_allowed', slug: 'x' }) });
    assert.equal(res.status, 422);
  } finally { server.close(); }
});

test('unknown payment provider is rejected (fail-closed)', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/webhooks/payments/totally-fake/conn1`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    assert.equal(res.status, 400);
  } finally { server.close(); }
});

test('public redirect is rate-limited under brute force', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    let limited = false;
    for (let i = 0; i < 70; i++) {
      const res = await fetch(`http://localhost:${port}/r/guess${i}`, { headers: { 'x-forwarded-for': '198.51.100.9' }, redirect: 'manual' });
      if (res.status === 429) { limited = true; break; }
    }
    assert.equal(limited, true, 'brute-forcing codes gets rate-limited');
  } finally { server.close(); }
});
