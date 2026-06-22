#!/usr/bin/env tsx
import path from 'node:path';
import fs from 'node:fs';
import { checkProofDocs } from '../modules/proof/src/checker.js';

/**
 * proof:check — scans the proof/evidence docs for forbidden over-claims and
 * verifies the honesty markers are present. Exits non-zero on any violation.
 *   proof:check [docDir]
 */

const argDir = process.argv[2];
const candidates = [argDir, path.join(process.cwd(), '..', '..', 'docs'), path.join(process.cwd(), 'docs')].filter((d): d is string => !!d && fs.existsSync(d));
const docDir = candidates[0];
if (!docDir) { console.error('No docs directory found. Pass one: proof:check <docDir>'); process.exit(2); }

const r = checkProofDocs(docDir);
console.log(`Scanned ${r.filesScanned.length} proof docs in ${docDir}`);
console.log(r.filesScanned.map((f) => `  · ${f}`).join('\n'));
if (r.violations.length) { console.log('\nFORBIDDEN CLAIMS:'); for (const v of r.violations) console.log(`  ✗ [${v.claim}] ${v.file}: ${v.line}`); }
if (r.missingMarkers.length) { console.log('\nMISSING HONESTY MARKERS:'); for (const m of r.missingMarkers) console.log(`  ! ${m}`); }
console.log(`\nRESULT: ${r.ok && r.missingMarkers.length === 0 ? 'PASS' : 'FAIL'}`);
process.exit(r.ok && r.missingMarkers.length === 0 ? 0 : 1);
