export type SOC2ControlAreaId =
  | 'access_control'
  | 'change_management'
  | 'availability'
  | 'confidentiality'
  | 'incident_response'
  | 'vendor_management'
  | 'monitoring';

export type SOC2ControlStatus =
  | 'EVIDENCE_READY'
  | 'ROADMAP'
  | 'HOSTED_PROOF_PENDING'
  | 'HUMAN_ATTESTATION_REQUIRED'
  | 'MISSING_EVIDENCE';

export type SOC2ControlArea = {
  id: SOC2ControlAreaId;
  label: string;
  status: SOC2ControlStatus;
  owner: 'Engineering' | 'Founder/legal' | 'Operator';
  evidence: string[];
  gap: string;
  customerClaimAllowed: boolean;
};

export type SOC2ReadinessReview = {
  decision: 'CONTROL_LIBRARY_READY' | 'READINESS_ROADMAP' | 'DO_NOT_CLAIM_SOC2';
  evidenceReadyControls: SOC2ControlAreaId[];
  gapControls: SOC2ControlAreaId[];
  blockedControls: SOC2ControlAreaId[];
  unsupportedClaims: SOC2ControlAreaId[];
  actions: Array<{
    owner: SOC2ControlArea['owner'];
    action: string;
    evidenceRequired: string;
  }>;
};

export const SOC2_READINESS_BASELINE: SOC2ControlArea[] = [
  c(
    'access_control',
    'Access control',
    'ROADMAP',
    'Engineering',
    ['tests/route-matrix.test.ts', 'tests/admin-mfa.test.ts', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Enterprise RBAC depth and periodic access review evidence.',
    false,
  ),
  c(
    'change_management',
    'Change management',
    'ROADMAP',
    'Engineering',
    ['.github/workflows/gateforge-ga-evidence.yml', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Formal approval workflow and release signoff trail.',
    false,
  ),
  c(
    'availability',
    'Availability',
    'HOSTED_PROOF_PENDING',
    'Operator',
    ['docs/BACKUP_RESTORE_RUNBOOK.md', 'scripts/deploy-health-gate.ts', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Hosted restore and rollback drill proof.',
    false,
  ),
  c(
    'confidentiality',
    'Confidentiality',
    'HOSTED_PROOF_PENDING',
    'Engineering',
    ['tests/tenant-isolation.test.ts', 'tests/production-safety.test.ts', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Production tenant-isolation and encryption evidence packet.',
    false,
  ),
  c(
    'incident_response',
    'Incident response',
    'HUMAN_ATTESTATION_REQUIRED',
    'Operator',
    ['docs/INCIDENT_RESPONSE_EXERCISE.md', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Completed tabletop drill with dated owner signoff.',
    false,
  ),
  c(
    'vendor_management',
    'Vendor management',
    'HUMAN_ATTESTATION_REQUIRED',
    'Founder/legal',
    ['docs/SUBPROCESSORS.md', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Approved vendor review and subprocessor signoff.',
    false,
  ),
  c(
    'monitoring',
    'Monitoring',
    'HOSTED_PROOF_PENDING',
    'Operator',
    ['docs/OBSERVABILITY_GA_RUNBOOK.md', 'docs/SOC2_READINESS_OUTLINE.md'],
    'Hosted alert proof for errors, uptime, cron, and webhook failures.',
    false,
  ),
];

export function reviewSOC2Readiness(controls: SOC2ControlArea[] = SOC2_READINESS_BASELINE): SOC2ReadinessReview {
  const evidenceReadyControls = controls.filter(isEvidenceReady).map((control) => control.id);
  const blockedControls = controls.filter(isBlocked).map((control) => control.id);
  const gapControls = controls
    .filter((control) =>
      ['ROADMAP', 'HOSTED_PROOF_PENDING', 'HUMAN_ATTESTATION_REQUIRED'].includes(control.status),
    )
    .map((control) => control.id);
  const unsupportedClaims = controls
    .filter((control) => control.customerClaimAllowed && !isEvidenceReady(control))
    .map((control) => control.id);

  return {
    decision: soc2Decision(controls, blockedControls, unsupportedClaims),
    evidenceReadyControls,
    gapControls,
    blockedControls,
    unsupportedClaims,
    actions: soc2Actions(controls, blockedControls, gapControls, unsupportedClaims),
  };
}

function c(
  id: SOC2ControlAreaId,
  label: string,
  status: SOC2ControlStatus,
  owner: SOC2ControlArea['owner'],
  evidence: string[],
  gap: string,
  customerClaimAllowed: boolean,
): SOC2ControlArea {
  return { id, label, status, owner, evidence, gap, customerClaimAllowed };
}

function isEvidenceReady(control: SOC2ControlArea) {
  return control.status === 'EVIDENCE_READY' && control.evidence.length > 0;
}

function isBlocked(control: SOC2ControlArea) {
  return control.status === 'MISSING_EVIDENCE' || control.evidence.length === 0;
}

function soc2Decision(
  controls: SOC2ControlArea[],
  blockedControls: SOC2ControlAreaId[],
  unsupportedClaims: SOC2ControlAreaId[],
): SOC2ReadinessReview['decision'] {
  if (blockedControls.length > 0 || unsupportedClaims.length > 0) return 'DO_NOT_CLAIM_SOC2';
  return controls.every(isEvidenceReady) ? 'CONTROL_LIBRARY_READY' : 'READINESS_ROADMAP';
}

function soc2Actions(
  controls: SOC2ControlArea[],
  blockedControls: SOC2ControlAreaId[],
  gapControls: SOC2ControlAreaId[],
  unsupportedClaims: SOC2ControlAreaId[],
): SOC2ReadinessReview['actions'] {
  const actions: SOC2ReadinessReview['actions'] = [];
  for (const control of controls) {
    if (unsupportedClaims.includes(control.id)) {
      actions.push({
        owner: control.owner,
        action: `Remove SOC2-ready customer claim for ${control.label}.`,
        evidenceRequired: 'Customer-facing collateral changed to roadmap/readiness wording until audit evidence exists.',
      });
      continue;
    }
    if (blockedControls.includes(control.id)) {
      actions.push({
        owner: control.owner,
        action: `Attach SOC2 evidence for ${control.label}.`,
        evidenceRequired: 'File, test, hosted proof, or human attestation proving the control status.',
      });
      continue;
    }
    if (gapControls.includes(control.id)) {
      actions.push({
        owner: control.owner,
        action: `Keep ${control.label} SOC2 gap-labeled: ${control.gap}`,
        evidenceRequired: 'Roadmap, hosted proof, or human attestation before this control can be marked evidence-ready.',
      });
    }
  }
  return actions;
}
