import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { buildPlaybook, buildAllPlaybooks, playbookToContext, type LearningInput } from '../modules/playbooks/src/builder.js';
import { FunnelArchitectBrain } from '../packages/ai-core/src/brains/funnel-architect.js';
import { PageBrain } from '../packages/ai-core/src/brains/page.js';

/**
 * Sprint 20 — Adaptive Revenue Playbooks. The playbook builder is pure and
 * tested here: aggregation, honest confidence, fallback. Brains are checked for
 * accepting playbook context. DB-backed regeneration runs in the live suite.
 */

function rec(repairType: string, successStatus: string, market: string | null = null): LearningInput {
  return { repairType, successStatus, market };
}

test('playbook aggregates learning by mapped type (payment_recovery → payment)', () => {
  const recs = [rec('payment_recovery', 'improved'), rec('payment_recovery', 'improved'), rec('payment_recovery', 'no_change'), rec('access_delivery_fix', 'improved')];
  const pb = buildPlaybook('payment', recs);
  assert.equal(pb.playbookType, 'payment');
  assert.equal(pb.sampleSize, 4);                 // all four map to 'payment'
  assert.equal(pb.evidenceSummary.improvedCount, 3);
  assert.equal(pb.evidenceSummary.decidedCount, 4);
});

test('confidence low when decided sample < 3, with fallback reason', () => {
  const pb = buildPlaybook('payment', [rec('payment_recovery', 'improved'), rec('payment_recovery', 'no_change')]);
  assert.equal(pb.confidence, 'low');
  assert.equal(pb.limited, true);
  assert.ok(pb.fallbackReason);
});

test('confidence medium (3–10) and high (>10) by decided size', () => {
  const five = Array.from({ length: 5 }, () => rec('payment_recovery', 'improved'));
  assert.equal(buildPlaybook('payment', five).confidence, 'medium');
  const twelve = Array.from({ length: 12 }, () => rec('payment_recovery', 'improved'));
  assert.equal(buildPlaybook('payment', twelve).confidence, 'high');
});

test('NO high confidence when records are mostly inconclusive/awaiting', () => {
  const recs = [
    ...Array.from({ length: 4 }, () => rec('payment_recovery', 'improved')),
    ...Array.from({ length: 9 }, () => rec('payment_recovery', 'awaiting_data')),
  ];
  const pb = buildPlaybook('payment', recs);
  assert.notEqual(pb.confidence, 'high');
});

test('builder produces a usable default playbook when data is insufficient', () => {
  const pb = buildPlaybook('page', []);
  assert.equal(pb.limited, true);
  assert.ok(pb.recommendation.adjustments.length > 0);            // default adjustments still present
  assert.ok(pb.recommendation.note.includes('محدودة') || pb.recommendation.note.includes('افتراضي'));
});

test('learned adjustment is added only with enough decided + success', () => {
  const strong = Array.from({ length: 4 }, () => rec('payment_recovery', 'improved'));
  const pb = buildPlaybook('payment', strong);
  assert.equal(pb.limited, false);
  // a learning-backed adjustment is prepended
  assert.ok(pb.recommendation.adjustments[0].includes('قماقم') || pb.recommendation.note.includes('تعديل'));
});

test('market scoping filters the learning records', () => {
  const recs = [rec('payment_recovery', 'improved', 'eg'), rec('payment_recovery', 'no_change', 'eg'), rec('payment_recovery', 'improved', 'sa')];
  const eg = buildPlaybook('payment', recs, 'eg');
  assert.equal(eg.sampleSize, 2);
  assert.equal(eg.scope, 'market');
});

test('buildAllPlaybooks returns all six types', () => {
  const all = buildAllPlaybooks([]);
  const types = all.map((p) => p.playbookType).sort();
  assert.deepEqual(types, ['followup', 'funnel', 'offer', 'page', 'payment', 'whatsapp']);
});

test('playbookToContext is honest about limited data', () => {
  const limited = playbookToContext(buildPlaybook('page', []));
  assert.ok(limited && limited.includes('limited'));
});

test('FunnelArchitect prompt includes playbook context when present', () => {
  const input: any = {
    businessName: 'X', market: 'eg', sells: 'course', productType: 'course', priceRange: '1000',
    targetCustomer: 'people', trafficSource: 'fb', salesChannel: 'whatsapp', paymentMethods: ['instapay'],
    tone: 'egyptian_friendly', goal: 'sales', playbookContext: 'Playbook(funnel) confidence=medium sample=5.',
  };
  const { user } = FunnelArchitectBrain.buildPrompt(input);
  assert.ok(user.includes('Playbook(funnel)'));
  assert.ok(user.includes('playbookNotes'));   // brain asked to return notes
});

test('FunnelArchitect fallback states limited learning when no context', () => {
  const input: any = {
    businessName: 'X', market: 'eg', sells: 'course', productType: 'course', priceRange: '1000',
    targetCustomer: 'people', trafficSource: 'fb', salesChannel: 'whatsapp', paymentMethods: ['instapay'],
    tone: 'egyptian_friendly', goal: 'sales',
  };
  const bp = FunnelArchitectBrain.fallback(input);
  assert.ok(bp.playbookNotes && bp.playbookNotes.includes('محدودة'));
});

test('PageBrain prompt includes playbook context when present', () => {
  const input: any = {
    funnelName: 'F', offer: { name: 'o', pricing: '100' }, market: 'eg', productType: 'course',
    tone: 'egyptian_friendly', salesChannel: 'whatsapp', paymentMethods: ['instapay'],
    playbookContext: 'Playbook(page) confidence=low sample=1.',
  };
  const { user } = PageBrain.buildPrompt(input);
  assert.ok(user.includes('Playbook(page)'));
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

test('SECURITY: playbook routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/playbooks', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/playbooks/regenerate', 'attacker')).status, 401);
    assert.equal((await call(port, 'GET', '/playbooks/explain/payment', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
