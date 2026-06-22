import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkCommercialDocs, isCommercialDoc, FORBIDDEN_CLAIMS, REQUIRED_MARKERS } from '../modules/commercial/src/consistency.js';

/**
 * Sprint 43 — commercial consistency. The checker must FAIL on forbidden
 * over-claims and PASS honest, negated copy. When the bundle docs are mounted,
 * it also asserts the real commercial docs are clean.
 */

function writeDocs(dir: string, files: Record<string, string>) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
}

test('isCommercialDoc matches sales/commercial files only', () => {
  assert.ok(isCommercialDoc('COMMERCIAL_PACKAGING.md'));
  assert.ok(isCommercialDoc('SALES_PAGE_COPY.md'));
  assert.ok(isCommercialDoc('CUSTOMER_AGREEMENT_DRAFT.md'));
  assert.ok(!isCommercialDoc('RUNBOOK.md'));
  assert.ok(!isCommercialDoc('fnnlr_Sprint_43_Report.md'));
});

test('the checker FAILS on affirmative forbidden claims', () => {
  const dir = path.join('/tmp', `comm_bad_${Date.now()}`);
  writeDocs(dir, {
    'SALES_PAGE_COPY.md': 'fnnlr offers guaranteed revenue.\nIt will auto-send WhatsApp messages automatically.\nfnnlr processes payments for you.',
  });
  const r = checkCommercialDocs(dir);
  assert.equal(r.ok, false);
  const claims = r.violations.map((v) => v.claim);
  assert.ok(claims.includes('guaranteed_revenue'));
  assert.ok(claims.some((c) => c.includes('auto_send') || c.includes('whatsapp')));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the checker PASSES honest, negated copy (English + Arabic)', () => {
  const dir = path.join('/tmp', `comm_ok_${Date.now()}`);
  writeDocs(dir, {
    'COMMERCIAL_FAQ.md': [
      '**Does fnnlr auto-send WhatsApp messages?**',
      'No. fnnlr does not auto-send. A human sends the messages.',
      'It does not process payments — manual payment state only.',
      'There are no guaranteed results and no guaranteed revenue.',
      'مش بيرسل واتساب تلقائيًا. مفيش ضمان إيراد.',
    ].join('\n'),
    'CUSTOMER_AGREEMENT_DRAFT.md': [
      'Recommendations require manual approval.',
      'The Revenue Desk is evidence-based, built on observed data.',
      'Customer responsibilities include the WhatsApp number and payment instructions.',
    ].join('\n'),
  });
  const r = checkCommercialDocs(dir);
  assert.deepEqual(r.violations, [], JSON.stringify(r.violations));
  assert.equal(r.ok, true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('questions and headings are not treated as claims', () => {
  const dir = path.join('/tmp', `comm_q_${Date.now()}`);
  writeDocs(dir, { 'COMMERCIAL_FAQ.md': '**Does it process payments?**\nNo, it does not.\nهل يضمن مبيعات؟\nلا، مفيش ضمان.' });
  const r = checkCommercialDocs(dir);
  assert.equal(r.ok, true, JSON.stringify(r.violations));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('missing honesty markers are reported', () => {
  const dir = path.join('/tmp', `comm_missing_${Date.now()}`);
  writeDocs(dir, { 'COMMERCIAL_PACKAGING.md': 'fnnlr is a funnel builder for WhatsApp.' });
  const r = checkCommercialDocs(dir);
  // no violations, but several honesty markers absent
  assert.ok(r.missingMarkers.length > 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('the real commercial docs (if mounted) are clean and complete', () => {
  const repo = path.resolve(process.cwd());
  const docDirs = [path.join(repo, '..', '..', 'docs'), path.join(repo, 'docs')].filter((d) => fs.existsSync(d));
  const dir = docDirs.find((d) => fs.readdirSync(d).some((f) => f.endsWith('.md') && isCommercialDoc(f)));
  if (!dir) return; // docs not mounted in this run — skip silently
  const r = checkCommercialDocs(dir);
  assert.deepEqual(r.violations, [], `forbidden claims found: ${JSON.stringify(r.violations)}`);
  assert.deepEqual(r.missingMarkers, [], `missing honesty markers: ${r.missingMarkers.join(', ')}`);
  assert.ok(r.filesScanned.length >= 6, 'expected the full commercial doc set');
});
