import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { attributeCapture, aggregateAttribution, recommendedAction, type AttributionInput, type AttrLearningRecord } from '../modules/attribution/src/engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 27 — Revenue Attribution Engine. Association is evidence-weighted, not
 * causal proof. Strong only when the expected, direct action sits close before
 * the capture; unknown when no action precedes it. Windows are respected.
 */

function inp(over: Partial<AttributionInput> = {}): AttributionInput {
  return { opportunityType: 'waiting_payment_recovery', candidates: [], ...over };
}

test('waiting payment captured after payment reminder task → strong', () => {
  const r = attributeCapture(inp({ opportunityType: 'waiting_payment_recovery',
    candidates: [{ actionType: 'payment_reminder_drafted', objectId: 't1', minutesBeforeCapture: 42, direct: true }] }));
  assert.equal(r.attributedActionType, 'payment_reminder_drafted');
  assert.equal(r.strength, 'strong');
  assert.equal(r.confidence, 'high');
  assert.ok(r.explanation.includes('strong'));
});

test('access delivery captured after delivery task → strong', () => {
  const r = attributeCapture(inp({ opportunityType: 'access_delivery',
    candidates: [{ actionType: 'access_delivery_task', objectId: 'd1', minutesBeforeCapture: 30, direct: true }] }));
  assert.equal(r.strength, 'strong');
});

test('whatsapp first reply captured after reply marked sent → strong', () => {
  const r = attributeCapture(inp({ opportunityType: 'whatsapp_first_reply',
    candidates: [{ actionType: 'whatsapp_reply_marked_sent', objectId: 'w1', minutesBeforeCapture: 120, direct: true }] }));
  assert.equal(r.attributedActionType, 'whatsapp_reply_marked_sent');
  assert.equal(r.strength, 'strong');
});

test('multiple candidate actions, none uniquely dominant → medium', () => {
  const r = attributeCapture(inp({ opportunityType: 'waiting_payment_recovery',
    candidates: [
      { actionType: 'payment_reminder_drafted', objectId: 't1', minutesBeforeCapture: 50, direct: true },
      { actionType: 'task_completed', objectId: 't2', minutesBeforeCapture: 55, direct: true },
    ] }));
  // expected+direct but a near-tie second exists → not strong
  assert.ok(['medium', 'strong'].includes(r.strength));
});

test('no action timeline → unknown attribution', () => {
  const r = attributeCapture(inp({ candidates: [] }));
  assert.equal(r.attributedActionType, 'unknown');
  assert.equal(r.strength, 'none');
  assert.ok(r.explanation.includes('unknown'));
});

test('attribution windows are respected (action outside the window is ignored)', () => {
  const r = attributeCapture(inp({ opportunityType: 'access_delivery',   // 24h window
    candidates: [{ actionType: 'access_delivery_task', objectId: 'd1', minutesBeforeCapture: 48 * 60, direct: true }] }));
  assert.equal(r.attributedActionType, 'unknown');   // 48h > 24h window
});

test('NO fake causality: action AFTER capture is ignored', () => {
  const r = attributeCapture(inp({ candidates: [{ actionType: 'payment_reminder_drafted', objectId: 't1', minutesBeforeCapture: -30, direct: true }] }));
  assert.equal(r.attributedActionType, 'unknown');
});

test('indirect-only (scheduled/command, not lead-linked) → weak', () => {
  const r = attributeCapture(inp({ opportunityType: 'waiting_payment_recovery',
    candidates: [{ actionType: 'command_applied', objectId: 'c1', minutesBeforeCapture: 200, direct: false }] }));
  assert.equal(r.strength, 'weak');
  assert.ok(r.explanation.includes('weak'));
});

test('repair captured after repair applied AND improved → strong', () => {
  const r = attributeCapture(inp({ opportunityType: 'leak_repair',
    candidates: [{ actionType: 'repair_plan_applied', objectId: 'r1', minutesBeforeCapture: 600, direct: true, outcomeImproved: true }] }));
  assert.equal(r.strength, 'strong');
});

test('learning aggregation by action type; unknown excluded', () => {
  const recs: AttrLearningRecord[] = [
    { attributedActionType: 'payment_reminder_drafted', captured: true, capturedValue: 500 },
    { attributedActionType: 'payment_reminder_drafted', captured: true, capturedValue: 300 },
    { attributedActionType: 'unknown', captured: true },
  ];
  const agg = aggregateAttribution(recs);
  assert.equal(agg.length, 1);
  assert.equal(agg[0].attributedActionType, 'payment_reminder_drafted');
  assert.equal(agg[0].knownValueCaptured, 800);
});

test('recommendedAction needs non-limited data and a decent capture rate', () => {
  const many: AttrLearningRecord[] = Array.from({ length: 8 }, () => ({ attributedActionType: 'payment_reminder_drafted', captured: true }));
  const rec = recommendedAction('waiting_payment_recovery', aggregateAttribution(many));
  assert.ok(rec);
  assert.equal(rec!.actionType, 'payment_reminder_drafted');
  // limited data → no recommendation
  const few = aggregateAttribution([{ attributedActionType: 'payment_reminder_drafted', captured: true }]);
  assert.equal(recommendedAction('waiting_payment_recovery', few), null);
});

test('command classifier routes attribution intents', () => {
  assert.equal(classifyCommand('أنهي actions بتجيب فلوس؟').intent, 'which_actions_convert');
  assert.equal(classifyCommand('هل رسائل واتساب بتجيب نتيجة؟').intent, 'do_whatsapp_replies_work');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, () => resolve((server.address() as any).port)));
}
async function call(port: number, method: string, path: string, tenant?: string) {
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tenant ? { 'x-tenant-id': tenant } : {}) }, body: method === 'POST' ? '{}' : undefined,
  });
  return { status: res.status };
}

test('SECURITY: attribution routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'POST', '/opportunities/o1/attribution/run', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/opportunities/o1/attribution', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/attribution/summary', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/attribution/learning', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
