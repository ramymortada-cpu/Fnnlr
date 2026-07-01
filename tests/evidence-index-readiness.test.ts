import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  EVIDENCE_INDEX_REQUIREMENTS,
  findUnsafeEvidenceIndexClaims,
  reviewEvidenceIndex,
} from '../modules/proof/src/evidence-index-readiness.js';

function evidenceIndex() {
  return fs.readFileSync(path.join(process.cwd(), 'docs', 'EVIDENCE_INDEX.md'), 'utf8');
}

test('evidence index covers every current moat readiness contract', () => {
  const review = reviewEvidenceIndex(evidenceIndex());

  assert.equal(review.decision, 'EVIDENCE_INDEX_READY', JSON.stringify(review, null, 2));
  assert.deepEqual(review.missing, []);
  assert.deepEqual(review.unsafeClaims, []);
  assert.equal(review.present.length, EVIDENCE_INDEX_REQUIREMENTS.length);
});

test('evidence index readiness reports missing contract links', () => {
  const review = reviewEvidenceIndex('Only SAAS_MOAT_ACTION_PLAN.md is linked.');

  assert.equal(review.decision, 'EVIDENCE_INDEX_HAS_GAPS');
  assert.ok(review.missing.includes('gtm_proof_readiness'));
  assert.ok(review.actions.some((action) => action.evidenceRequired.includes('gtm-readiness.ts')));
});

test('evidence index readiness blocks unsafe ready claims', () => {
  const unsafe = findUnsafeEvidenceIndexClaims('Repeatable pilot is ready. Enterprise-ready for all buyers.');

  assert.deepEqual(unsafe.sort(), ['enterprise_ready', 'repeatable_pilot_ready']);
});

test('evidence index permits gap-labeled readiness language', () => {
  const safe = findUnsafeEvidenceIndexClaims([
    'Repeatable pilot is pending until hosted proof exists.',
    'Enterprise readiness is limited and roadmap-labeled.',
    'GateForge approval requires hosted evidence.',
  ].join('\n'));

  assert.deepEqual(safe, []);
});
