import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOVERNANCE_READINESS_BASELINE,
  reviewGovernanceReadiness,
  type GovernanceCapability,
} from '../modules/enterprise/src/governance-readiness.js';

test('enterprise governance baseline is contract-ready with explicit RBAC and policy gaps', () => {
  const review = reviewGovernanceReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_ENTERPRISE_GAPS');
  assert.equal(review.enterpriseClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('role_inventory'));
  assert.ok(review.readyCapabilities.includes('audit_policy_changes'));
  assert.ok(review.gapCapabilities.includes('permission_catalog'));
  assert.ok(review.gapCapabilities.includes('workspace_policy_catalog'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('enterprise governance readiness blocks claims when evidence is missing', () => {
  const capabilities: GovernanceCapability[] = GOVERNANCE_READINESS_BASELINE.map((capability) =>
    capability.id === 'role_inventory'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewGovernanceReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_GOVERNANCE_READY');
  assert.equal(review.enterpriseClaimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['role_inventory']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach governance evidence')));
});

test('enterprise governance readiness allows governance-ready only when every required capability is evidenced and ready', () => {
  const capabilities: GovernanceCapability[] = GOVERNANCE_READINESS_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/governance/${capability.id}.md`],
  }));

  const review = reviewGovernanceReadiness(capabilities);

  assert.equal(review.decision, 'GOVERNANCE_READY');
  assert.equal(review.enterpriseClaimAllowed, true);
  assert.equal(review.readyCapabilities.length, capabilities.length);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('enterprise governance readiness keeps optional future policies from blocking base claim', () => {
  const capabilities: GovernanceCapability[] = GOVERNANCE_READINESS_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/governance/${capability.id}.md`],
  }));
  capabilities.push({
    id: 'workspace_policy_catalog',
    label: 'Advanced device posture policy',
    area: 'workspace_policy',
    status: 'ROADMAP',
    owner: 'Product',
    evidence: ['docs/ENTERPRISE_READINESS_BACKLOG.md'],
    requiredForEnterpriseClaim: false,
  });

  const review = reviewGovernanceReadiness(capabilities);

  assert.equal(review.decision, 'GOVERNANCE_READY');
  assert.equal(review.enterpriseClaimAllowed, true);
  assert.ok(review.gapCapabilities.includes('workspace_policy_catalog'));
});
