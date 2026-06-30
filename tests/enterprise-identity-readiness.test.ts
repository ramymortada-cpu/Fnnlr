import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENTERPRISE_IDENTITY_BASELINE,
  reviewEnterpriseIdentityReadiness,
  type EnterpriseIdentityRequirement,
} from '../modules/enterprise/src/identity-readiness.js';

test('OIDC identity baseline remains roadmap and cannot be sold as ready', () => {
  const review = reviewEnterpriseIdentityReadiness('oidc');

  assert.equal(review.decision, 'ROADMAP');
  assert.equal(review.customerClaimAllowed, false);
  assert.ok(review.roadmapRequirements.includes('provider_configuration'));
  assert.ok(review.roadmapRequirements.includes('domain_verification'));
  assert.ok(review.roadmapRequirements.includes('audit_events'));
  assert.deepEqual(review.missingRequirements, []);
  assert.ok(review.actions.every((action) => action.evidenceRequired.includes('identity requirement')));
});

test('SAML readiness includes metadata rotation and stays roadmap by default', () => {
  const review = reviewEnterpriseIdentityReadiness('saml');

  assert.equal(review.decision, 'ROADMAP');
  assert.ok(review.roadmapRequirements.includes('metadata_rotation'));
  assert.equal(review.customerClaimAllowed, false);
});

test('identity readiness blocks when required evidence is missing', () => {
  const requirements: EnterpriseIdentityRequirement[] = ENTERPRISE_IDENTITY_BASELINE.map((requirement) =>
    requirement.id === 'domain_verification'
      ? { ...requirement, status: 'MISSING_EVIDENCE', evidence: [] }
      : requirement,
  );

  const review = reviewEnterpriseIdentityReadiness('oidc', requirements);

  assert.equal(review.decision, 'BLOCKED');
  assert.deepEqual(review.missingRequirements, ['domain_verification']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach implementation evidence')));
});

test('OIDC can become pilot-ready only when core identity safety requirements are ready', () => {
  const coreReady = new Set(['provider_configuration', 'domain_verification', 'break_glass_admin', 'audit_events']);
  const requirements: EnterpriseIdentityRequirement[] = ENTERPRISE_IDENTITY_BASELINE.map((requirement) =>
    coreReady.has(requirement.id)
      ? { ...requirement, status: 'READY', evidence: [`evidence/${requirement.id}.md`] }
      : requirement,
  );

  const review = reviewEnterpriseIdentityReadiness('oidc', requirements);

  assert.equal(review.decision, 'PILOT_READY');
  assert.equal(review.customerClaimAllowed, false);
  assert.deepEqual(review.missingRequirements, []);
  assert.ok(review.roadmapRequirements.includes('jit_provisioning'));
  assert.ok(review.roadmapRequirements.includes('role_mapping'));
});

test('identity customer claim is allowed only when every scoped requirement is ready', () => {
  const requirements: EnterpriseIdentityRequirement[] = ENTERPRISE_IDENTITY_BASELINE.map((requirement) => ({
    ...requirement,
    status: 'READY',
    evidence: [`evidence/${requirement.id}.md`],
  }));

  const oidc = reviewEnterpriseIdentityReadiness('oidc', requirements);
  const saml = reviewEnterpriseIdentityReadiness('saml', requirements);

  assert.equal(oidc.decision, 'READY');
  assert.equal(saml.decision, 'READY');
  assert.equal(oidc.customerClaimAllowed, true);
  assert.equal(saml.customerClaimAllowed, true);
});
