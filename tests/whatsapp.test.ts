import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { AIGateway } from '../packages/ai-core/src/gateway.js';
import { WhatsAppSalesBrain } from '../packages/ai-core/src/brains/whatsapp-sales.js';
import { mockLLM, failingLLM } from '../packages/ai-core/src/llm.js';
import { selectStepType, stageAfterReply } from '../modules/whatsapp/src/copilot.js';
import { detectLeaks } from '../modules/leaks/src/engine.js';
import type { WhatsAppSalesInput } from '../packages/ai-core/src/brains/whatsapp-sales.js';
import type { Offer } from '../packages/ai-core/src/contracts.js';

const offer: Offer = {
  name: 'كورس النور', promise: 'اتعلّم', idealCustomer: 'x', mainPain: 'مش عارف يبدأ', desiredResult: 'نتيجة',
  transformation: 't', deliverables: ['وحدة'], bonuses: [], guarantee: 'ضمان', pricing: '4000',
  paymentPlan: '', urgency: '', objections: [], cta: 'كلمنا', toneNotes: '',
};
const input: WhatsAppSalesInput = { funnelName: 'قمع', offer, market: 'eg', tone: 'egyptian_friendly', price: '4000', salesChannel: 'whatsapp' };

test('WhatsAppSalesBrain parses valid LLM JSON', async () => {
  const flow = { strategy: 's', toneNotes: 't', handoffNotes: 'h',
    templates: [{ stepType: 'first_reply', title: 'رد', body: 'أهلاً', requiresApproval: true, paidTemplateRequired: false, noZannCooldownHours: 24 }] };
  const gw = new AIGateway(mockLLM(() => JSON.stringify(flow)));
  const { output, degraded } = await gw.run(WhatsAppSalesBrain, input, { tenantId: 't' });
  assert.equal(degraded, false);
  assert.equal(output.templates[0].stepType, 'first_reply');
});

test('WhatsAppSalesBrain fallback produces at least 15 templates with anti-spam metadata', async () => {
  const gw = new AIGateway(failingLLM);
  const { output, degraded } = await gw.run(WhatsAppSalesBrain, input, { tenantId: 't' });
  assert.equal(degraded, true);
  assert.ok(output.templates.length >= 15, `got ${output.templates.length}`);
  // anti-spam metadata present on every template
  for (const t of output.templates) {
    assert.equal(typeof t.requiresApproval, 'boolean');
    assert.equal(typeof t.noZannCooldownHours, 'number');
    assert.equal(t.paidTemplateRequired, false, 'no paid template sending in V1');
  }
  // required steps exist
  const types = new Set(output.templates.map((t) => t.stepType));
  for (const need of ['first_reply', 'qualification', 'price_reveal', 'payment_details', 'confirmation', 'delivery', 'no_response', 'recovery', 'upsell']) {
    assert.ok(types.has(need as any), `missing ${need}`);
  }
  // objection library present
  assert.ok(output.templates.filter((t) => t.stepType === 'objection').length >= 5);
});

test('copilot selects template by stage and payment state', () => {
  assert.equal(selectStepType({ stage: 'whatsapp_clicked' }), 'first_reply');
  assert.equal(selectStepType({ stage: 'qualified' }), 'price_reveal');
  assert.equal(selectStepType({ stage: 'new', paymentState: 'waiting_payment' }), 'payment_reminder');
  assert.equal(selectStepType({ objectionKey: 'price_high' }), 'objection');
  assert.equal(selectStepType({ stage: 'lost' }), 'recovery');
});

test('marking a first reply sent advances whatsapp_clicked → contacted', () => {
  assert.equal(stageAfterReply('whatsapp_clicked', 'first_reply'), 'contacted');
  assert.equal(stageAfterReply('qualified', 'price_reveal'), null);
});

test('leak engine flags missing whatsapp flow (evidence)', () => {
  const base: any = {
    hasTrackedLinks: true, linksCount: 1, linksWithoutUtm: 0, inactiveLinkInUse: false,
    totalClicks: 10, leadsCount: 10, leadsWithoutAttribution: 0,
    pagePublished: false, pageViews: 0, scrollReached50: 0, priceReached: 0, ctaClicks: 0,
    whatsappClicks: 10, pageUsesTrackedLink: false, leadsByStage: {}, leadsStuckWhatsappClicked: 0,
    conversationsWithoutContact: 0, leadsWithoutNextAction: 0,
    hasWhatsappFlow: false, hasFirstReplyTemplate: false, hasFollowupTemplate: false, clickedNoReplySent: 0,
    waitingPaymentCount: 0, waitingPaymentStuck: 0, proofUploadedNotConfirmed: 0, paidNotDelivered: 0, paymentStuckCount: 0,
    hasPaymentMethod: true, paymentMethodsMissingInstructions: 0, proofRequiredNoProofStep: 0,
    proofUploadedNotReviewed: 0, confirmedNotDelivered: 0, inactiveMethodInUse: false,
    detailsSentNoWaiting: 0, waitingNoFollowupTask: 0,
    overdueTasks: 0, leadsNeedingFollowupNoDate: 0, lostWithoutReason: 0, highRiskNoAction: 0, avgDealValue: null,
  };
  const leak = detectLeaks(base).find((x) => x.code === 'whatsapp.no_flow');
  assert.ok(leak);
  assert.equal(leak!.evidence.hasWhatsappFlow, false);
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

test('DEV: whatsapp step reorder requires flowId + orderedIds', async () => {
  process.env.FNNLR_DEV_MODE = 'true';
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'POST', '/whatsapp-flow-steps/reorder', { tenant: 't1', body: {} });
    assert.equal(r.status, 422);
  } finally { server.close(); delete process.env.FNNLR_DEV_MODE; }
});

test('SECURITY: whatsapp routes reject header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE;
  delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer();
  const port = await listen(server);
  try {
    const r = await call(port, 'GET', '/funnels/j1/whatsapp-flow', { tenant: 'attacker' });
    assert.equal(r.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});
