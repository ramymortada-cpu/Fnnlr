import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIT_LOG_VIEWER_BASELINE,
  reviewAuditLogViewerReadiness,
  type AuditLogViewerCapability,
} from '../modules/enterprise/src/audit-log-readiness.js';

test('audit log viewer baseline is contract-ready with explicit gaps, not viewer-ready', () => {
  const review = reviewAuditLogViewerReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_GAPS');
  assert.equal(review.claimAllowed, false);
  assert.ok(review.readyCapabilities.includes('secret_redaction'));
  assert.ok(review.readyCapabilities.includes('event_detail'));
  assert.ok(review.gapCapabilities.includes('tenant_scoped_view'));
  assert.ok(review.gapCapabilities.includes('enterprise_export'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('audit log viewer readiness blocks ready claims when evidence is missing', () => {
  const capabilities: AuditLogViewerCapability[] = AUDIT_LOG_VIEWER_BASELINE.map((capability) =>
    capability.id === 'secret_redaction'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewAuditLogViewerReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_VIEWER_READY');
  assert.equal(review.claimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['secret_redaction']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach audit viewer evidence')));
});

test('audit log viewer readiness allows viewer-ready only when every required capability is evidenced and ready', () => {
  const capabilities: AuditLogViewerCapability[] = AUDIT_LOG_VIEWER_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/audit-viewer/${capability.id}.md`],
  }));

  const review = reviewAuditLogViewerReadiness(capabilities);

  assert.equal(review.decision, 'VIEWER_READY');
  assert.equal(review.claimAllowed, true);
  assert.equal(review.readyCapabilities.length, capabilities.length);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('audit log viewer readiness keeps optional future capabilities from blocking the base claim', () => {
  const capabilities: AuditLogViewerCapability[] = AUDIT_LOG_VIEWER_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/audit-viewer/${capability.id}.md`],
  }));
  capabilities.push({
    id: 'operator_filtering',
    label: 'Advanced saved filters',
    status: 'ROADMAP',
    owner: 'Support',
    evidence: ['docs/AUDIT_LOG_VIEWER_BACKLOG.md'],
    requiredForClaim: false,
  });

  const review = reviewAuditLogViewerReadiness(capabilities);

  assert.equal(review.decision, 'VIEWER_READY');
  assert.equal(review.claimAllowed, true);
  assert.ok(review.gapCapabilities.includes('operator_filtering'));
});
