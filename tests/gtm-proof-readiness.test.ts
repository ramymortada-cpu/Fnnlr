import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CASE_STUDY_PROOF_BASELINE,
  PARTNER_PROGRAM_BASELINE,
  reviewCaseStudyProofReadiness,
  reviewPartnerProgramReadiness,
  type CaseStudyCapabilityId,
  type GTMProofCapability,
  type PartnerProgramCapabilityId,
} from '../modules/proof/src/gtm-readiness.js';

test('partner agency readiness stays contract-ready until hosted pilot evidence exists', () => {
  const review = reviewPartnerProgramReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_HOSTED_GAPS');
  assert.equal(review.publicClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('partner_icp'));
  assert.ok(review.gapCapabilities.includes('hosted_partner_pilot_evidence'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('partner agency readiness blocks public claim when qualification evidence is missing', () => {
  const capabilities: GTMProofCapability<PartnerProgramCapabilityId>[] = PARTNER_PROGRAM_BASELINE.map((capability) =>
    capability.id === 'qualification_criteria'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewPartnerProgramReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_READY');
  assert.deepEqual(review.blockedCapabilities, ['qualification_criteria']);
  assert.ok(review.actions.some((action) => /qualification/i.test(action.action)));
});

test('partner agency readiness allows public claim only when every required capability is fully ready', () => {
  const capabilities: GTMProofCapability<PartnerProgramCapabilityId>[] = PARTNER_PROGRAM_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['partner-pilot-proof.md'],
  }));

  const review = reviewPartnerProgramReadiness(capabilities);

  assert.equal(review.decision, 'PUBLIC_CLAIM_READY');
  assert.equal(review.publicClaimAllowed, true);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('case study proof readiness requires human approval before public claim', () => {
  const review = reviewCaseStudyProofReadiness();

  assert.equal(review.decision, 'HUMAN_ATTESTATION_REQUIRED');
  assert.equal(review.publicClaimAllowed, false);
  assert.ok(review.attestationCapabilities.includes('customer_quote_or_attestation'));
  assert.ok(review.attestationCapabilities.includes('privacy_approval'));
  assert.ok(review.gapCapabilities.includes('hosted_customer_proof_evidence'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('case study proof readiness blocks when metric evidence is missing', () => {
  const capabilities: GTMProofCapability<CaseStudyCapabilityId>[] = CASE_STUDY_PROOF_BASELINE.map((capability) =>
    capability.id === 'metric_evidence'
      ? { ...capability, status: 'MISSING_EVIDENCE' as const, evidence: [] }
      : capability,
  );

  const review = reviewCaseStudyProofReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_READY');
  assert.deepEqual(review.blockedCapabilities, ['metric_evidence']);
  assert.ok(review.actions.some((action) => /metric/i.test(action.action)));
});

test('case study proof readiness allows public claim only after metrics, approval, privacy, and hosted proof are ready', () => {
  const capabilities: GTMProofCapability<CaseStudyCapabilityId>[] = CASE_STUDY_PROOF_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: capability.evidence.length ? capability.evidence : ['customer-proof.md'],
  }));

  const review = reviewCaseStudyProofReadiness(capabilities);

  assert.equal(review.decision, 'PUBLIC_CLAIM_READY');
  assert.equal(review.publicClaimAllowed, true);
  assert.deepEqual(review.attestationCapabilities, []);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});
