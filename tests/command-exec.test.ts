import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { planAction } from '../modules/command/src/executor.js';
import { RESULT_TYPE } from '../modules/command/src/intents.js';
import { failingLLM } from '../packages/ai-core/src/llm.js';

/**
 * Sprint 14 — Execution Layer. The planner produces typed, auditable actions;
 * destructive ones require confirmation; drafts never send. DB-backed apply
 * runs in the live suite — here we assert the planning + safety invariants that
 * don't need a database (navigation/clarify/informational paths).
 */

test('navigation intents plan a direct, no-confirmation action', async () => {
  const p = await planAction('t', 'open_leads', { funnelId: 'j1' }, failingLLM);
  assert.equal(p.actionKind, 'navigation');
  assert.equal(p.requiresConfirmation, false);
  assert.equal(p.navigate?.tab, 'leads');
});

test('find-waiting-payment plans a filtered navigation (no write)', async () => {
  const p = await planAction('t', 'find_waiting_payment_leads', { funnelId: 'j1' }, failingLLM);
  assert.equal(p.actionKind, 'navigation');
  assert.equal(p.requiresConfirmation, false);
  assert.equal(p.navigate?.leadFilter, 'waiting_payment');
});

test('clarify intent is informational with guidance, never an action', async () => {
  const p = await planAction('t', 'clarify', {}, failingLLM);
  assert.equal(p.actionKind, 'informational');
  assert.equal(p.requiresConfirmation, false);
  assert.ok((p.preview ?? '').length > 0);
});

test('WhatsApp draft without a lead plans navigation, never a send', async () => {
  const p = await planAction('t', 'draft_whatsapp_reply', {}, failingLLM);
  // no lead → guide to leads; crucially never an auto-send action kind
  assert.notEqual(p.actionKind, 'template_update');
  assert.equal(p.requiresConfirmation, false);
  assert.ok(p.actionKind === 'navigation' || p.actionKind === 'draft_message');
});

test('RESULT_TYPE invariants: destructive/data-changing intents require approval', () => {
  // updates
  for (const i of ['improve_offer', 'make_offer_premium', 'rewrite_page_section', 'improve_page_cta', 'shorten_page'] as const) {
    assert.equal(RESULT_TYPE[i], 'update', `${i} must be update`);
  }
  // bulk + status
  assert.equal(RESULT_TYPE.create_tasks_for_leads, 'bulk');
  assert.equal(RESULT_TYPE.mark_leak_fixing, 'status');
  // navigation + informational are direct
  assert.equal(RESULT_TYPE.open_leads, 'navigation');
  assert.equal(RESULT_TYPE.explain_biggest_leak, 'informational');
  // drafts preview only
  assert.equal(RESULT_TYPE.draft_whatsapp_reply, 'draft');
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

test('apply and discard routes exist and require session tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/command/abc/apply', { tenant: 'attacker' })).status, 401);
    assert.equal((await call(port, 'POST', '/command/abc/discard', { tenant: 'attacker' })).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
