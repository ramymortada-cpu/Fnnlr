import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { validateCustomerConfig } from '../modules/customer-zero/src/config.js';
import { validateExecutionManifest } from '../modules/execution/src/manifest.js';
import { repeatabilityReport, type RepeatabilityResult } from '../modules/repeatability/src/runner.js';
import { buildHandoffPack } from '../modules/sales-ops/src/proposal.js';
import type { SalesLeadIntake } from '../modules/sales-ops/src/fit.js';

/**
 * Sprint 46 — repeatability (pure parts). The live A/B isolation path runs in the
 * live-DB suite.
 */

function loadExample(name: string): any | null {
  for (const p of [path.join(process.cwd(), name), path.join(process.cwd(), '..', '..', name)]) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return null;
}

test('customer-one config validates with the SAME schema as customer-zero', () => {
  const c1 = loadExample('customer-one.config.example.json');
  if (!c1) return; // not mounted in this run — skip silently
  const r = validateCustomerConfig(c1, { production: true });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test('customer-one execution manifest validates with the SAME schema', () => {
  const m1 = loadExample('customer-one.execution.example.json');
  if (!m1) return;
  const r = validateExecutionManifest(m1, { production: true });
  assert.equal(r.ok, true, JSON.stringify(r.issues));
});

test('customer-zero and customer-one configs differ (distinct customers, not a copy)', () => {
  const c0 = loadExample('customer-zero.config.example.json');
  const c1 = loadExample('customer-one.config.example.json');
  if (!c0 || !c1) return;
  assert.notEqual(c0.workspaceName, c1.workspaceName);
  assert.notEqual(c0.business.name, c1.business.name);
  assert.notEqual(c0.whatsappNumber, c1.whatsappNumber);
  assert.notEqual(c0.supportOwner, c1.supportOwner);
});

const leadA: SalesLeadIntake = { leadName: 'A', businessName: 'Alpha', market: 'eg', whatsappSelling: 'yes', trafficSource: 'yes', manualPayment: 'yes', offerClarity: 'high', responseOwnerExists: true };
const leadB: SalesLeadIntake = { leadName: 'B', businessName: 'Beta', market: 'ae', whatsappSelling: 'yes', trafficSource: 'yes', manualPayment: 'yes', offerClarity: 'high', responseOwnerExists: true };

test('sales handoff values do not bleed between two leads', () => {
  const owners = { setupOwner: 's', supportOwner: 'su', customerResponseOwner: 'r', paymentConfirmationOwner: 'p', rollbackOwner: 'rb' };
  const packA = buildHandoffPack({ lead: leadA, tier: 'starter_activation', ownership: owners, collected: { whatsappNumber: '+201111111111' } });
  const packB = buildHandoffPack({ lead: leadB, tier: 'growth_ops', ownership: owners, collected: { whatsappNumber: '+971500000000' } });
  const aManifest = JSON.stringify(packA.executionManifestDraft);
  const bManifest = JSON.stringify(packB.executionManifestDraft);
  assert.ok(aManifest.includes('Alpha') && !aManifest.includes('Beta'), 'A has its own business, not B');
  assert.ok(bManifest.includes('Beta') && !bManifest.includes('Alpha'), 'B has its own business, not A');
  assert.ok(aManifest.includes('+201111111111') && !aManifest.includes('+971500000000'), 'A keeps its own WhatsApp number');
});

test('handoff still uses explicit placeholders for missing values (no fabrication)', () => {
  const owners = { setupOwner: 's', supportOwner: 'su', customerResponseOwner: 'r', paymentConfirmationOwner: 'p', rollbackOwner: 'rb' };
  const pack = buildHandoffPack({ lead: leadA, tier: 'managed_launch', ownership: owners, collected: {} });
  assert.ok(JSON.stringify(pack.executionManifestDraft).includes('MISSING'));
});

test('repeatability report says REPEATABLE only when every check passes', () => {
  const pass: RepeatabilityResult = {
    status: 'PASS',
    customers: [{ label: 'A', tenantId: 't1', businessId: 'b1', funnelId: 'f1' }, { label: 'B', tenantId: 't2', businessId: 'b2', funnelId: 'f2' }],
    separation: [{ check: 'distinct tenants', ok: true, detail: '' }],
    idempotency: [{ check: 'stable', ok: true, detail: '' }],
    signalIsolation: [{ check: 'A page-events unchanged after B', ok: true, detail: '' }],
    blockers: [], nextAction: 'ok',
  };
  assert.equal(repeatabilityReport(pass).decision, 'REPEATABLE');

  const fail: RepeatabilityResult = { ...pass, status: 'FAIL', blockers: ['distinct tenants: same'], separation: [{ check: 'distinct tenants', ok: false, detail: 'same' }] };
  assert.notEqual(repeatabilityReport(fail).decision, 'REPEATABLE');
});
