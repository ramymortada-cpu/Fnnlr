#!/usr/bin/env tsx
import { runReleaseChecker, renderReport } from '../modules/release/src/checker.js';

/**
 * verify:release-candidate — prints a PASS/FAIL checklist and exits non-zero on
 * any blocking issue. Pass --probe to include a disposable provisioning test.
 */
const probe = process.argv.includes('--probe');
const report = await runReleaseChecker({ probeProvisioning: probe });
console.log(renderReport(report));
process.exit(report.pass ? 0 : 1);
