import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createApiServer } from '../apps/api/src/server.js';
import { logIssue } from '../modules/execution/src/issues.js';

/**
 * Sprint 42 — friction fixes. Output clarity, the P0/P1 owner guard, the support
 * pack route, runbook script verification, and customer-facing safety. The
 * live support-pack smoke runs in the live-DB suite.
 */

test('a P0 issue without an owner is rejected (safety guard)', async () => {
  await assert.rejects(
    () => logIssue('t-noop', 'test', { severity: 'P0', source: 'go-live', evidence: 'x', owner: '' as any, nextAction: 'fix' }),
    /owner/,
  );
});

test('a P1 issue without a next action is rejected', async () => {
  await assert.rejects(
    () => logIssue('t-noop', 'test', { severity: 'P1', source: 'go-live', evidence: 'x', owner: 'platform', nextAction: '' }),
    /next action/,
  );
});

test('runbooks reference only scripts that exist in package.json', () => {
  const repo = path.resolve(process.cwd());
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const scripts = new Set(Object.keys(pkg.scripts ?? {}));
  // docs live one level up from code/fnnlr in the bundle; also check a local docs dir if present
  const docDirs = [path.join(repo, '..', '..', 'docs'), path.join(repo, 'docs')].filter((d) => fs.existsSync(d));
  if (docDirs.length === 0) { return; } // no docs mounted in this run — skip silently
  const missing: string[] = [];
  for (const dir of docDirs) {
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      const text = fs.readFileSync(path.join(dir, file), 'utf8');
      const matches = text.matchAll(/npm run ([a-z0-9:_-]+)/gi);
      for (const m of matches) { const s = m[1]; if (!scripts.has(s)) missing.push(`${file}: ${s}`); }
      // operational runbooks must not PRESCRIBE manual DB edits as a normal path.
      // (the friction inventory is a meta-doc that documents the prohibition.)
      if (!/FRICTION_INVENTORY/i.test(file)) {
        for (const line of text.split('\n')) {
          if (/manual DB (edit|hack)/i.test(line) && /normal/i.test(line) && !/\b(no|not|never|don'?t|forbidden|avoid)\b/i.test(line)) {
            assert.fail(`${file} promotes manual DB edit as a normal path: ${line.trim()}`);
          }
        }
      }
    }
  }
  assert.deepEqual(missing, [], `runbooks reference missing scripts: ${missing.join(', ')}`);
});

function listen(server: http.Server): Promise<number> { return new Promise((r) => server.listen(0, () => r((server.address() as any).port))); }

test('support-pack endpoint is admin-only and rejects header-only tenant in production', async () => {
  const prev = process.env.FNNLR_DEV_MODE; delete process.env.FNNLR_DEV_MODE;
  const server = createApiServer(); const port = await listen(server);
  try {
    const res = await fetch(`http://localhost:${port}/admin/support-pack?funnelId=f1`, { headers: { 'x-tenant-id': 'attacker' } });
    assert.equal(res.status, 401);
  } finally { server.close(); if (prev !== undefined) process.env.FNNLR_DEV_MODE = prev; }
});

test('the desk activation-mode copy explains that no opportunities before data is normal', () => {
  // assert the web copy is present and reassuring (not a failure-sounding empty state)
  const candidates = [path.join(process.cwd(), 'apps', 'web', 'index.html')];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) return;
  const html = fs.readFileSync(file, 'utf8');
  assert.ok(html.includes('وضع التفعيل'), 'activation-mode banner present');
  assert.ok(/طبيعي|مش عطل|مظبوط/.test(html), 'banner reassures the empty state is normal, not a failure');
});
