import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  TRUST_CENTER_REQUIREMENTS,
  findUnsafeTrustCenterClaims,
  reviewTrustCenter,
} from '../modules/proof/src/trust-center-readiness.js';

function trustCenter() {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'TRUST_CENTER_INDEX.md'), 'utf8');
}

test('trust center links every buyer-critical trust proof area', () => {
  const review = reviewTrustCenter(trustCenter());

  assert.equal(review.decision, 'TRUST_CENTER_READY', JSON.stringify(review, null, 2));
  assert.deepEqual(review.missing, []);
  assert.deepEqual(review.unsafeClaims, []);
  assert.equal(review.present.length, TRUST_CENTER_REQUIREMENTS.length);
});

test('trust center includes buyer-safe proof summaries for sales use', () => {
  const review = reviewTrustCenter(trustCenter());

  assert.ok(review.present.includes('buyer_safe_proof_summaries'));
});

test('trust center readiness reports missing proof links', () => {
  const review = reviewTrustCenter('Only SECURITY_TRUST_PROOF.md is linked.');

  assert.equal(review.decision, 'TRUST_CENTER_HAS_GAPS');
  assert.ok(review.missing.includes('data_lifecycle'));
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('DATA_LIFECYCLE.md')));
});

test('trust center readiness blocks unsafe trust claims', () => {
  const unsafe = findUnsafeTrustCenterClaims([
    'GA is approved for every buyer.',
    'SOC 2 certified and enterprise-ready.',
    'The platform has zero security risk.',
  ].join('\n'));

  assert.deepEqual(unsafe.sort(), ['enterprise_ready', 'ga_approved', 'soc2_certified', 'zero_security_risk']);
});

test('trust center permits honest gap-labeled trust language', () => {
  const safe = findUnsafeTrustCenterClaims([
    'GA approval requires hosted evidence.',
    'SOC2 is a roadmap item.',
    'Enterprise readiness is limited until procurement proof closes.',
    'Hosted proof remains pending.',
  ].join('\n'));

  assert.deepEqual(safe, []);
});
