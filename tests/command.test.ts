import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { classifyCommand, RESULT_TYPE, INTENTS } from '../modules/command/src/intents.js';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { CommandBrain } from '../packages/ai-core/src/brains/command.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';

/**
 * Sprint 12 — AI Command Bar. The classifier (the safety-critical part) is pure
 * and tested here: closed intent set, no hallucinated action, clarify when
 * uncertain. DB-backed command execution runs in the live suite.
 */

test('classifier maps common Arabic commands to the right intent', () => {
  assert.equal(classifyCommand('صلّح أكبر تسريب عندي').intent, 'explain_biggest_leak');
  assert.equal(classifyCommand('ليه رتبت القمع كده؟').intent, 'explain_funnel_reasoning');
  assert.equal(classifyCommand('اعرض playbook الصفحة').intent, 'explain_playbook');
  assert.equal(classifyCommand('إيه اللي اتعلمناه عن الدفع؟').intent, 'what_learned_payment');
  assert.equal(classifyCommand('هات العملاء المنتظرين الدفع').intent, 'find_waiting_payment_leads');
  assert.equal(classifyCommand('حسّن العرض ده').intent, 'improve_offer');
  assert.equal(classifyCommand('اعمل تقرير للفريق').intent, 'create_team_report');
  assert.equal(classifyCommand('اكتب متابعة ناعمة للعملاء اللي سكتوا').intent, 'create_followup_message');
  assert.equal(classifyCommand('اختصر صفحة الهبوط').intent, 'shorten_page');
  assert.equal(classifyCommand('اكتب رد على اعتراض السعر').intent, 'respond_to_objection');
});

test('classifier returns clarify (never hallucinates) for unknown commands', () => {
  const r = classifyCommand('إيه رأيك في الطقس النهاردة؟');
  assert.equal(r.intent, 'clarify');
  assert.equal(r.confidence, 'low');
});

test('every classified intent is in the closed intent set', () => {
  for (const cmd of ['حسّن العرض', 'افتح العملاء', 'صلّح أكبر تسريب', 'تقرير الأسبوع', 'حاجة عشوائية']) {
    assert.ok(INTENTS.includes(classifyCommand(cmd).intent));
  }
});

test('result-type mapping: navigation is direct, offer edit needs apply, bulk needs confirm', () => {
  assert.equal(RESULT_TYPE.open_leads, 'navigation');
  assert.equal(RESULT_TYPE.find_waiting_payment_leads, 'navigation');
  assert.equal(RESULT_TYPE.improve_offer, 'update');           // requires apply
  assert.equal(RESULT_TYPE.create_tasks_for_leads, 'bulk');    // requires confirm
  assert.equal(RESULT_TYPE.mark_leak_fixing, 'status');        // requires confirm
  assert.equal(RESULT_TYPE.draft_whatsapp_reply, 'draft');     // preview only
  assert.equal(RESULT_TYPE.explain_biggest_leak, 'informational');
});

test('CommandBrain parses valid LLM JSON within the closed set', async () => {
  const gw = new AIGateway(mockLLM(() => JSON.stringify({ intent: 'improve_offer', confidence: 'high', explanation: 'x', safetyNotes: 'y' })));
  const { output, degraded } = await gw.run(CommandBrain, { text: 'حسّن العرض', context: {} }, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.intent, 'improve_offer');
});

test('CommandBrain rejects an out-of-set intent and falls back deterministically', async () => {
  // LLM returns an invalid intent → parse throws → gateway uses fallback (deterministic)
  const gw = new AIGateway(mockLLM(() => JSON.stringify({ intent: 'delete_everything', confidence: 'high' })));
  const { output, degraded } = await gw.run(CommandBrain, { text: 'صلّح أكبر تسريب', context: {} }, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.equal(output.intent, 'explain_biggest_leak');
});

test('CommandBrain fallback works with no LLM', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(CommandBrain, { text: 'هات العملاء المنتظرين الدفع', context: {} }, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.equal(output.intent, 'find_waiting_payment_leads');
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

test('DEV: command requires text', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/command', { tenant: 't1', body: { funnelId: 'j1' } });
    assert.equal(r.status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: command route rejects header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/command', { tenant: 'attacker', body: { text: 'حسّن العرض' } });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
