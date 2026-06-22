import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { buildActions, type ActionInputs } from '../modules/actions/src/builder.js';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { ReportBrain, type ReportInput } from '../packages/ai-core/src/brains/report.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';

/**
 * Sprint 11 — Action Center + Weekly Report. Pure action building and the
 * report fallback are unit-tested; DB-backed persistence runs in the live suite.
 */

function emptyInputs(over: Partial<ActionInputs> = {}): ActionInputs {
  return {
    leadsNeedingFollowup: [], overdueTasks: [], waitingPayment: [], proofToReview: [],
    confirmedNotDelivered: [], whatsappClickedNoContact: [], leadsNoNextAction: [],
    lostNoReason: [], openLeaks: [], ...over,
  };
}

test('no records → no actions (nothing generic)', () => {
  assert.equal(buildActions(emptyInputs()).length, 0);
});

test('builds an action from waiting payment, tied to the lead', () => {
  const a = buildActions(emptyInputs({ waitingPayment: [{ id: 'lead1', name: 'أحمد' }] }));
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'confirm_payment');
  assert.equal(a[0].leadId, 'lead1');
  assert.equal(a[0].evidence.leadId, 'lead1');
});

test('builds an action from an overdue task', () => {
  const a = buildActions(emptyInputs({ overdueTasks: [{ id: 't1', leadId: 'l1', title: 'اتصل', dueAt: '2026-01-01' }] }));
  assert.equal(a[0].type, 'follow_up_lead');
  assert.equal(a[0].evidence.taskId, 't1');
});

test('builds an action from an open leak', () => {
  const a = buildActions(emptyInputs({ openLeaks: [{ id: 'k1', title: 'تسريب دفع', severity: 'critical' }] }));
  assert.equal(a[0].type, 'resolve_leak');
  assert.equal(a[0].leakId, 'k1');
});

test('actions are ordered by priority (proof review beats lost-reason)', () => {
  const a = buildActions(emptyInputs({
    lostNoReason: [{ id: 'l9' }],
    proofToReview: [{ id: 'l1' }],
  }));
  assert.equal(a[0].type, 'review_payment_proof');
  assert.ok(a[0].priority > a[a.length - 1].priority);
});

test('ReportBrain fallback (no LLM) writes Arabic summary and does not invent numbers', async () => {
  const input: ReportInput = {
    funnelName: 'قمع النور', periodLabel: 'آخر 7 أيام', enoughData: true,
    topLeaks: [{ title: 'انتظار دفع طويل', severity: 'high', fastestFix: 'ابعت تذكير' }],
    biggestLeak: { title: 'انتظار دفع طويل', fastestFix: 'ابعت تذكير' },
    leadsNeedingAction: 4, paymentStuck: 2, whatsappClickedNoContact: 3,
    pageViews: 80, ctaClicks: 6, wins: ['عميل اتسلّم'], topActions: [{ title: 'تابع أحمد', recommendedAction: 'ابعت تذكير' }],
  };
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(ReportBrain, input, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.executiveSummary.includes('قمع النور'));
  assert.ok(output.executiveSummary.includes('4'));   // narrates given numbers
  assert.ok(output.topPriorities.length > 0);
});

test('ReportBrain fallback states clearly when data is insufficient', async () => {
  const input: ReportInput = {
    funnelName: 'قمع جديد', periodLabel: 'آخر 7 أيام', enoughData: false,
    topLeaks: [], biggestLeak: null, leadsNeedingAction: 0, paymentStuck: 0,
    whatsappClickedNoContact: 0, pageViews: 0, ctaClicks: 0, wins: [], topActions: [],
  };
  const gw = new AIGateway(failingLLM);
  const { output } = await gw.run(ReportBrain, input, { tenantId: 't' });
  assert.ok(output.executiveSummary.includes('مفيش بيانات') || output.executiveSummary.includes('كفاية'));
});

test('ReportBrain parses LLM JSON when available', async () => {
  const r = { executiveSummary: 'ملخص', topPriorities: ['أ'], narrative: 'ن', nextWeekFocus: 'ف', ownerMessage: 'م' };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(r)));
  const input: ReportInput = {
    funnelName: 'x', periodLabel: 'y', enoughData: true, topLeaks: [], biggestLeak: null,
    leadsNeedingAction: 0, paymentStuck: 0, whatsappClickedNoContact: 0, pageViews: 1, ctaClicks: 0, wins: [], topActions: [],
  };
  const { output, degraded } = await gw.run(ReportBrain, input, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.executiveSummary, 'ملخص');
});

// ---- API ----
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

test('DEV: action status update requires a status', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'PATCH', '/actions/a1', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: action center routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/funnels/j1/actions', { tenant: 'attacker' });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
