export type DataLifecycleCapabilityId =
  | 'export_request_ui'
  | 'operator_export_approval'
  | 'sanitized_export_execution'
  | 'export_audit_event'
  | 'approved_export_delivery'
  | 'deletion_request_workflow'
  | 'legal_retention_review'
  | 'destructive_confirmation'
  | 'tenant_delete_execution'
  | 'deletion_audit_proof'
  | 'negative_auth_tests';

export type DataLifecycleCapabilityStatus =
  | 'READY'
  | 'CONTRACT_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'MISSING_EVIDENCE';

export type DataLifecycleCapability = {
  id: DataLifecycleCapabilityId;
  label: string;
  workflow: 'export' | 'delete' | 'shared';
  status: DataLifecycleCapabilityStatus;
  owner: 'Engineering' | 'Support' | 'Founder/legal';
  evidence: string[];
  requiredForCustomerClaim: boolean;
};

export type DataLifecycleReadinessReview = {
  decision:
    | 'CUSTOMER_WORKFLOW_READY'
    | 'CONTRACT_READY_WITH_PRODUCT_GAPS'
    | 'DO_NOT_CLAIM_CUSTOMER_WORKFLOW_READY';
  customerClaimAllowed: boolean;
  readyCapabilities: DataLifecycleCapabilityId[];
  gapCapabilities: DataLifecycleCapabilityId[];
  blockedCapabilities: DataLifecycleCapabilityId[];
  actions: Array<{
    owner: DataLifecycleCapability['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const DATA_LIFECYCLE_WORKFLOW_BASELINE: DataLifecycleCapability[] = [
  capability('export_request_ui', 'Customer/admin export request surface', 'export', 'ROADMAP', 'Engineering', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
  capability('operator_export_approval', 'Operator approval before export generation', 'export', 'ROADMAP', 'Support', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
  capability('sanitized_export_execution', 'Sanitized tenant export command', 'export', 'CONTRACT_READY', 'Engineering', [
    'scripts/export-tenant.ts',
    'modules/data-lifecycle/src/export.ts',
    'tests/data-lifecycle.test.ts',
  ], true),
  capability('export_audit_event', 'Export request and completion audit event', 'export', 'CONTRACT_READY', 'Engineering', [
    'scripts/export-tenant.ts',
    'packages/db/tenant/migrations/0030_gateforge_ga_controls.sql',
  ], true),
  capability('approved_export_delivery', 'Approved bundle delivery path', 'export', 'ROADMAP', 'Support', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
  capability('deletion_request_workflow', 'Customer deletion request intake', 'delete', 'ROADMAP', 'Support', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
  capability('legal_retention_review', 'Legal and retention review before deletion', 'delete', 'ROADMAP', 'Founder/legal', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
    'docs/DATA_LIFECYCLE.md',
  ], true),
  capability('destructive_confirmation', 'Explicit human confirmation for destructive deletion', 'delete', 'ROADMAP', 'Support', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
  capability('tenant_delete_execution', 'Dedicated tenant database deletion command', 'delete', 'CONTRACT_READY', 'Engineering', [
    'scripts/delete-tenant.ts',
    'modules/provisioning/src/provision.ts',
  ], true),
  capability('deletion_audit_proof', 'Deletion audit proof in control plane', 'delete', 'CONTRACT_READY', 'Engineering', [
    'modules/provisioning/src/provision.ts',
    'packages/db/control-plane/migrations/0001_init_control_plane.sql',
  ], true),
  capability('negative_auth_tests', 'Negative auth tests for lifecycle workflows', 'shared', 'ROADMAP', 'Engineering', [
    'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  ], true),
];

export function reviewDataLifecycleWorkflowReadiness(
  capabilities: DataLifecycleCapability[] = DATA_LIFECYCLE_WORKFLOW_BASELINE,
): DataLifecycleReadinessReview {
  const readyCapabilities = capabilities.filter(isReady).map((capability) => capability.id);
  const gapCapabilities = capabilities.filter(isGap).map((capability) => capability.id);
  const blockedCapabilities = capabilities.filter(isBlocked).map((capability) => capability.id);
  const customerClaimAllowed = capabilities
    .filter((capability) => capability.requiredForCustomerClaim)
    .every(isReady);

  return {
    decision: lifecycleDecision(blockedCapabilities, customerClaimAllowed),
    customerClaimAllowed,
    readyCapabilities,
    gapCapabilities,
    blockedCapabilities,
    actions: lifecycleActions(capabilities, blockedCapabilities, gapCapabilities),
  };
}

function capability(
  id: DataLifecycleCapabilityId,
  label: string,
  workflow: DataLifecycleCapability['workflow'],
  status: DataLifecycleCapabilityStatus,
  owner: DataLifecycleCapability['owner'],
  evidence: string[],
  requiredForCustomerClaim: boolean,
): DataLifecycleCapability {
  return { id, label, workflow, status, owner, evidence, requiredForCustomerClaim };
}

function isReady(capability: DataLifecycleCapability) {
  return ['READY', 'CONTRACT_READY'].includes(capability.status) && capability.evidence.length > 0;
}

function isGap(capability: DataLifecycleCapability) {
  return ['ROADMAP', 'HOSTED_PROOF_PENDING'].includes(capability.status);
}

function isBlocked(capability: DataLifecycleCapability) {
  return capability.status === 'MISSING_EVIDENCE' || capability.evidence.length === 0;
}

function lifecycleDecision(
  blockedCapabilities: DataLifecycleCapabilityId[],
  customerClaimAllowed: boolean,
): DataLifecycleReadinessReview['decision'] {
  if (blockedCapabilities.length > 0) return 'DO_NOT_CLAIM_CUSTOMER_WORKFLOW_READY';
  return customerClaimAllowed ? 'CUSTOMER_WORKFLOW_READY' : 'CONTRACT_READY_WITH_PRODUCT_GAPS';
}

function lifecycleActions(
  capabilities: DataLifecycleCapability[],
  blockedCapabilities: DataLifecycleCapabilityId[],
  gapCapabilities: DataLifecycleCapabilityId[],
): DataLifecycleReadinessReview['actions'] {
  const actions: DataLifecycleReadinessReview['actions'] = [];
  for (const capability of capabilities) {
    if (blockedCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Attach data lifecycle evidence for ${capability.label}.`,
        evidenceRequired: 'Code, test, migration, hosted run output, approval record, or operator screenshot proving the workflow step.',
      });
      continue;
    }
    if (gapCapabilities.includes(capability.id)) {
      actions.push({
        owner: capability.owner,
        action: `Keep ${capability.label} gap-labeled until product workflow evidence exists.`,
        evidenceRequired: 'Acceptance criteria plus code/test/hosted proof before claiming customer-operable export/delete readiness.',
      });
    }
  }
  return actions;
}
