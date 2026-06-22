import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { leadMatchesFilter, filterWhereClause, PIPELINE_STAGES, STAGE_LABEL_AR } from '../modules/pipeline/src/pipeline.js';

/**
 * Sprint 7 — funnel CRM. Pure pipeline rules are unit-tested here; DB-backed
 * stage/note/task/payment mutations run in the live suite. API validation and
 * tenant protection are asserted without a DB.
 */

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

test('pipeline has the 12 funnel stages with Arabic labels', () => {
  assert.equal(PIPELINE_STAGES.length, 12);
  assert.ok(PIPELINE_STAGES.includes('waiting_payment'));
  assert.equal(STAGE_LABEL_AR.waiting_payment, 'بانتظار الدفع');
});

test('needs_followup filter matches stage and due date', () => {
  assert.equal(leadMatchesFilter({ stage: 'needs_followup' }, 'needs_followup'), true);
  assert.equal(leadMatchesFilter({ stage: 'new', followup_due_at: '2026-07-01' }, 'needs_followup'), true);
  assert.equal(leadMatchesFilter({ stage: 'new' }, 'needs_followup'), false);
});

test('waiting_payment filter matches stage or payment status', () => {
  assert.equal(leadMatchesFilter({ stage: 'waiting_payment' }, 'waiting_payment'), true);
  assert.equal(leadMatchesFilter({ stage: 'new', payment_status: 'waiting_payment' }, 'waiting_payment'), true);
  assert.equal(leadMatchesFilter({ stage: 'new' }, 'waiting_payment'), false);
});

test('high_intent filter uses risk score threshold', () => {
  assert.equal(leadMatchesFilter({ risk_score: 0.8 }, 'high_intent'), true);
  assert.equal(leadMatchesFilter({ risk_score: 0.3 }, 'high_intent'), false);
  assert.equal(leadMatchesFilter({ intent: 'high' }, 'high_intent'), true);
});

test('clicked_not_contacted isolates the whatsapp_clicked stage', () => {
  assert.equal(leadMatchesFilter({ stage: 'whatsapp_clicked' }, 'clicked_not_contacted'), true);
  assert.equal(leadMatchesFilter({ stage: 'contacted' }, 'clicked_not_contacted'), false);
});

test('filterWhereClause builds safe SQL fragments (no params injected)', () => {
  assert.match(filterWhereClause('paid').sql, /stage IN \('paid','access_delivered'\)/);
  assert.equal(filterWhereClause('all').sql, '');
});

// ---- API validation (dev mode) ----
test('DEV: change stage requires a stage', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/leads/l1/stage', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
    assert.match(r.json.error, /stage/);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('DEV: add note requires a body; task requires a title; payment-state requires state', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/leads/l1/notes', { tenant: 't1', body: {} })).status, 422);
    assert.equal((await call(port, 'POST', '/leads/l1/tasks', { tenant: 't1', body: {} })).status, 422);
    assert.equal((await call(port, 'POST', '/leads/l1/payment-state', { tenant: 't1', body: {} })).status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: lead routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/leads/l1', { tenant: 'attacker' });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
