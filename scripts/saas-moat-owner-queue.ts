#!/usr/bin/env tsx
import fs from 'node:fs';

type MoatRow = {
  id: string;
  phase: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  status: string;
  executionState: string;
  owner: string;
  action: string;
  moat: string;
  evidence: string;
  nextCommand: string;
  unblockEvidence: string;
};

type MoatStatus = {
  generatedAt: string;
  total: number;
  byState: Record<string, number>;
  rows?: MoatRow[];
};

const statusPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const outMd = 'docs/SAAS_MOAT_OWNER_QUEUE.md';
const outCsv = 'docs/SAAS_MOAT_OWNER_QUEUE.csv';
const outJson = 'docs/SAAS_MOAT_OWNER_QUEUE.json';
const checkOnly = process.argv.includes('--check');
const state = 'OWNER_OR_DOC_ACTION_READY';
const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };

function fail(message: string): never {
  console.error(`SaaS moat owner queue: FAIL - ${message}`);
  process.exit(1);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function markdownEscape(value: string) {
  return value.replace(/\|/g, '\\|');
}

function readStatus(): MoatStatus {
  if (!fs.existsSync(statusPath)) fail(`missing ${statusPath}; run npm run moat:status`);
  const parsed = JSON.parse(fs.readFileSync(statusPath, 'utf8')) as MoatStatus;
  if (parsed.total !== 165) fail(`expected 165 status rows, found ${parsed.total}`);
  if (!Array.isArray(parsed.rows) || parsed.rows.length !== 165) {
    fail('status JSON must include 165 row-level execution records; run npm run moat:status');
  }
  return parsed;
}

function queueRows(status: MoatStatus) {
  const rows = status.rows!
    .filter((row) => row.executionState === state)
    .sort((a, b) => {
      const priorityDelta = priorityRank[a.priority] - priorityRank[b.priority];
      if (priorityDelta) return priorityDelta;
      const ownerDelta = a.owner.localeCompare(b.owner);
      if (ownerDelta) return ownerDelta;
      return a.id.localeCompare(b.id);
    });
  const expected = status.byState[state] ?? 0;
  if (expected !== 53) fail(`expected 53 ${state} items from status summary, found ${expected}`);
  if (rows.length !== expected) fail(`summary says ${expected} owner-ready items but row filter found ${rows.length}`);
  for (const row of rows) {
    if (!row.owner.trim()) fail(`${row.id} is missing owner`);
    if (!row.action.trim()) fail(`${row.id} is missing action`);
    if (!row.evidence.trim()) fail(`${row.id} is missing evidence`);
    if (!row.nextCommand.trim()) fail(`${row.id} is missing nextCommand`);
    if (!row.unblockEvidence.trim()) fail(`${row.id} is missing unblockEvidence`);
    if (row.priority === 'P0') fail(`${row.id} is P0 but still owner/doc-ready; P0 should be gated or evidenced separately`);
  }
  return rows;
}

function renderMarkdown(rows: MoatRow[], generatedAt: string) {
  const byOwner = countBy(rows, (row) => row.owner);
  const byPriority = countBy(rows, (row) => row.priority);
  const ownerRows = Object.entries(byOwner)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([owner, count]) => `| ${markdownEscape(owner)} | ${count} |`)
    .join('\n');
  const priorityRows = Object.entries(byPriority)
    .sort(([a], [b]) => priorityRank[a as keyof typeof priorityRank] - priorityRank[b as keyof typeof priorityRank])
    .map(([priority, count]) => `| \`${priority}\` | ${count} |`)
    .join('\n');
  const actionRows = rows
    .map(
      (row, index) =>
        `| ${index + 1} | \`${row.id}\` | \`${row.priority}\` | ${markdownEscape(row.owner)} | ${markdownEscape(row.phase)} | ${markdownEscape(row.action)} | ${markdownEscape(row.evidence)} | \`${markdownEscape(row.nextCommand)}\` |`,
    )
    .join('\n');

  return `# SaaS Moat Owner Execution Queue

Generated: \`${generatedAt}\`

This queue is derived from \`SAAS_MOAT_EXECUTION_STATUS.json\` and includes only actions in \`${state}\`. It is intentionally separate from P0 hosted blockers: external/runtime proof still gates GA, while this queue gives Product, Sales, Support, Legal, Marketing, Leadership, and Finance the next non-code actions that strengthen the global SaaS moat.

## Summary By Owner

| Owner | Actions |
| --- | ---: |
${ownerRows}

## Summary By Priority

| Priority | Actions |
| --- | ---: |
${priorityRows}

## Execution Queue

| # | ID | Priority | Owner | Phase | Action | Evidence required | Next command |
| ---: | --- | --- | --- | --- | --- | --- | --- |
${actionRows}
`;
}

function renderCsv(rows: MoatRow[]) {
  const header = ['rank', 'id', 'priority', 'owner', 'phase', 'action', 'evidence', 'next_command', 'unblock_evidence'];
  const body = rows.map((row, index) =>
    [
      String(index + 1),
      row.id,
      row.priority,
      row.owner,
      row.phase,
      row.action,
      row.evidence,
      row.nextCommand,
      row.unblockEvidence,
    ]
      .map(csvEscape)
      .join(','),
  );
  return `${header.join(',')}\n${body.join('\n')}\n`;
}

function renderJson(rows: MoatRow[], generatedAt: string) {
  return `${JSON.stringify(
    {
      generatedAt,
      source: statusPath,
      executionState: state,
      total: rows.length,
      byOwner: countBy(rows, (row) => row.owner),
      byPriority: countBy(rows, (row) => row.priority),
      rows: rows.map((row, index) => ({
        rank: index + 1,
        id: row.id,
        priority: row.priority,
        owner: row.owner,
        phase: row.phase,
        action: row.action,
        evidence: row.evidence,
        nextCommand: row.nextCommand,
        unblockEvidence: row.unblockEvidence,
      })),
    },
    null,
    2,
  )}\n`;
}

function countBy(rows: MoatRow[], key: (row: MoatRow) => string) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = key(row);
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

const status = readStatus();
const rows = queueRows(status);
const md = renderMarkdown(rows, status.generatedAt);
const csv = renderCsv(rows);
const json = renderJson(rows, status.generatedAt);

if (checkOnly) {
  const currentMd = fs.existsSync(outMd) ? fs.readFileSync(outMd, 'utf8') : '';
  const currentCsv = fs.existsSync(outCsv) ? fs.readFileSync(outCsv, 'utf8') : '';
  const currentJson = fs.existsSync(outJson) ? fs.readFileSync(outJson, 'utf8') : '';
  const normalizeGeneratedAt = (value: string) => value.replace(/Generated: `[^`]+`/, 'Generated: `<timestamp>`');
  const expectedJson = `${JSON.stringify({ ...JSON.parse(json), generatedAt: '<timestamp>' }, null, 2)}\n`;
  const normalizedJson = currentJson ? `${JSON.stringify({ ...JSON.parse(currentJson), generatedAt: '<timestamp>' }, null, 2)}\n` : '';
  if (normalizeGeneratedAt(currentMd) !== normalizeGeneratedAt(md) || currentCsv !== csv || normalizedJson !== expectedJson) {
    fail('generated owner queue is stale; run npm run moat:owner-queue');
  }
  console.log(`SaaS moat owner queue: PASS (${rows.length} owner-ready actions)`);
  process.exit(0);
}

fs.writeFileSync(outMd, md);
fs.writeFileSync(outCsv, csv);
fs.writeFileSync(outJson, json);
console.log(`SaaS moat owner queue: wrote ${outMd}`);
console.log(`SaaS moat owner queue: wrote ${outCsv}`);
console.log(`SaaS moat owner queue: wrote ${outJson}`);
