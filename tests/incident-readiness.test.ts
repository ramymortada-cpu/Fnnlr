import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INCIDENT_DRILL_BASELINE,
  reviewIncidentDrillReadiness,
  type IncidentDrillCapability,
} from '../modules/operating-room/src/incident-readiness.js';

test('incident drill baseline is contract-ready with hosted/staging proof gaps', () => {
  const review = reviewIncidentDrillReadiness();

  assert.equal(review.decision, 'CONTRACT_READY_WITH_HOSTED_GAP');
  assert.equal(review.drillClaimAllowed, false);
  assert.ok(review.readyCapabilities.includes('scenario_catalog'));
  assert.ok(review.readyCapabilities.includes('severity_mapping'));
  assert.ok(review.readyCapabilities.includes('mitigation_decision'));
  assert.ok(review.gapCapabilities.includes('hosted_drill_output'));
  assert.deepEqual(review.blockedCapabilities, []);
});

test('incident drill readiness blocks drill-ready claims when evidence is missing', () => {
  const capabilities: IncidentDrillCapability[] = INCIDENT_DRILL_BASELINE.map((capability) =>
    capability.id === 'severity_mapping'
      ? { ...capability, evidence: [] }
      : capability,
  );

  const review = reviewIncidentDrillReadiness(capabilities);

  assert.equal(review.decision, 'DO_NOT_CLAIM_DRILL_READY');
  assert.equal(review.drillClaimAllowed, false);
  assert.deepEqual(review.blockedCapabilities, ['severity_mapping']);
  assert.ok(review.actions.some((action) => action.action.includes('Attach incident drill evidence')));
});

test('incident drill readiness allows drill-ready only when every required capability is evidenced and ready', () => {
  const capabilities: IncidentDrillCapability[] = INCIDENT_DRILL_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/incidents/${capability.id}.md`],
  }));

  const review = reviewIncidentDrillReadiness(capabilities);

  assert.equal(review.decision, 'DRILL_READY');
  assert.equal(review.drillClaimAllowed, true);
  assert.equal(review.readyCapabilities.length, capabilities.length);
  assert.deepEqual(review.gapCapabilities, []);
  assert.deepEqual(review.blockedCapabilities, []);
});

test('incident drill readiness keeps optional future scenarios from blocking the base claim', () => {
  const capabilities: IncidentDrillCapability[] = INCIDENT_DRILL_BASELINE.map((capability) => ({
    ...capability,
    status: 'READY',
    evidence: [`evidence/incidents/${capability.id}.md`],
  }));
  capabilities.push({
    id: 'customer_comm_decision',
    label: 'Public status page update',
    status: 'ROADMAP',
    owner: 'Support',
    evidence: ['docs/INCIDENT_RESPONSE_EXERCISE.md'],
    requiredForDrillClaim: false,
  });

  const review = reviewIncidentDrillReadiness(capabilities);

  assert.equal(review.decision, 'DRILL_READY');
  assert.equal(review.drillClaimAllowed, true);
  assert.ok(review.gapCapabilities.includes('customer_comm_decision'));
});
