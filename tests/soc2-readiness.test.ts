import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SOC2_READINESS_BASELINE,
  reviewSOC2Readiness,
  type SOC2ControlArea,
} from '../modules/enterprise/src/soc2-readiness.js';

test('SOC2 baseline is an honest readiness roadmap, not a SOC2 claim', () => {
  const review = reviewSOC2Readiness();

  assert.equal(review.decision, 'READINESS_ROADMAP');
  assert.deepEqual(review.evidenceReadyControls, []);
  assert.deepEqual(review.blockedControls, []);
  assert.deepEqual(review.unsupportedClaims, []);
  assert.ok(review.gapControls.includes('availability'));
  assert.ok(review.gapControls.includes('vendor_management'));
  assert.ok(review.actions.every((action) => action.evidenceRequired.includes('Roadmap') || action.evidenceRequired.includes('hosted proof')));
});

test('SOC2 readiness treats missing evidence as a no-claim blocker', () => {
  const controls: SOC2ControlArea[] = SOC2_READINESS_BASELINE.map((control) =>
    control.id === 'monitoring'
      ? { ...control, evidence: [] }
      : control,
  );

  const review = reviewSOC2Readiness(controls);

  assert.equal(review.decision, 'DO_NOT_CLAIM_SOC2');
  assert.deepEqual(review.blockedControls, ['monitoring']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach SOC2 evidence')));
});

test('SOC2 readiness blocks unsupported customer-facing claims', () => {
  const controls: SOC2ControlArea[] = SOC2_READINESS_BASELINE.map((control) =>
    control.id === 'access_control'
      ? { ...control, customerClaimAllowed: true }
      : control,
  );

  const review = reviewSOC2Readiness(controls);

  assert.equal(review.decision, 'DO_NOT_CLAIM_SOC2');
  assert.deepEqual(review.unsupportedClaims, ['access_control']);
  assert.ok(review.actions.some((action) => action.action.includes('Remove SOC2-ready customer claim')));
});

test('SOC2 control library is ready only when every control is evidence-ready', () => {
  const controls: SOC2ControlArea[] = SOC2_READINESS_BASELINE.map((control) => ({
    ...control,
    status: 'EVIDENCE_READY',
    evidence: [`evidence/soc2/${control.id}.md`],
    customerClaimAllowed: true,
  }));

  const review = reviewSOC2Readiness(controls);

  assert.equal(review.decision, 'CONTROL_LIBRARY_READY');
  assert.equal(review.evidenceReadyControls.length, controls.length);
  assert.deepEqual(review.gapControls, []);
  assert.deepEqual(review.blockedControls, []);
  assert.deepEqual(review.unsupportedClaims, []);
});
