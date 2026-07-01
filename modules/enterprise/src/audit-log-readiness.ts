export type AuditLogViewerCapabilityId =
  | 'tenant_scoped_view'
  | 'operator_filtering'
  | 'secret_redaction'
  | 'enterprise_export'
  | 'event_detail'
  | 'admin_operator_permission'
  | 'negative_auth_tests';

export type AuditLogViewerStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type AuditLogViewerCapability = {
  id: AuditLogViewerCapabilityId;
  label: string;
  status: AuditLogViewerStatus;
  owner: 'Engineering' | 'Support' | 'Founder/legal';
  evidence: string[];
  requiredForClaim: boolean;
};

export type AuditLogViewerReview = {
  decision: 'VIEWER_READY' | 'CONTRACT_READY_WITH_GAPS' | 'DO_NOT_CLAIM_VIEWER_READY';
  claimAllowed: boolean;
  readyCapabilities: AuditLogViewerCapabilityId[];
  gapCapabilities: AuditLogViewerCapabilityId[];
  blockedCapabilities: AuditLogViewerCapabilityId[];
  actions: Array<{
    owner: AuditLogViewerCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const AUDIT_LOG_VIEWER_BASELINE: AuditLogViewerCapability[] = [
  cap('tenant_scoped_view', 'Tenant-scoped audit event view', 'ROADMAP', 'Engineering', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
    'modules/security/src/audit.ts',
  ], true),
  cap('operator_filtering', 'Operator filtering by tenant and event type', 'ROADMAP', 'Support', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
    'modules/execution/src/support-pack.ts',
  ], true),
  cap('secret_redaction', 'Secret redaction for audit metadata and exports', 'CONTRACT_READY', 'Engineering', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
    'tests/release-safety.test.ts',
    'modules/release/src/health.ts',
  ], true),
  cap('enterprise_export', 'CSV/JSON audit export for enterprise review', 'ROADMAP', 'Engineering', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
    'docs/ENTERPRISE_READINESS_BACKLOG.md',
  ], true),
  cap('event_detail', 'Actor/action/target/timestamp/request detail', 'CONTRACT_READY', 'Engineering', [
    'modules/security/src/audit.ts',
    'packages/db/tenant/migrations/0001_init_tenant_schema.sql',
  ], true),
  cap('admin_operator_permission', 'Admin/operator-only access', 'ROADMAP', 'Engineering', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
    'tests/admin-mfa.test.ts',
    'tests/route-matrix.test.ts',
  ], true),
  cap('negative_auth_tests', 'Negative auth and tenant-isolation tests', 'ROADMAP', 'Engineering', [
    'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
  ], true),
];

export function reviewAuditLogViewerReadiness(
  capabilities: AuditLogViewerCapability[] = AUDIT_LOG_VIEWER_BASELINE,
): AuditLogViewerReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const claimAllowed = capabilities
    .filter((capability) => capability.requiredForClaim)
    .every(isReady);

  return {
    decision: auditViewerDecision(blockedCapabilities, claimAllowed),
    claimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: auditViewerActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function cap(
  id: AuditLogViewerCapabilityId,
  label: string,
  status: AuditLogViewerStatus,
  owner: AuditLogViewerCapability['owner'],
  evidence: string[],
  requiredForClaim: boolean,
): AuditLogViewerCapability {
  return { id, label, status, owner, evidence, requiredForClaim };
}

function isReady(capability: AuditLogViewerCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: AuditLogViewerCapability) {
  return ['ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: AuditLogViewerCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function auditViewerDecision(
  blockedCapabilities: AuditLogViewerCapabilityId[],
  claimAllowed: boolean,
): AuditLogViewerReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_VIEWER_READY';
  return claimAllowed ? 'VIEWER_READY' : 'CONTRACT_READY_WITH_GAPS';
}

function auditViewerActions(
  capabilities: AuditLogViewerCapability[],
  blockedCapabilities: AuditLogViewerCapabilityId[],
  gapCapabilities: AuditLogViewerCapabilityId[],
): AuditLogViewerReview['actions'] {
  const actions: AuditLogViewerReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach audit viewer evidence for ${capability.label}.`,
        evidenceRequired: 'Code, test, route matrix row, export fixture, or hosted screenshot proving the capability.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until implementation evidence exists.`,
        evidenceRequired: 'Acceptance criteria plus code/test evidence before claiming audit viewer readiness.',
      });
    }
  }
  return actions;
}
