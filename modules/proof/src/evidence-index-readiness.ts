export type EvidenceIndexRequirementId =
  | 'saas_moat_board'
  | 'gtm_proof_readiness'
  | 'pilot_offer_readiness'
  | 'outreach_readiness'
  | 'industry_template_readiness'
  | 'template_performance_readiness'
  | 'operating_cadence_readiness'
  | 'commercial_limit_readiness'
  | 'enterprise_readiness'
  | 'hosted_gap_language';

export type EvidenceIndexReview = {
  decision: 'EVIDENCE_INDEX_READY' | 'EVIDENCE_INDEX_HAS_GAPS' | 'DO_NOT_USE_EVIDENCE_INDEX';
  present: EvidenceIndexRequirementId[];
  missing: EvidenceIndexRequirementId[];
  unsafeClaims: string[];
  actions: Array<{
    owner: 'Engineering' | 'Product' | 'Sales' | 'Support';
    action: string;
    evidenceRequired: string;
  }>;
};

export const EVIDENCE_INDEX_REQUIREMENTS: Array<{
  id: EvidenceIndexRequirementId;
  requiredNeedles: string[];
  owner: EvidenceIndexReview['actions'][number]['owner'];
}> = [
  req('saas_moat_board', ['SAAS_MOAT_ACTION_PLAN.md', 'SAAS_MOAT_ACTION_PLAN.csv'], 'Engineering'),
  req('gtm_proof_readiness', ['modules/proof/src/gtm-readiness.ts', 'tests/gtm-proof-readiness.test.ts'], 'Sales'),
  req('pilot_offer_readiness', ['modules/sales-ops/src/pilot-offer-readiness.ts', 'tests/pilot-offer-readiness.test.ts'], 'Sales'),
  req('outreach_readiness', ['modules/sales-ops/src/outreach-readiness.ts', 'tests/outreach-readiness.test.ts'], 'Sales'),
  req('industry_template_readiness', ['modules/activation/src/industry-template-readiness.ts', 'tests/industry-template-readiness.test.ts'], 'Product'),
  req('template_performance_readiness', ['modules/activation/src/template-performance.ts', 'tests/template-performance.test.ts'], 'Product'),
  req('operating_cadence_readiness', ['modules/operating-room/src/readiness.ts', 'tests/operating-cadence-readiness.test.ts'], 'Support'),
  req('commercial_limit_readiness', ['modules/commercial/src/enforcement-readiness.ts', 'tests/commercial-enforcement-readiness.test.ts'], 'Product'),
  req('enterprise_readiness', ['modules/enterprise/src/readiness.ts', 'tests/enterprise-readiness.test.ts'], 'Engineering'),
  req('hosted_gap_language', ['HOSTED_PROOF_PENDING', 'HUMAN_ATTESTATION_REQUIRED'], 'Engineering'),
];

const UNSAFE_INDEX_CLAIMS: Array<{ id: string; re: RegExp }> = [
  { id: 'repeatable_pilot_ready', re: /repeatable[-\s]?pilot\s+(is\s+)?ready/i },
  { id: 'outreach_ready', re: /repeatable[-\s]?outreach\s+(is\s+)?ready/i },
  { id: 'enterprise_ready', re: /enterprise[-\s]?ready(?!.*(roadmap|gap|not|limited))/i },
  { id: 'ga_approved', re: /GA\s+approved|GateForge\s+approved/i },
];

export function reviewEvidenceIndex(markdown: string): EvidenceIndexReview {
  const present: EvidenceIndexRequirementId[] = [];
  const missing: EvidenceIndexRequirementId[] = [];
  const unsafeClaims = findUnsafeEvidenceIndexClaims(markdown);

  for (const requirement of EVIDENCE_INDEX_REQUIREMENTS) {
    const ok = requirement.requiredNeedles.every((needle) => markdown.includes(needle));
    if (ok) present.push(requirement.id);
    else missing.push(requirement.id);
  }

  return {
    decision: evidenceIndexDecision(missing, unsafeClaims),
    present,
    missing,
    unsafeClaims,
    actions: evidenceIndexActions(missing, unsafeClaims),
  };
}

export function findUnsafeEvidenceIndexClaims(markdown: string) {
  const findings: string[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('| Claim |') || line.startsWith('|---')) continue;
    const negated = /\b(no|not|never|does\s+not|do\s+not|without|cannot|pending|gap|roadmap|limited|until)\b/i.test(line);
    if (negated) continue;
    for (const claim of UNSAFE_INDEX_CLAIMS) {
      if (claim.re.test(line)) findings.push(claim.id);
    }
  }
  return [...new Set(findings)];
}

function req(
  id: EvidenceIndexRequirementId,
  requiredNeedles: string[],
  owner: EvidenceIndexReview['actions'][number]['owner'],
) {
  return { id, requiredNeedles, owner };
}

function evidenceIndexDecision(
  missing: EvidenceIndexRequirementId[],
  unsafeClaims: string[],
): EvidenceIndexReview['decision'] {
  if (unsafeClaims.length > 0) return 'DO_NOT_USE_EVIDENCE_INDEX';
  return missing.length > 0 ? 'EVIDENCE_INDEX_HAS_GAPS' : 'EVIDENCE_INDEX_READY';
}

function evidenceIndexActions(
  missing: EvidenceIndexRequirementId[],
  unsafeClaims: string[],
): EvidenceIndexReview['actions'] {
  const actions: EvidenceIndexReview['actions'] = unsafeClaims.map((claim) => ({
    owner: 'Engineering',
    action: `Remove unsafe evidence-index claim "${claim}".`,
    evidenceRequired: 'Replace with hosted-gap, roadmap, human-attestation, or evidence-backed wording.',
  }));

  for (const missingId of missing) {
    const requirement = EVIDENCE_INDEX_REQUIREMENTS.find((candidate) => candidate.id === missingId);
    actions.push({
      owner: requirement?.owner ?? 'Engineering',
      action: `Add missing evidence-index coverage for ${missingId}.`,
      evidenceRequired: requirement?.requiredNeedles.join(', ') ?? 'Required evidence link.',
    });
  }
  return actions;
}
