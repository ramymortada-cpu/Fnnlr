import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTERPRISE_READINESS_BASELINE,
  reviewEnterpriseReadiness,
  type EnterpriseCapability,
} from '../modules/enterprise/src/readiness.js';

test('enterprise readiness baseline is honest: limited roadmap, not enterprise-ready', () => {
  const review = reviewEnterpriseReadiness(ENTERPRISE_READINESS_BASELINE);

  assert.equal(review.salesPosture, 'LIMITED_ENTERPRISE_ROADMAP');
  assert.deepEqual(review.readyCapabilities, ['data_residency', 'procurement_packet']);
  assert.ok(review.roadmapCapabilities.includes('rbac_expansion'));
  assert.ok(review.roadmapCapabilities.includes('workspace_policies'));
  assert.ok(review.roadmapCapabilities.includes('audit_export'));
  assert.deepEqual(review.blockedCapabilities, []);
  assert.deepEqual(review.unsupportedClaims, []);
  assert.ok(review.actions.some((action) => action.action.includes('Granular permissions')));
});

test('enterprise readiness blocks unsupported customer-facing claims', () => {
  const capabilities: EnterpriseCapability[] = ENTERPRISE_READINESS_BASELINE.map((capability) =>
    capability.id === 'sso_oidc'
      ? { ...capability, customerClaimAllowed: true }
      : capability,
  );

  const review = reviewEnterpriseReadiness(capabilities);

  assert.equal(review.salesPosture, 'DO_NOT_SELL_ENTERPRISE');
  assert.deepEqual(review.unsupportedClaims, ['sso_oidc']);
  assert.ok(review.actions.some((action) => action.action.includes('Remove customer-facing enterprise-ready claim')));
});

test('enterprise readiness treats missing evidence as a blocker', () => {
  const capabilities: EnterpriseCapability[] = ENTERPRISE_READINESS_BASELINE.map((capability) =>
    capability.id === 'procurement_packet'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewEnterpriseReadiness(capabilities);

  assert.equal(review.salesPosture, 'DO_NOT_SELL_ENTERPRISE');
  assert.deepEqual(review.blockedCapabilities, ['procurement_packet']);
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('File, test, runbook')));
});

test('enterprise readiness becomes ready only when every P2 capability has evidence and a ready status', () => {
  const capabilities: EnterpriseCapability[] = ENTERPRISE_READINESS_BASELINE.map((capability) =>
    capability.priority === 'P2'
      ? { ...capability, status: 'READY', evidence: [`evidence/${capability.id}.md`], customerClaimAllowed: true }
      : capability,
  );

  const review = reviewEnterpriseReadiness(capabilities);

  assert.equal(review.salesPosture, 'ENTERPRISE_READY');
  assert.deepEqual(review.blockedCapabilities, []);
  assert.deepEqual(review.unsupportedClaims, []);
  assert.ok(review.readyCapabilities.includes('rbac_expansion'));
  assert.ok(review.readyCapabilities.includes('sso_oidc'));
});
