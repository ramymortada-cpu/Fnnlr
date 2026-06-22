import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { validateExecutionManifest, safeManifestEcho } from '../modules/execution/src/manifest.js';

/**
 * Sprint 40 — execution lock. Manifest validation + safe echo + admin
 * protection. The full execution acceptance (lock BLOCKED→READY, first signal,
 * decision, summary safety, idempotency) runs on real Postgres in the live-DB
 * suite.
 */

const full: any = {
  customerName: 'Acme CZ', workspaceName: 'Acme', ownerEmail: 'owner@acme.example',
  business: { name: 'Acme', market: 'eg' }, whatsappNumber: '+201000000000',
  whatsappProviderStatus: 'manual_link_only',
  payment: { method: 'instapay', instructions: 'حوّل وابعت سكرين' },
  publicAppUrl: 'https://acme.app', launchWindow: '2026-06-25 18:00', supportOwner: 'support@fnnlr.app',
};

test('a complete execution manifest passes', () => {
  const v = validateExecutionManifest(full, { production: true });
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

test('missing support owner blocks', () => {
  const v = validateExecutionManifest({ ...full, supportOwner: '' });
  assert.ok(v.issues.some((i) => i.field === 'supportOwner' && i.level === 'fail'));
});

test('missing launch window blocks', () => {
  const v = validateExecutionManifest({ ...full, launchWindow: '' });
  assert.ok(v.issues.some((i) => i.field === 'launchWindow' && i.level === 'fail'));
});

test('missing payment instructions blocks', () => {
  const v = validateExecutionManifest({ ...full, payment: { method: 'instapay' } });
  assert.ok(v.issues.some((i) => i.field === 'payment.instructions' && i.level === 'fail'));
});

test('invalid WhatsApp number blocks', () => {
  const v = validateExecutionManifest({ ...full, whatsappNumber: 'abc' });
  assert.ok(v.issues.some((i) => i.field === 'whatsappNumber' && i.level === 'fail'));
});

test('invalid whatsapp provider status blocks', () => {
  const v = validateExecutionManifest({ ...full, whatsappProviderStatus: 'nonsense' as any });
  assert.ok(v.issues.some((i) => i.field === 'whatsappProviderStatus' && i.level === 'fail'));
});

test('missing public URL blocks in production', () => {
  const v = validateExecutionManifest({ ...full, publicAppUrl: '' }, { production: true });
  assert.ok(v.issues.some((i) => i.field === 'publicAppUrl' && i.level === 'fail'));
});

test('safe manifest echo masks the WhatsApp number and carries no secrets', () => {
  const echo = safeManifestEcho({ ...full, apiKey: 'sk_live_x' } as any);
  const s = JSON.stringify(echo);
  assert.ok(!s.includes('+201000000000'), 'number masked');
  assert.ok(!s.includes('sk_live_x'), 'no secret-ish field echoed');
  assert.ok(s.includes('0000'), 'last digits shown');
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('execution admin endpoints reject a header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const a = await fetch(`http://localhost:${port}/admin/launch-check?funnelId=f1`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(a.status, 401);
    const b = await fetch(`http://localhost:${port}/admin/execution-log`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(b.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
