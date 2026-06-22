import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { encryptSecret, decryptSecret, maskSecret, maskCredentials, signPayload, verifySignature } from '../modules/integrations/src/secrets.js';
import { paymentAdapter, providerMeta, PROVIDERS } from '../modules/integrations/src/providers.js';

/**
 * Sprint 15 — Integrations Foundation. Secrets, adapters, and webhook security
 * are unit-tested here. DB-backed connection CRUD runs in the live suite.
 */

// ---- secrets ----
test('secrets: encrypt → decrypt round-trips, and mask never reveals the full value', () => {
  const enc = encryptSecret('EAABsupersecrettoken3Zd');
  assert.notEqual(enc, 'EAABsupersecrettoken3Zd');       // stored value is not the plaintext
  assert.equal(decryptSecret(enc), 'EAABsupersecrettoken3Zd');
  const masked = maskSecret(enc);
  assert.ok(!masked.includes('supersecret'));
  assert.ok(masked.includes('••'));
});

test('secrets: maskCredentials masks every field', () => {
  const stored = { access_token: encryptSecret('tok_1234567890'), api_key: encryptSecret('key_abcdef?gh') };
  const masked = maskCredentials(stored);
  for (const v of Object.values(masked)) assert.ok(!v.includes('1234567890') && !v.includes('abcdefgh'));
});

test('secrets: HMAC sign + verify (timing-safe), rejects tampering', () => {
  const sig = signPayload('{"a":1}', 's3cr3t');
  assert.ok(verifySignature('{"a":1}', 's3cr3t', sig));
  assert.ok(!verifySignature('{"a":2}', 's3cr3t', sig));
  assert.ok(!verifySignature('{"a":1}', 's3cr3t', ''));
});

// ---- payment adapters ----
test('adapters: every payment provider has an adapter and normalizes statuses', () => {
  const tap = paymentAdapter('tap');
  assert.equal(tap.normalize({ status: 'CAPTURED', reference: 'lead-1', amount: 4000, id: 'ch_1' }).status, 'payment_confirmed');
  assert.equal(tap.normalize({ status: 'failed' }).status, 'payment_failed');
  assert.equal(tap.normalize({ status: 'refunded' }).status, 'payment_refunded');
  assert.equal(tap.normalize({ status: 'pending' }).status, 'payment_started');
  assert.equal(tap.normalize({ status: 'banana' }).status, 'unknown');
});

test('adapters: Paymob boolean success maps to confirmed/failed; amount_cents → units', () => {
  const paymob = paymentAdapter('paymob');
  const ok = paymob.normalize({ success: true, amount_cents: 400000, merchant_order_id: 'lead-9', id: 99 });
  assert.equal(ok.status, 'payment_confirmed');
  assert.equal(ok.amount, 4000);
  assert.equal(ok.reference, 'lead-9');
  assert.equal(paymob.normalize({ success: false }).status, 'payment_failed');
});

test('adapters: verify accepts when no secret (dev) and checks HMAC when set', () => {
  const a = paymentAdapter('moyasar');
  assert.equal(a.verify('{}', {}, ''), true);                       // dev: no secret
  const body = '{"id":"p1"}';
  const sig = signPayload(body, 'whsec');
  assert.equal(a.verify(body, { 'x-signature': sig }, 'whsec'), true);
  assert.equal(a.verify(body, { 'x-signature': 'bad' }, 'whsec'), false);
});

test('providers: registry covers all required Sprint 15 providers', () => {
  for (const id of ['whatsapp_cloud_api', 'whatsapp_bsp_generic', 'paymob', 'fawry', 'tap', 'hyperpay', 'moyasar', 'meta_pixel', 'ga4', 'outbound_webhook', 'zapier_make_webhook']) {
    assert.ok(providerMeta(id), `missing provider ${id}`);
  }
  // every provider declares its secret fields so they get encrypted
  for (const p of PROVIDERS) assert.ok(Array.isArray(p.secretFields));
});

// ---- webhook security (API) ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, opts: { tenant?: string; body?: unknown; raw?: string } = {}) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(opts.tenant ? { 'x-tenant-id': opts.tenant } : {}) },
    body: opts.raw ?? (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  let json: any = null; try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

test('SECURITY: payment webhook does NOT trust tenant header — unknown connection → 404', async () => {
  // Even with a tenant header, an unknown connectionId must not resolve to a tenant.
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/webhooks/payments/paymob/00000000-0000-0000-0000-000000000000', {
      tenant: 'attacker-tenant', body: { success: true },
    });
    assert.equal(r.status, 404);   // resolved from connectionId (none) — header ignored
  } finally { server.close(); }
});

test('SECURITY: WhatsApp webhook POST with unknown connection → 404 (header ignored)', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/webhooks/whatsapp/00000000-0000-0000-0000-000000000000', {
      tenant: 'attacker-tenant', body: { entry: [] },
    });
    assert.equal(r.status, 404);
  } finally { server.close(); }
});

test('WhatsApp webhook GET handshake echoes hub.challenge', async () => {
  const server = createApiServer();
  const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/webhooks/whatsapp/any-id?hub.challenge=12345`);
    const txt = await res.text();
    assert.equal(res.status, 200);
    assert.equal(txt, '12345');
  } finally { server.close(); }
});

test('SECURITY: integrations CRUD rejects header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/integrations', { tenant: 'attacker' })).status, 401);
    assert.equal((await call(port, 'POST', '/integrations', { tenant: 'attacker', body: { provider: 'paymob' } })).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
