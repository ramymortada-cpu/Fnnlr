import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { validateCustomerConfig, safeConfigEcho } from '../modules/customer-zero/src/config.js';

/**
 * Sprint 38 — Customer Zero deployment pack. Config validation + safe echo +
 * snapshot protection. The idempotent setup + live smoke + acceptance run on
 * real Postgres in the live-DB suite.
 */

const base = { workspaceName: 'Acme', ownerEmail: 'owner@acme.example', business: { name: 'Acme' }, payment: { method: 'instapay' }, publicAppUrl: 'https://acme.app' };

test('config validation fails when business name is missing', () => {
  const v = validateCustomerConfig({ workspaceName: 'X', ownerEmail: 'a@b.com', business: { name: '' } } as any);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => i.field === 'business.name' && i.level === 'fail'));
});

test('config validation fails when public URL is missing in production', () => {
  const v = validateCustomerConfig({ workspaceName: 'X', ownerEmail: 'a@b.com', business: { name: 'X' }, payment: { method: 'instapay' } } as any, { production: true });
  assert.ok(v.issues.some((i) => i.field === 'publicAppUrl' && i.level === 'fail'));
});

test('config validation: missing payment blocks activation (fail in prod, warn in dev)', () => {
  const prod = validateCustomerConfig({ ...base, payment: undefined } as any, { production: true });
  assert.ok(prod.issues.some((i) => i.field === 'payment' && i.level === 'fail'));
  const dev = validateCustomerConfig({ ...base, payment: undefined } as any, { production: false });
  assert.ok(dev.issues.some((i) => i.field === 'payment' && i.level === 'warn'));
});

test('config validation rejects secret-looking fields', () => {
  const v = validateCustomerConfig({ ...base, apiKey: 'sk_live_x' } as any);
  assert.equal(v.ok, false);
  assert.ok(v.issues.some((i) => /secret/i.test(i.message)));
});

test('invalid WhatsApp number is rejected', () => {
  const v = validateCustomerConfig({ ...base, whatsappNumber: 'not-a-number' } as any);
  assert.ok(v.issues.some((i) => i.field === 'whatsappNumber' && i.level === 'fail'));
});

test('a complete config passes', () => {
  const v = validateCustomerConfig({ ...base, whatsappNumber: '+201000000000' } as any, { production: true });
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

test('safe config echo never includes secret-ish data and masks the WhatsApp number', () => {
  const echo = safeConfigEcho({ ...base, whatsappNumber: '+201234567890' } as any);
  const s = JSON.stringify(echo);
  assert.ok(!s.includes('+201234567890'), 'full number not echoed');
  assert.ok(s.includes('7890'), 'only last digits shown');
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('customer-snapshot endpoint is admin-only and rejects header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/admin/customer-snapshot?funnelId=f1`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
