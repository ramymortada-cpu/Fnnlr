import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { comparePortfolio, findTransferable, funnelHealth, type FunnelMetrics } from '../modules/portfolio/src/compare.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 23 — Multi-Funnel Portfolio Intelligence. The cross-funnel comparison
 * is pure and tested here: minimum-data gating, no fabricated rankings,
 * transferable-playbook detection. DB-backed gather runs in the live suite.
 */

function fm(over: Partial<FunnelMetrics> = {}): FunnelMetrics {
  return {
    funnelId: 'f1', name: 'قمع', market: 'eg',
    published: true, hasTracking: true, leads: 10, activeLeads: 5, openLeaks: 0, repairsApplied: 0, playbooksApplied: 0,
    pageViews: 0, ctaClicks: 0, whatsappClicks: 0, ctaRate: 0,
    clickedNotContacted: 0, contacted: 0,
    waitingPayment: 0, paid: 0, paymentLeads: 0,
    overdueTasks: 0, improvedOutcomes: 0, awaitingOutcomes: 0, ...over,
  };
}

test('single funnel → insufficient_data (cannot compare)', () => {
  const ins = comparePortfolio([fm()]);
  assert.equal(ins[0].insightType, 'insufficient_data');
});

test('CTA comparison requires minimum views on both funnels', () => {
  // a has 100 views, b has only 10 → not comparable on CTA
  const a = fm({ funnelId: 'a', name: 'A', pageViews: 100, ctaClicks: 10, ctaRate: 0.1 });
  const b = fm({ funnelId: 'b', name: 'B', pageViews: 10, ctaClicks: 0, ctaRate: 0 });
  const ins = comparePortfolio([a, b]);
  // no underperforming_page CTA insight should be produced from incomparable data
  const cta = ins.find((i) => i.insightType === 'underperforming_page' && (i.evidence as any).best);
  assert.equal(cta, undefined);
});

test('CTA comparison produced when both have enough views', () => {
  const a = fm({ funnelId: 'a', name: 'A', pageViews: 100, ctaClicks: 12, ctaRate: 0.12 });
  const b = fm({ funnelId: 'b', name: 'B', pageViews: 100, ctaClicks: 2, ctaRate: 0.02 });
  const ins = comparePortfolio([a, b]);
  assert.ok(ins.some((i) => i.insightType === 'underperforming_page' && (i.evidence as any).best));
});

test('payment comparison requires minimum payment leads', () => {
  const a = fm({ funnelId: 'a', name: 'A', paymentLeads: 2, paid: 2 });
  const b = fm({ funnelId: 'b', name: 'B', paymentLeads: 1, paid: 0 });
  const ins = comparePortfolio([a, b]);
  assert.equal(ins.find((i) => i.insightType === 'payment_friction'), undefined);
});

test('NO fake strongest funnel without ≥2 comparable categories', () => {
  // only one weak category of data → no strongest_funnel, an insufficient_data note instead
  const a = fm({ funnelId: 'a', name: 'A', pageViews: 5 });
  const b = fm({ funnelId: 'b', name: 'B', pageViews: 5 });
  const ins = comparePortfolio([a, b]);
  assert.equal(ins.find((i) => i.insightType === 'strongest_funnel'), undefined);
  assert.ok(ins.some((i) => i.insightType === 'insufficient_data'));
});

test('strongest funnel emerges when ≥2 categories are comparable', () => {
  const a = fm({ funnelId: 'a', name: 'A', pageViews: 100, ctaClicks: 12, ctaRate: 0.12, whatsappClicks: 30, paymentLeads: 10, paid: 8 });
  const b = fm({ funnelId: 'b', name: 'B', pageViews: 100, ctaClicks: 2, ctaRate: 0.02, whatsappClicks: 12, paymentLeads: 10, paid: 2, openLeaks: 3 });
  const ins = comparePortfolio([a, b]);
  assert.ok(ins.some((i) => i.insightType === 'strongest_funnel'));
});

test('every insight carries evidence and affected funnels', () => {
  const a = fm({ funnelId: 'a', name: 'A', pageViews: 100, ctaClicks: 12, ctaRate: 0.12, whatsappClicks: 30, paymentLeads: 10, paid: 8 });
  const b = fm({ funnelId: 'b', name: 'B', pageViews: 100, ctaClicks: 2, ctaRate: 0.02, whatsappClicks: 12, paymentLeads: 10, paid: 2 });
  for (const i of comparePortfolio([a, b])) {
    assert.ok(i.evidence && typeof i.evidence === 'object');
    assert.ok(Array.isArray(i.affectedFunnels));
  }
});

test('transferable playbook detected: improved source + weak same-market target', () => {
  const src = fm({ funnelId: 'src', name: 'مصدر', market: 'eg', improvedOutcomes: 1, playbooksApplied: 1, pageViews: 100, ctaRate: 0.1 });
  const tgt = fm({ funnelId: 'tgt', name: 'هدف', market: 'eg', paymentLeads: 8, paid: 2, improvedOutcomes: 0 });
  const transfers = findTransferable([src, tgt]);
  assert.ok(transfers.length >= 1);
  assert.equal(transfers[0].sourceFunnel, 'src');
  assert.equal(transfers[0].targetFunnel, 'tgt');
});

test('no transfer across different markets', () => {
  const src = fm({ funnelId: 'src', market: 'eg', improvedOutcomes: 1, playbooksApplied: 1, pageViews: 100, ctaRate: 0.1 });
  const tgt = fm({ funnelId: 'tgt', market: 'sa', paymentLeads: 8, paid: 2 });
  assert.equal(findTransferable([src, tgt]).length, 0);
});

test('health score reflects real signals', () => {
  const strong = funnelHealth(fm({ published: true, hasTracking: true, leads: 10, pageViews: 50, ctaClicks: 5, paid: 3 }));
  const weak = funnelHealth(fm({ published: false, hasTracking: false, leads: 0, openLeaks: 4 }));
  assert.ok(strong > weak);
});

test('command classifier routes portfolio intents', () => {
  assert.equal(classifyCommand('قارن القمعات').intent, 'compare_funnels');
  assert.equal(classifyCommand('أنهي قمع أقوى؟').intent, 'strongest_funnel');
  assert.equal(classifyCommand('فين أضعف قمع؟').intent, 'weakest_funnel');
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

test('SECURITY: portfolio routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    assert.equal((await call(port, 'GET', '/portfolio', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/portfolio/analyze', 'attacker')).status, 401);
    assert.equal((await call(port, 'POST', '/portfolio/transfer-playbook-plan', 'attacker')).status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
