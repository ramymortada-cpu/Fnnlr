import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_LIFECYCLE_WORKFLOW_BASELINE,
  reviewDataLifecycleWorkflowReadiness,
  type DataLifecycleCapability,
} from '../modules/data-lifecycle/src/readiness.js';

test('data lifecycle baseline is contract-ready with product workflow gaps', () => {
  const review = reviewDataLifecycleWorkflowReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_PRODUCT_GAPS');
  assert.equal(review.customerClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('sanitized_export_execution'));
  assert.ok(review.readyCapabilities.includes('tenant_delete_execution'));
  assert.ok(review.gapCapabilities.includes('export_request_ui'));
  assert.ok(review.gapCapabilities.includes('deletion_request_workflow'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('data lifecycle readiness blocks customer workflow claims when evidence is missing', () => {
  const capabilities: DataLifecycleCapability[] = DATA_LIFECYCLE_WORKFLOW_BASELINE.map((capability) =>
    capability.id === 'tenant_delete_execution'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewDataLifecycleWorkflowReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_CUSTOMER_WORKFLOW_READY');
  assert.equal(review.customerClaimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['tenant_delete_execution']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach data lifecycle evidence')));
});

test('data lifecycle readiness allows customer workflow claim only when all required steps are ready', () => {
  const capabilities: DataLifecycleCapability[] = DATA_LIFECYCLE_WORKFLOW_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/data-lifecycle/${capability.id}.md`],
  }));

  const review = reviewDataLifecycleWorkflowReadiness(capabilities);

  assert.equal(review.decision, 'CUSTOMER_WORKFLOW_READY');
  assert.equal(review.customerClaimAllowed, true);
  assert.equal(review.readyCapabilities.length, capabilities.length);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('data lifecycle readiness keeps optional future workflow gaps from blocking the base claim', () => {
  const capabilities: DataLifecycleCapability[] = DATA_LIFECYCLE_WORKFLOW_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/data-lifecycle/${capability.id}.md`],
  }));
  capabilities.push({
    id: 'approved_export_delivery',
    label: 'Automated signed download expiration',
    workflow: 'export',
    status: 'ROADMAP',
    owner: 'Engineering',
    evidence: ['docs/DATA_EXPORT_DELETE_UI_BACKLOG.md'],
    requiredForCustomerClaim: false,
  });

  const review = reviewDataLifecycleWorkflowReadiness(capabilities);

  assert.equal(review.decision, 'CUSTOMER_WORKFLOW_READY');
  assert.equal(review.customerClaimAllowed, true);
  assert.ok(review.gapCapabilities.includes('approved_export_delivery'));
});
