import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scoreFit, type SalesLeadIntake } from '../modules/sales-ops/src/fit.js';
import { proposalReadiness, buildHandoffPack, checkOwnership } from '../modules/sales-ops/src/proposal.js';
import { SUPPORT_TRIAGE_CATALOG, inferSupportCategory, intakeSupportIssue, reviewSupport } from '../modules/sales-ops/src/support-workflow.js';
import { checkCommercialDocs, isCommercialDoc } from '../modules/commercial/src/consistency.js';

/** Sprint 44 — sales & support operating system. Pure logic + consistency. */

const strongLead: SalesLeadIntake = {
  leadName: 'Sara', businessName: 'Sara Store', market: 'eg',
  whatsappSelling: 'yes', trafficSource: 'yes', manualPayment: 'yes',
  offerClarity: 'high', responseOwnerExists: true,
  expectedAutomationLevel: 'manual_send', expectedPaymentProcessing: false, expectsGuaranteedSales: false,
};

test('a strong-fit lead scores strong_fit', () => {
  const r = scoreFit(strongLead);
  assert.equal(r.fitCategory, 'strong_fit');
  assert.ok(r.fitScore >= 80);
});

test('a lead expecting guaranteed sales is bad_fit with an expectation reset', () => {
  const r = scoreFit({ ...strongLead, expectsGuaranteedSales: true });
  assert.equal(r.fitCategory, 'bad_fit');
  assert.ok(r.expectationResets.some((x) => /guarantee/i.test(x)));
});

test('a lead expecting auto-send is bad_fit with an expectation reset', () => {
  const r = scoreFit({ ...strongLead, expectedAutomationLevel: 'expects_auto_send' });
  assert.equal(r.fitCategory, 'bad_fit');
  assert.ok(r.expectationResets.some((x) => /send/i.test(x)));
});

test('a lead expecting payment processing is bad_fit', () => {
  const r = scoreFit({ ...strongLead, expectedPaymentProcessing: true });
  assert.equal(r.fitCategory, 'bad_fit');
  assert.ok(r.risks.some((x) => /payment processing/i.test(x)));
});

test('no traffic + no responder is bad_fit', () => {
  const r = scoreFit({ ...strongLead, trafficSource: 'no', responseOwnerExists: false });
  assert.equal(r.fitCategory, 'bad_fit');
});

test('proposal readiness is BLOCKED_BY_EXPECTATIONS for an auto-send expectation', () => {
  const r = proposalReadiness({ ...strongLead, expectedAutomationLevel: 'expects_auto_send' }, {});
  assert.equal(r.status, 'BLOCKED_BY_EXPECTATIONS');
});

test('proposal readiness NEEDS_DISCOVERY when responsibilities not accepted', () => {
  const r = proposalReadiness(strongLead, {
    offerTypeKnown: true, funnelCountKnown: true, supportLevelKnown: true, launchTimelineKnown: true,
    responsibilitiesAccepted: false, limitationsAcknowledged: true, successCriteriaAccepted: true,
  });
  assert.equal(r.status, 'NEEDS_DISCOVERY');
  assert.ok(r.missing.some((m) => /responsibilities/i.test(m)));
});

test('proposal readiness READY_TO_PROPOSE when all required fields present', () => {
  const r = proposalReadiness(strongLead, {
    offerTypeKnown: true, funnelCountKnown: true, supportLevelKnown: true, launchTimelineKnown: true,
    responsibilitiesAccepted: true, limitationsAcknowledged: true, successCriteriaAccepted: true,
  });
  assert.equal(r.status, 'READY_TO_PROPOSE');
});

test('handoff pack uses explicit placeholders for missing inputs, never fake values', () => {
  const pack = buildHandoffPack({
    lead: strongLead, tier: 'managed_launch',
    ownership: { setupOwner: 'a', supportOwner: 'b', customerResponseOwner: 'c', paymentConfirmationOwner: 'd', rollbackOwner: 'e' },
    collected: { whatsappNumber: '+201000000000' },
  });
  const s = JSON.stringify(pack.executionManifestDraft);
  assert.ok(s.includes('MISSING'), 'missing inputs are explicit placeholders');
  assert.ok(pack.missingCustomerInputs.length > 0);
  assert.equal(pack.status, 'READY_FOR_SETUP'); // owners present
});

test('handoff is BLOCKED when a critical owner is missing', () => {
  const pack = buildHandoffPack({
    lead: strongLead, tier: 'starter_activation',
    ownership: { setupOwner: 'a' }, // missing support/response/payment/rollback
    collected: {},
  });
  assert.equal(pack.status, 'BLOCKED');
  assert.ok(pack.ownershipMissing.includes('supportOwner'));
});

test('checkOwnership flags every missing critical owner', () => {
  const r = checkOwnership({ setupOwner: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.missing.includes('rollbackOwner'));
});

test('support intake requires an owner + next action for P0/P1', () => {
  const bad = intakeSupportIssue({ summary: 's', source: 'go-live', severity: 'P0', evidence: 'e' });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => /owner/.test(e)));
  assert.ok(bad.errors.some((e) => /due date/.test(e)));
  assert.ok(bad.errors.some((e) => /evidence link/.test(e)));
  const ok = intakeSupportIssue({
    summary: 's',
    source: 'go-live',
    severity: 'P0',
    category: 'tenant_isolation',
    evidence: 'e',
    owner: 'platform',
    nextAction: 'disable',
    dueDate: '2026-07-01',
    evidenceLink: 'gateforge-audit/example.md',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.record?.category, 'tenant_isolation');
  assert.equal(ok.record?.safeRollback !== null, true);
});

test('support triage taxonomy classifies categories and default owners', () => {
  assert.equal(inferSupportCategory('Webhook signature rejected for provider event'), 'webhook_failure');
  assert.equal(inferSupportCategory('Customer asks for data deletion'), 'data_lifecycle');
  assert.equal(SUPPORT_TRIAGE_CATALOG.webhook_failure.defaultOwner, 'platform');

  const ok = intakeSupportIssue({
    summary: 'AI budget cap exceeded',
    source: 'daily-check',
    severity: 'P2',
    evidence: 'ai_usage_events degraded',
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.record?.category, 'ai_degraded');
  assert.equal(ok.record?.owner, 'support');
});

test('support review reports category counts and rejects incomplete P0/P1 blockers', () => {
  const review = reviewSupport([
    {
      severity: 'P1',
      status: 'open',
      category: 'workflow_blocked',
      nextAction: 'publish recovery',
      owner: 'support',
      source: 'customer',
      dueDate: '2026-07-01',
      evidenceLink: 'docs/evidence.md',
    },
    {
      severity: 'P0',
      status: 'open',
      category: 'tenant_isolation',
      nextAction: '',
      owner: '',
      source: 'daily-check',
      dueDate: null,
      evidenceLink: null,
    },
  ]);

  assert.equal(review.categoryCounts.workflow_blocked, 1);
  assert.equal(review.categoryCounts.tenant_isolation, 1);
  assert.equal(review.openBlockers.length, 2);
  assert.equal(review.allCriticalOwned, false);
});

test('sales-ops docs (if mounted) pass the consistency checker', () => {
  const repo = path.resolve(process.cwd());
  const docDirs = [path.join(repo, '..', '..', 'docs'), path.join(repo, 'docs')].filter((d) => fs.existsSync(d));
  const dir = docDirs.find((d) => fs.readdirSync(d).some((f) => /SALES_OPERATING|PROPOSAL_TEMPLATE|SUPPORT_WORKFLOW|HANDOFF/i.test(f)));
  if (!dir) return; // not mounted in this run — skip silently
  const r = checkCommercialDocs(dir);
  assert.deepEqual(r.violations, [], `forbidden claims: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(r.missingMarkers, [], `missing markers: ${r.missingMarkers.join(', ')}`);
});
