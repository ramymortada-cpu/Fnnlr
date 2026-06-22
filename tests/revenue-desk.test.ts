import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { buildDesk, type DeskSource } from '../modules/revenue-desk/src/aggregator.js';
import { TYPE_META, legacyCodeToType } from '../modules/revenue-desk/src/taxonomy.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 33 — Revenue Desk coherence. The aggregator gives every signal a real,
 * distinct type (no more catch-all resolve_leak), dedupes overlapping signals
 * into one item, and ranks with an explained score.
 */

test('taxonomy: every desk type has a label, icon, section, route, primary action', () => {
  for (const [type, meta] of Object.entries(TYPE_META)) {
    assert.ok(meta.label && meta.icon && meta.section && meta.route && meta.primaryAction, `${type} fully described`);
  }
});

test('legacy resolve_leak codes map to real distinct types (no collapse)', () => {
  assert.equal(legacyCodeToType('leak:123'), 'leak_detected');
  assert.equal(legacyCodeToType('repair:123'), 'repair_plan_pending_approval');
  assert.equal(legacyCodeToType('repair:123', { status: 'partially_applied' }), 'repair_plan_partially_applied');
  assert.equal(legacyCodeToType('measure_repair:123'), 'repair_outcome_due');
  assert.equal(legacyCodeToType('opportunity:123'), 'revenue_opportunity');
  assert.equal(legacyCodeToType('recommendation:123'), 'best_next_action');
  assert.equal(legacyCodeToType('playbook_app:123'), 'playbook_application_pending');
  // they are NOT all the same type
  const types = ['leak:1', 'repair:1', 'opportunity:1', 'recommendation:1', 'playbook_app:1'].map((c) => legacyCodeToType(c));
  assert.equal(new Set(types).size, 5, 'five distinct types, not one');
});

test('opportunity + its recommendation collapse into ONE desk item', () => {
  const src: DeskSource = {
    opportunities: [{ id: 'o1', opportunityType: 'waiting_payment_recovery', title: 'دفع منتظر', priorityScore: 70, urgency: 'high', estimatedValue: 500, valueCurrency: 'EGP', hasRecommendation: true, recommendationId: 'r1', recommendationTitle: 'اكتب تذكير دفع' }],
    recommendations: [{ id: 'r1', recommendationType: 'draft_payment_reminder', title: 'اكتب تذكير دفع', explanation: '', priorityScore: 70, urgency: 'high', confidence: 'medium', status: 'proposed', opportunityId: 'o1', requiresApproval: true }],
  };
  const desk = buildDesk(src);
  const oppItems = desk.items.filter((i) => i.sourceType === 'opportunity');
  const recItems = desk.items.filter((i) => i.sourceType === 'recommendation');
  assert.equal(oppItems.length, 1);
  assert.equal(recItems.length, 0, 'recommendation folded into the opportunity, not shown twice');
  assert.ok(oppItems[0].title.includes('أفضل إجراء'), 'unified title mentions the recommended action');
  assert.equal(oppItems[0].secondary?.kind, 'recommendation');
});

test('leak with a repair plan shows the repair, not the raw leak', () => {
  const src: DeskSource = {
    openLeaks: [{ id: 'k1', title: 'تسريب CTA', severity: 'high' }],
    pendingRepairs: [{ id: 'rp1', title: 'إصلاح CTA', status: 'proposed', leakId: 'k1' }],
  };
  const desk = buildDesk(src);
  assert.equal(desk.items.filter((i) => i.sourceType === 'leak').length, 0, 'raw leak suppressed');
  assert.equal(desk.items.filter((i) => i.sourceType === 'repair_plan').length, 1, 'repair shown instead');
});

test('repair outcome due appears once (measurement item), not duplicated', () => {
  const src: DeskSource = { measurableRepairs: [{ id: 'rp1', title: 'إصلاح', lastOutcome: 'awaiting_data' }] };
  const desk = buildDesk(src);
  const measure = desk.items.filter((i) => i.type === 'repair_outcome_due');
  assert.equal(measure.length, 1);
  assert.equal(measure[0].section, 'needs_measurement');
});

test('overdue task for a lead already in an opportunity is not duplicated', () => {
  const src: DeskSource = {
    opportunities: [{ id: 'o1', opportunityType: 'waiting_payment_recovery', title: 'دفع', priorityScore: 60, urgency: 'high', estimatedValue: null, valueCurrency: null, leadId: 'lead1' }],
    overdueTasks: [{ id: 't1', leadId: 'lead1', title: 'تابع', kind: 'whatsapp_followup' }],
  };
  const desk = buildDesk(src);
  assert.equal(desk.items.filter((i) => i.sourceType === 'task').length, 0, 'task deduped against the opportunity lead');
});

test('priority is explained (whyRankedHere) and severity-ordered', () => {
  const src: DeskSource = {
    opportunities: [{ id: 'o1', opportunityType: 'access_delivery', title: 'تسليم', priorityScore: 50, urgency: 'critical', estimatedValue: 300, valueCurrency: 'EGP' }],
    openLeaks: [{ id: 'k1', title: 'تسريب', severity: 'low' }],
  };
  const desk = buildDesk(src);
  assert.ok(desk.topItem);
  assert.equal(desk.topItem!.type, 'access_delivery_opportunity', 'critical opportunity ranks above a low leak');
  assert.ok(desk.topItem!.whyRankedHere.length > 0, 'explanation present');
});

test('sections are ordered and counts computed', () => {
  const src: DeskSource = {
    recommendations: [{ id: 'r1', recommendationType: 'create_task', title: 'مهمة', explanation: '', priorityScore: 80, urgency: 'high', confidence: 'high', status: 'proposed', requiresApproval: true }],
    pendingRepairs: [{ id: 'rp1', title: 'إصلاح', status: 'proposed' }],
    weeklyReportReady: true,
  };
  const desk = buildDesk(src);
  const sectionOrder = desk.sections.map((s) => s.section);
  assert.ok(sectionOrder.indexOf('waiting_approval') < sectionOrder.indexOf('reports'), 'waiting approval before reports');
  assert.equal(desk.counts.waitingApproval, 2, 'recommendation-waiting + repair-pending both in waiting approval');
});

test('command classifier routes the Revenue Desk intents', () => {
  assert.equal(classifyCommand('افتح مكتب الإيراد').intent, 'open_revenue_desk');
  assert.equal(classifyCommand('فيه حاجة واقفة؟').intent, 'whats_blocked');
});

// ---- API security ----
function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }
test('SECURITY: revenue desk routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/revenue-desk?funnelId=f1`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
