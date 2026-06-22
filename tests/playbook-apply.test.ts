import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { diffPlaybook, planRisk, type CurrentState, type PlaybookForApply } from '../modules/playbooks/src/apply-diff.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 21 — Playbook Application Engine. The current-vs-recommended diff is
 * pure and tested here: before/after, confidence flagging, additive-not-
 * destructive. DB-backed apply (step-by-step, partial failure) runs live.
 */

function pb(over: Partial<PlaybookForApply> = {}): PlaybookForApply {
  return { playbookType: 'offer', confidence: 'high', limited: false, adjustments: ['x'], note: 'n', ...over };
}

test('offer diff proposes additive guarantee when missing, with before/after', () => {
  const state: CurrentState = { offer: { cta: 'كلمنا', guarantee: '', objections: [], paymentPlan: '' } };
  const steps = diffPlaybook(pb({ playbookType: 'offer' }), state);
  const g = steps.find((s) => s.changeType === 'add_guarantee');
  assert.ok(g);
  assert.equal((g!.before as any).guarantee, '');
  assert.ok((g!.after as any).guarantee.length > 0);
  assert.equal(g!.requiresConfirmation, true);     // never silent
});

test('offer diff does NOT touch a guarantee that already exists (no overwrite)', () => {
  const state: CurrentState = { offer: { guarantee: 'ضمان عندي', paymentPlan: 'دفعتين' } };
  const steps = diffPlaybook(pb({ playbookType: 'offer' }), state);
  assert.equal(steps.find((s) => s.changeType === 'add_guarantee'), undefined);
  assert.equal(steps.find((s) => s.changeType === 'add_payment_plan'), undefined);
});

test('low-confidence playbook flags every step as low_confidence with an honest note', () => {
  const state: CurrentState = { offer: { guarantee: '', paymentPlan: '' } };
  const steps = diffPlaybook(pb({ playbookType: 'offer', confidence: 'low', limited: true }), state);
  assert.ok(steps.length > 0);
  assert.ok(steps.every((s) => s.lowConfidence === true));
  assert.ok(steps[0].explanation.includes('محدودة'));
});

test('page diff moves WhatsApp CTA before pricing when it sits after', () => {
  const state: CurrentState = { pageSections: [
    { id: 'a', type: 'hero', position: 0 }, { id: 'b', type: 'pricing', position: 1 }, { id: 'c', type: 'cta_whatsapp', position: 2 },
  ] };
  const steps = diffPlaybook(pb({ playbookType: 'page' }), state);
  const reorder = steps.find((s) => s.changeType === 'reorder_sections');
  assert.ok(reorder);
  const ids = (reorder!.after as any).orderedIds;
  assert.ok(ids.indexOf('c') < ids.indexOf('b'));   // cta now before pricing
});

test('page diff adds proof + faq sections when missing (additive)', () => {
  const state: CurrentState = { pageSections: [{ id: 'a', type: 'hero', position: 0 }, { id: 'b', type: 'cta_whatsapp', position: 1 }] };
  const steps = diffPlaybook(pb({ playbookType: 'page' }), state);
  assert.ok(steps.some((s) => s.changeType === 'add_proof_section'));
  assert.ok(steps.some((s) => s.changeType === 'add_faq_section'));
});

test('whatsapp diff adds payment + proof reminder templates when missing', () => {
  const state: CurrentState = { whatsappTemplates: [{ id: 'a', stepType: 'first_reply' }] };
  const steps = diffPlaybook(pb({ playbookType: 'whatsapp' }), state);
  const adds = steps.filter((s) => s.changeType === 'add_template').map((s) => (s.after as any).addTemplate);
  assert.ok(adds.includes('payment_reminder'));
  assert.ok(adds.includes('proof_reminder'));
});

test('payment diff reprioritizes instapay when present but not first', () => {
  const state: CurrentState = { paymentMethods: [
    { id: 'a', method: 'bank_transfer', instructions: 'حوّل على الحساب' }, { id: 'b', method: 'instapay', instructions: '' },
  ] };
  const steps = diffPlaybook(pb({ playbookType: 'payment' }), state);
  assert.ok(steps.some((s) => s.changeType === 'reprioritize_methods'));
});

test('funnel diff adds a proof-reminder stage when absent', () => {
  const state: CurrentState = { funnelStages: [
    { id: 'a', name: 'صفحة الهبوط', trackingRequirement: 'page_view' }, { id: 'b', name: 'واتساب', trackingRequirement: 'message_received' },
  ] };
  const steps = diffPlaybook(pb({ playbookType: 'funnel' }), state);
  assert.ok(steps.some((s) => s.changeType === 'add_stage'));
});

test('reorder/reprioritize raise plan risk to medium', () => {
  const state: CurrentState = { pageSections: [
    { id: 'a', type: 'pricing', position: 0 }, { id: 'b', type: 'cta_whatsapp', position: 1 },
  ] };
  const steps = diffPlaybook(pb({ playbookType: 'page' }), state);
  assert.equal(planRisk(steps), 'medium');
});

test('no changes → empty diff (plan only created when it adds value)', () => {
  const state: CurrentState = { offer: { guarantee: 'موجود', paymentPlan: 'موجود' } };
  assert.deepEqual(diffPlaybook(pb({ playbookType: 'offer' }), state), []);
});

test('command classifier routes playbook application intents', () => {
  assert.equal(classifyCommand('طبّق أفضل playbook على القمع').intent, 'apply_best_playbook');
  assert.equal(classifyCommand('طبّق playbook الصفحة').intent, 'apply_page_playbook');
  assert.equal(classifyCommand('طبّق playbook الدفع').intent, 'apply_payment_playbook');
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

test('SECURITY: application routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/funnels/j1/playbook-application/all', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/playbook-applications/p1/apply', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/playbook-applications/p1/approve', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
