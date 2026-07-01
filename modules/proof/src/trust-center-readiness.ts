export type TrustCenterRequirementId =
  | 'security_proof'
  | 'tenant_isolation'
  | 'legal_readiness'
  | 'subprocessors'
  | 'security_contact'
  | 'data_lifecycle'
  | 'backup_restore'
  | 'observability'
  | 'incident_response'
  | 'email_deliverability'
  | 'dependency_security'
  | 'support_workflow'
  | 'procurement_packet'
  | 'evidence_index'
  | 'buyer_safe_proof_summaries'
  | 'hosted_gap_language'
  | 'human_attestation_language'
  | 'buyer_safe_commitments';

export type TrustCenterReadinessReview = {
  decision: 'TRUST_CENTER_READY' | 'TRUST_CENTER_HAS_GAPS' | 'DO_NOT_SHARE_TRUST_CENTER';
  present: TrustCenterRequirementId[];
  missing: TrustCenterRequirementId[];
  unsafeClaims: string[];
  actions: Array<{
    owner: 'Engineering' | 'Founder/legal' | 'Support' | 'Sales';
    action: string;
    evidenceRequired: string;
  }>;
};

export const TRUST_CENTER_REQUIREMENTS: Array<{
  id: TrustCenterRequirementId;
  requiredNeedles: string[];
  owner: TrustCenterReadinessReview['actions'][number]['owner'];
}> = [
  req('security_proof', ['SECURITY_TRUST_PROOF.md'], 'Engineering'),
  req('tenant_isolation', ['TECHNICAL_PROOF.md'], 'Engineering'),
  req('legal_readiness', ['LEGAL_READINESS_STATUS.md', 'LEGAL_APPROVAL_TRACKER.md'], 'Founder/legal'),
  req('subprocessors', ['SUBPROCESSORS.md'], 'Founder/legal'),
  req('security_contact', ['SECURITY_CONTACT_AND_DISCLOSURE.md'], 'Engineering'),
  req('data_lifecycle', ['DATA_LIFECYCLE.md'], 'Engineering'),
  req('backup_restore', ['BACKUP_RESTORE_RUNBOOK.md'], 'Engineering'),
  req('observability', ['OBSERVABILITY_GA_RUNBOOK.md'], 'Engineering'),
  req('incident_response', ['INCIDENT_RESPONSE_EXERCISE.md'], 'Support'),
  req('email_deliverability', ['EMAIL_DELIVERABILITY.md'], 'Engineering'),
  req('dependency_security', ['DEPENDENCY_SECURITY.md'], 'Engineering'),
  req('support_workflow', ['SUPPORT_WORKFLOW.md'], 'Support'),
  req('procurement_packet', ['PROCUREMENT_CHECKLIST.md'], 'Sales'),
  req('evidence_index', ['EVIDENCE_INDEX.md'], 'Engineering'),
  req('buyer_safe_proof_summaries', [
    'Buyer-Safe Proof Summaries',
    'Security overview',
    'Retention and deletion',
    'Backup and restore',
    'Incident response',
    'Support workflow',
  ], 'Sales'),
  req('hosted_gap_language', ['HOSTED_PROOF_PENDING'], 'Engineering'),
  req('human_attestation_language', ['HUMAN_ATTESTATION_REQUIRED'], 'Founder/legal'),
  req('buyer_safe_commitments', [
    'does not guarantee revenue',
    'does not process customer payments',
    'does not auto-send WhatsApp',
    'Mutating recommendations require human approval',
  ], 'Sales'),
];

const UNSAFE_TRUST_CENTER_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'ga_approved', re: /GA\s+(is\s+)?approved|GateForge\s+(is\s+)?approved/i },
  { id: 'soc2_certified', re: /SOC\s*2\s+(certified|compliant|ready)/i },
  { id: 'enterprise_ready', re: /enterprise[-\s]?ready(?!.*(roadmap|gap|not|limited|pending|attestation))/i },
  { id: 'zero_security_risk', re: /zero\s+security\s+risk|risk[-\s]?free/i },
  { id: 'guaranteed_revenue', re: /guaranteed\s+revenue/i },
  { id: 'payment_processing_ready', re: /payment\s+processing\s+(is\s+)?ready/i },
];

export function reviewTrustCenter(markdown: string): TrustCenterReadinessReview {
  const present: TrustCenterRequirementId[] = [];
  const missing: TrustCenterRequirementId[] = [];
  const unsafeClaims = findUnsafeTrustCenterClaims(markdown);

  for (const requirement of TRUST_CENTER_REQUIREMENTS) {
    const ok = requirement.requiredNeedles.every((needle) => markdown.includes(needle));
    if (ok) present.push(requirement.id);
    else missing.push(requirement.id);
  }

  return {
    decision: trustCenterDecision(missing, unsafeClaims),
    present,
    missing,
    unsafeClaims,
    actions: trustCenterActions(missing, unsafeClaims),
  };
}

export function findUnsafeTrustCenterClaims(markdown: string) {
  const findings: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('| Area |') || line.startsWith('| ---')) continue;
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|pending|gap|roadmap|limited|until|requires)\b/i.test(line);
    if (negated) continue;
    for (const claim of UNSAFE_TRUST_CENTER_CLAIMS) {
      if (claim.re.test(line)) findings.push(claim.id);
    }
  }
  return [...new Set(findings)];
}

function req(
  id: TrustCenterRequirementId,
  requiredNeedles: string[],
  owner: TrustCenterReadinessReview['actions'][number]['owner'],
) {
  return { id, requiredNeedles, owner };
}

function trustCenterDecision(
  missing: TrustCenterRequirementId[],
  unsafeClaims: string[],
): TrustCenterReadinessReview['decision'] {
  if (unsafeClaims.length > 0) return 'DO_NOT_SHARE_TRUST_CENTER';
  return missing.length > 0 ? 'TRUST_CENTER_HAS_GAPS' : 'TRUST_CENTER_READY';
}

function trustCenterActions(
  missing: TrustCenterRequirementId[],
  unsafeClaims: string[],
): TrustCenterReadinessReview['actions'] {
  const actions: TrustCenterReadinessReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Engineering',
    action: `Remove unsafe trust-center claim "${claim}".`,
    evidenceRequired: 'Replace with hosted-gap, roadmap, human-attestation, or evidence-backed wording.',
  }));

  for (const missingId of missing) {
    const requirement = TRUST_CENTER_REQUIREMENTS.find((candidate) => candidate.id === missingId);
    actions.push({
      owner: requirement?.owner ?? 'Engineering',
      action: `Add missing trust-center coverage for ${missingId}.`,
      evidenceRequired: requirement?.requiredNeedles.join(', ') ?? 'Required trust evidence link.',
    });
  }
  return actions;
}
