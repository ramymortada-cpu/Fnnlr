import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { backoffMs } from '../modules/realtime/src/outbound.js';

/**
 * Sprint 35 — scaling. Pure checks for backoff + batch validation + ops access.
 * DB-backed behavior (lease dedup, stuck retry, idempotent events, outbound
 * retry/abandon, ops counts) lives in the live-DB suite.
 */

test('exponential backoff grows and caps at one hour', () => {
  assert.equal(backoffMs(1), 30_000);
  assert.equal(backoffMs(2), 60_000);
  assert.equal(backoffMs(3), 120_000);
  assert.ok(backoffMs(10) <= 3_600_000, 'capped at 1h');
  assert.equal(backoffMs(20), 3_600_000, 'stays capped');
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('batch tracking rejects an oversized batch and a non-array body', async () => {
  const server = createApiServer(); const port = await listen(server);
  try {
    const noArr = await fetch(`http://localhost:${port}/track/page-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: 'nope' }) });
    assert.equal(noArr.status, 422);
    const huge = await fetch(`http://localhost:${port}/track/page-events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events: Array.from({ length: 600 }, () => ({ type: 'page_view' })), slug: 'x' }) });
    assert.equal(huge.status, 413);
  } finally { server.close(); }
});

test('ops endpoints reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/ops/status`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('global job kill-switch returns 503 on cron', async () => {
  const prevJobs = process.env.FNNLR_DISABLE_JOBS; const prevSecret = process.env.FNNLR_CRON_SECRET;
  process.env.FNNLR_DISABLE_JOBS = 'true'; process.env.FNNLR_CRON_SECRET = 'sek';
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/internal/cron/daily-refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-cron-secret': 'sek' }, body: JSON.stringify({ tenantId: 't' }) });
    assert.equal(res.status, 503);
  } finally {
    server.close();
    if (prevJobs === undefined) delete process.env.FNNLR_DISABLE_JOBS; else process.env.FNNLR_DISABLE_JOBS = prevJobs;
    if (prevSecret === undefined) delete process.env.FNNLR_CRON_SECRET; else process.env.FNNLR_CRON_SECRET = prevSecret;
  }
});
