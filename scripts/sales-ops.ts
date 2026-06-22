#!/usr/bin/env tsx
import fs from 'node:fs';
import { scoreFit, type SalesLeadIntake } from '../modules/sales-ops/src/fit.js';
import { proposalReadiness, buildHandoffPack, type ProposalInputs, type HandoffInput } from '../modules/sales-ops/src/proposal.js';
import { intakeSupportIssue, reviewSupport, type SupportIntake } from '../modules/sales-ops/src/support-workflow.js';

/**
 * sales-ops CLI — the sales & support operating system.
 *   sales:score          <intake.json>
 *   sales:proposal-check  <intake.json> <inputs.json>
 *   sales:handoff         <handoff.json>
 *   sales:proposal-draft  <handoff.json>          (prints the manifest/config drafts)
 *   support:intake        <intake.json>
 *   support:review        <issues.json>
 * Pure (no DB). Outputs a clear status + reasons + next action; no secrets, no
 * fake values (missing inputs are explicit placeholders).
 */

const cmd = process.argv[2];
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));

function main(): number {
  if (cmd === 'score') {
    const lead = read(process.argv[3]) as SalesLeadIntake;
    const r = scoreFit(lead);
    console.log(`FIT: ${r.fitCategory} (${r.fitScore}/100)`);
    r.reasons.forEach((x) => console.log(`  + ${x}`));
    r.risks.forEach((x) => console.log(`  ! ${x}`));
    r.expectationResets.forEach((x) => console.log(`  ↺ reset: ${x}`));
    console.log(`  next: ${r.nextAction}`);
    return r.fitCategory === 'bad_fit' ? 1 : 0;
  }
  if (cmd === 'proposal-check') {
    const lead = read(process.argv[3]) as SalesLeadIntake;
    const inputs = read(process.argv[4]) as Partial<ProposalInputs>;
    const r = proposalReadiness(lead, inputs);
    console.log(`PROPOSAL: ${r.status}`);
    if (r.missing.length) console.log(`  missing: ${r.missing.join(', ')}`);
    if (r.blockers.length) console.log(`  blockers: ${r.blockers.join('; ')}`);
    console.log(`  next: ${r.nextAction}`);
    return r.status === 'READY_TO_PROPOSE' ? 0 : 1;
  }
  if (cmd === 'handoff' || cmd === 'proposal-draft') {
    const input = read(process.argv[3]) as HandoffInput;
    const pack = buildHandoffPack(input);
    if (cmd === 'proposal-draft') {
      console.log('# customer-zero config draft\n' + JSON.stringify(pack.customerZeroConfigDraft, null, 2));
      console.log('\n# execution manifest draft\n' + JSON.stringify(pack.executionManifestDraft, null, 2));
      return 0;
    }
    console.log(`HANDOFF: ${pack.status}`);
    pack.setupChecklist.forEach((c) => console.log(`  ${c.status === 'have' ? '✓' : '✗'} ${c.item}`));
    if (pack.ownershipMissing.length) console.log(`  missing owners: ${pack.ownershipMissing.join(', ')}`);
    if (pack.missingCustomerInputs.length) console.log(`  missing inputs: ${pack.missingCustomerInputs.join(', ')}`);
    console.log(`  launch window: ${pack.launchWindowSuggestion}`);
    console.log(`  next: ${pack.nextAction}`);
    return pack.status === 'READY_FOR_SETUP' ? 0 : 1;
  }
  if (cmd === 'support-intake') {
    const intake = read(process.argv[3]) as SupportIntake;
    const r = intakeSupportIssue(intake);
    if (!r.ok) { console.log('REJECTED:'); r.errors.forEach((e) => console.log(`  ✗ ${e}`)); return 1; }
    console.log('ACCEPTED:'); console.log(JSON.stringify(r.record, null, 2));
    return 0;
  }
  if (cmd === 'support-review') {
    const issues = read(process.argv[3]);
    const r = reviewSupport(issues);
    console.log(`counts: ${JSON.stringify(r.counts)}`);
    console.log(`open blockers: ${r.openBlockers.length}`);
    r.openBlockers.forEach((b) => console.log(`  [${b.severity}] ${b.nextAction} (owner: ${b.owner})`));
    console.log(`all critical owned: ${r.allCriticalOwned}`);
    return 0;
  }
  console.error('Commands: score <i> | proposal-check <i> <inp> | handoff <h> | proposal-draft <h> | support-intake <i> | support-review <issues>');
  return 2;
}

process.exit(main());
