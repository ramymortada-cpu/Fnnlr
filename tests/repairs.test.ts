import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { planRepair, type LeakForPlan } from '../modules/repairs/src/planner.js';

/**
 * Sprint 17 — Autonomous-but-Approved Repairs. The planner (evidence → plan →
 * steps) is pure and tested here. The execution engine (apply step-by-step,
 * before/after, partial-failure) runs DB-backed in the live suite.
 */

function leak(over: Partial<LeakForPlan> = {}): LeakForPlan {
  return { code: 'payment.waiting_stuck', lane: 'payment', title: 'انتظار دفع طويل', explanation: 'عملاء كتير واقفين عند الدفع', evidence: { waiting: 4 }, ...over };
}

test('payment recovery plan is built from evidence with safe steps', () => {
  const plan = planRepair(leak());
  assert.ok(plan);
  assert.equal(plan!.type, 'payment_recovery');
  const types = plan!.steps.map((s) => s.stepType);
  assert.ok(types.includes('draft_whatsapp'));     // draft, never send
  assert.ok(types.includes('create_task'));        // requires confirmation
  assert.ok(types.includes('mark_leak_fixing'));
  // the draft step never auto-sends
  const draft = plan!.steps.find((s) => s.stepType === 'draft_whatsapp')!;
  assert.equal(draft.requiresConfirmation, false); // drafting is safe; sending is manual
});

test('WhatsApp first-reply plan is built from a whatsapp leak', () => {
  const plan = planRepair(leak({ code: 'whatsapp.no_contact', lane: 'whatsapp', evidence: { clicked: 3 } }));
  assert.equal(plan!.type, 'whatsapp_first_reply');
  assert.equal(plan!.affectedFilter, 'clicked_not_contacted');
  assert.ok(plan!.steps.some((s) => s.stepType === 'draft_whatsapp'));
});

test('page CTA plan proposes a section update requiring confirmation', () => {
  const plan = planRepair(leak({ code: 'page.low_cta', lane: 'page', evidence: { views: 80, ctaClicks: 2 } }));
  assert.equal(plan!.type, 'page_cta_fix');
  const sec = plan!.steps.find((s) => s.stepType === 'update_page_section')!;
  assert.ok(sec);
  assert.equal(sec.requiresConfirmation, true);   // page edits require approval
});

test('access delivery plan for confirmed-not-delivered is medium risk', () => {
  const plan = planRepair(leak({ code: 'payment.confirmed_not_delivered', lane: 'payment', evidence: { count: 2 } }));
  assert.equal(plan!.type, 'access_delivery_fix');
  assert.equal(plan!.riskLevel, 'medium');
});

test('NO repair without evidence (never fabricates a plan)', () => {
  assert.equal(planRepair(leak({ evidence: {} })), null);
  assert.equal(planRepair(leak({ evidence: undefined as any })), null);
});

test('every planned mutation step requires confirmation; navigation does not', () => {
  const plan = planRepair(leak({ code: 'followup.overdue_tasks', lane: 'followup', evidence: { overdue: 5 } }))!;
  for (const s of plan.steps) {
    if (s.stepType === 'open_filtered_view') assert.equal(s.requiresConfirmation, false);
    if (s.stepType === 'create_task') assert.equal(s.requiresConfirmation, true);
  }
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) },
  });
  return { status: res.status };
}

test('SECURITY: repair routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/funnels/j1/repairs/biggest', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/repairs/r1/apply', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/repairs/r1/approve', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
