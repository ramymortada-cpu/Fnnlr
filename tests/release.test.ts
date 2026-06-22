import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { checkEnv } from '../modules/release/src/env-spec.js';
import { integrationsHealth, llmHealth, jobsHealth } from '../modules/release/src/health.js';

/**
 * Sprint 37 — release candidate. Env validation + health safety + admin
 * protection. The live smoke path (empty DB → activation) lives in the live-DB
 * suite.
 */

test('env checker fails when a required production var is missing (encryption key)', () => {
  const { checks } = checkEnv({ NODE_ENV: 'production', CONTROL_PLANE_DATABASE_URL: 'x', TENANT_DB_ADMIN_URL: 'x', TENANT_DB_HOST: 'x', FNNLR_CRON_SECRET: 'x', TENANT_CREDENTIAL_ENCRYPTION_KEY: 'x' });
  const enc = checks.find((c) => c.name === 'INTEGRATION_ENCRYPTION_KEY')!;
  assert.equal(enc.level, 'fail', 'missing integration encryption key in prod is a blocking failure');
});

test('env checker fails when cron secret is missing in production', () => {
  const { checks } = checkEnv({ NODE_ENV: 'production', CONTROL_PLANE_DATABASE_URL: 'x', TENANT_DB_ADMIN_URL: 'x', TENANT_DB_HOST: 'x', INTEGRATION_ENCRYPTION_KEY: 'x', TENANT_CREDENTIAL_ENCRYPTION_KEY: 'x' });
  assert.equal(checks.find((c) => c.name === 'FNNLR_CRON_SECRET')!.level, 'fail');
});

test('env checker FAILS dangerously when dev tenant trust is on in production', () => {
  const full = { NODE_ENV: 'production', CONTROL_PLANE_DATABASE_URL: 'x', TENANT_DB_ADMIN_URL: 'x', TENANT_DB_HOST: 'x', INTEGRATION_ENCRYPTION_KEY: 'x', TENANT_CREDENTIAL_ENCRYPTION_KEY: 'x', FNNLR_CRON_SECRET: 'x', FNNLR_DEV_MODE: 'true' };
  const { checks } = checkEnv(full);
  assert.equal(checks.find((c) => c.name === 'FNNLR_DEV_MODE')!.level, 'fail', 'dev tenant trust in prod must be flagged as dangerous');
});

test('env checker passes with all required production vars and no dev flags', () => {
  const { checks } = checkEnv({ NODE_ENV: 'production', CONTROL_PLANE_DATABASE_URL: 'x', TENANT_DB_ADMIN_URL: 'x', TENANT_DB_HOST: 'x', INTEGRATION_ENCRYPTION_KEY: 'x', TENANT_CREDENTIAL_ENCRYPTION_KEY: 'x', FNNLR_CRON_SECRET: 'x' });
  assert.equal(checks.filter((c) => c.level === 'fail').length, 0, 'no blocking failures');
});

test('integrations health fails closed in production without a key', () => {
  const prev = { n: process.env.NODE_ENV, a: process.env.INTEGRATION_ENCRYPTION_KEY, b: process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY };
  process.env.NODE_ENV = 'production'; delete process.env.INTEGRATION_ENCRYPTION_KEY; delete process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
  try { assert.equal(integrationsHealth().status, 'failed'); }
  finally {
    if (prev.n === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev.n;
    if (prev.a !== undefined) process.env.INTEGRATION_ENCRYPTION_KEY = prev.a;
    if (prev.b !== undefined) process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY = prev.b;
  }
});

test('llm health is degraded (not failed) without a key', () => {
  const prev = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
  try { assert.equal(llmHealth().status, 'degraded'); }
  finally { if (prev !== undefined) process.env.ANTHROPIC_API_KEY = prev; }
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('health output contains no secret-looking values', async () => {
  const prev = process.env.INTEGRATION_ENCRYPTION_KEY; process.env.INTEGRATION_ENCRYPTION_KEY = 'super-secret-key-value-123';
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/health/integrations`);
    const text = await res.text();
    assert.ok(!text.includes('super-secret-key-value-123'), 'health never leaks the key');
  } finally { server.close(); if (prev === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY; else process.env.INTEGRATION_ENCRYPTION_KEY = prev; }
});

test('admin support endpoints reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/admin/tenants`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('basic health is reachable without auth', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/health/api`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally { server.close(); }
});
