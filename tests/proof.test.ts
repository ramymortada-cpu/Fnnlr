import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkProofDocs, isProofDoc } from '../modules/proof/src/checker.js';

/** Sprint 47 — category proof pack consistency + content checks. */

function writeDocs(dir: string, files: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
}

function docsDir(): string | null {
  const repo = path.resolve(process.cwd());
  const dirs = [path.join(repo, '..', '..', 'docs'), path.join(repo, 'docs')].filter((d) => fs.existsSync(d));
  return dirs.find((d) => fs.readdirSync(d).some((f) => isProofDoc(f))) ?? null;
}

test('isProofDoc matches proof/evidence/competitive docs', () => {
  assert.ok(isProofDoc('PRODUCT_PROOF.md'));
  assert.ok(isProofDoc('EVIDENCE_INDEX.md'));
  assert.ok(isProofDoc('COMPETITIVE_POSITIONING.md'));
  assert.ok(!isProofDoc('RUNBOOK.md'));
});

test('the proof checker catches a fake revenue claim', () => {
  const dir = path.join('/tmp', `proof_rev_${Date.now()}`);
  writeDocs(dir, { 'PRODUCT_PROOF.md': 'fnnlr offers guaranteed revenue to every customer.' });
  const r = checkProofDocs(dir);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.claim === 'guaranteed_revenue'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the proof checker catches an auto-send claim', () => {
  const dir = path.join('/tmp', `proof_as_${Date.now()}`);
  writeDocs(dir, { 'TECHNICAL_PROOF.md': 'It will auto-send WhatsApp messages automatically.' });
  const r = checkProofDocs(dir);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.claim.includes('auto_send') || v.claim.includes('whatsapp')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the proof checker catches a proven-traction claim', () => {
  const dir = path.join('/tmp', `proof_tr_${Date.now()}`);
  writeDocs(dir, { 'INVESTOR_PARTNER_PROOF.md': 'We have proven market traction with thousands of customers.' });
  const r = checkProofDocs(dir);
  assert.equal(r.ok, false);
  assert.ok(r.violations.some((v) => v.claim === 'proven_traction' || v.claim === 'thousands_of_customers'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the proof checker passes honest, negated copy', () => {
  const dir = path.join('/tmp', `proof_ok_${Date.now()}`);
  writeDocs(dir, {
    'PRODUCT_PROOF.md': [
      'fnnlr is evidence-based and built on observed data.',
      'There is no guaranteed revenue and no fake revenue.',
      'It does not auto-send WhatsApp. It does not process payments — manual payment only.',
      'Mutating actions require human approval.',
      'Known limitations and remaining risks are listed.',
      'Validated with live DB tests (test:pg) against real Postgres.',
      'Customer responsibilities are explicit.',
    ].join('\n\n'),
  });
  const r = checkProofDocs(dir);
  assert.deepEqual(r.violations, [], JSON.stringify(r.violations));
  assert.deepEqual(r.missingMarkers, []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the evidence index maps claims to tests/modules', () => {
  const dir = docsDir();
  if (!dir) return; // not mounted — skip
  const idx = fs.readFileSync(path.join(dir, 'EVIDENCE_INDEX.md'), 'utf8');
  assert.ok(/tenant isolation/i.test(idx), 'has the isolation claim');
  assert.ok(/no fake revenue/i.test(idx), 'has the no-fake-revenue claim');
  assert.ok(/repeatab/i.test(idx), 'has the repeatability claim');
  assert.ok(/modules\/|packages\/|tests\//.test(idx), 'cites real modules/tests');
  assert.ok(/payment_states\.amount/i.test(idx), 'states the revenue limitation');
});

test('competitive positioning includes competitor strengths (not just bashing)', () => {
  const dir = docsDir();
  if (!dir) return;
  const comp = fs.readFileSync(path.join(dir, 'COMPETITIVE_POSITIONING.md'), 'utf8');
  assert.ok(/stronger/i.test(comp), 'acknowledges where competitors are stronger');
  assert.ok(/HubSpot|ClickFunnels|GoHighLevel|ManyChat|Wati/i.test(comp), 'names real competitors');
});

test('customer proof pack and investor proof include limitations / risks', () => {
  const dir = docsDir();
  if (!dir) return;
  const cust = fs.readFileSync(path.join(dir, 'CUSTOMER_PROOF_PACK.md'), 'utf8');
  const inv = fs.readFileSync(path.join(dir, 'INVESTOR_PARTNER_PROOF.md'), 'utf8');
  assert.ok(/known limit|honest/i.test(cust), 'customer pack lists limits');
  assert.ok(/remaining risk|honest/i.test(inv), 'investor pack lists remaining risks');
  assert.ok(/no\s+(real\s+)?(customer\s+)?traction|none is fabricated|fabricat/i.test(inv), 'investor pack disclaims fabricated traction');
});

test('the real proof docs (if mounted) pass the checker', () => {
  const dir = docsDir();
  if (!dir) return;
  const r = checkProofDocs(dir);
  assert.deepEqual(r.violations, [], `forbidden claims: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(r.missingMarkers, [], `missing markers: ${r.missingMarkers.join(', ')}`);
  assert.ok(r.filesScanned.length >= 6, 'the full proof set is present');
});
