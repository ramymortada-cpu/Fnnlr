import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivation, type ActivationEvidence } from '../modules/activation/src/engine.js';
import { classifyCommand } from '../modules/command/src/intents.js';

/**
 * Sprint 36 — activation. The engine is evidence-based: a step is `done` ONLY
 * when the underlying record/event exists. No fake progress, no fake revenue.
 */

const empty: ActivationEvidence = {
  hasBusiness: true, hasOffer: false, hasBlueprint: false, hasPage: false, pagePublished: false,
  hasTrackedLink: false, hasPaymentMethod: false, pageViews: 0, whatsappClicks: 0, leads: 0,
  paymentStates: 0, revenueDeskItems: 0, recommendations: 0, outcomesMeasured: 0,
};

test('a brand-new business is in the setup stage with a low readiness score', () => {
  const a = buildActivation(empty);
  assert.equal(a.stage, 'setup');
  assert.ok(a.readinessScore < 30);
  assert.equal(a.launchReady, false);
  assert.equal(a.nextAction?.id, 'offer_defined', 'next step is the first non-done one');
});

test('configuring offer + blueprint + page + publish + link + payment reaches publish_ready', () => {
  const a = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true, pagePublished: true, hasTrackedLink: true, hasPaymentMethod: true });
  assert.equal(a.stage, 'publish_ready');
  assert.equal(a.launchReady, true, 'can now receive a real signal');
  assert.equal(a.blockingReason, null);
});

test('page must be published for the publish step to be done (evidence-based)', () => {
  const withPageNotPublished = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true });
  const pubStep = withPageNotPublished.steps.find((s) => s.id === 'page_published')!;
  assert.equal(pubStep.status, 'ready');
  assert.match(pubStep.evidence, /مش منشورة/);
});

test('a first page view advances to traffic_ready only when published + viewed', () => {
  const a = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true, pagePublished: true, hasTrackedLink: true, hasPaymentMethod: true, pageViews: 3 });
  assert.equal(a.stage, 'traffic_ready');
  assert.equal(a.steps.find((s) => s.id === 'first_page_view_seen')!.status, 'done');
});

test('a lead advances to lead_ready; a desk item + payment advances to revenue_ops_ready', () => {
  const lead = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true, pagePublished: true, hasTrackedLink: true, hasPaymentMethod: true, whatsappClicks: 1, leads: 1 });
  assert.equal(lead.stage, 'lead_ready');
  const ops = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true, pagePublished: true, hasTrackedLink: true, hasPaymentMethod: true, whatsappClicks: 1, leads: 1, revenueDeskItems: 2 });
  assert.equal(ops.stage, 'revenue_ops_ready');
});

test('measuring an outcome reaches learning_ready', () => {
  const a = buildActivation({ ...empty, hasOffer: true, hasBlueprint: true, hasPage: true, pagePublished: true, hasTrackedLink: true, hasPaymentMethod: true, pageViews: 5, whatsappClicks: 1, leads: 1, paymentStates: 1, revenueDeskItems: 1, recommendations: 1, outcomesMeasured: 1 });
  assert.equal(a.stage, 'learning_ready');
  assert.equal(a.readinessScore, 100);
});

test('no fake progress: every "done" maps to real evidence, never a checkbox', () => {
  const a = buildActivation(empty);
  const doneWithoutEvidence = a.steps.filter((s) => s.status === 'done' && !s.evidence);
  assert.equal(doneWithoutEvidence.length, 0);
  // with empty evidence only business_created can be done
  assert.deepEqual(a.steps.filter((s) => s.status === 'done').map((s) => s.id), ['business_created']);
});

test('command classifier routes activation intents', () => {
  assert.equal(classifyCommand('كمّل التفعيل').intent, 'continue_activation');
  assert.equal(classifyCommand('إيه ناقص عشان أنشر؟').intent, 'whats_needed_to_publish');
  assert.equal(classifyCommand('افتح تفعيل البيزنس').intent, 'open_activation');
  assert.equal(classifyCommand('هل الفانل جاهز؟').intent, 'is_funnel_ready');
});
