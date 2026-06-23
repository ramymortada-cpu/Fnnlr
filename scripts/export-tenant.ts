#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import { withTenant, closeAll } from '../packages/db/src/router.js';
import { buildTenantExportEvidence } from '../modules/data-lifecycle/src/export.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function qident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function main() {
  const tenantId = arg('id');
  if (!tenantId) throw new Error('--id=<tenantId> is required');
  const outDir = arg('out') || 'gateforge-audit/data-lifecycle';
  const tables = await withTenant(tenantId, async (c) => {
    const r = await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
    const out: { table: string; rows: number }[] = [];
    for (const row of r.rows) {
      const table = row.tablename as string;
      if (table.startsWith('schema_migrations')) continue;
      const count = await c.query(`SELECT COUNT(*)::int AS n FROM ${qident(table)}`);
      out.push({ table, rows: count.rows[0].n });
    }
    await c.query(
      `INSERT INTO data_lifecycle_events (actor, action, target, status, evidence)
       VALUES ('system','tenant_export','tenant','completed',$1)`,
      [JSON.stringify({ tableCount: out.length })],
    ).catch(() => {});
    return out;
  });
  const evidence = buildTenantExportEvidence(tenantId, tables);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `tenant-export-${tenantId}-${Date.now()}.json`);
  fs.writeFileSync(file, JSON.stringify(evidence, null, 2));
  console.log(`tenant export evidence written: ${file}`);
  console.log(`sha256: ${evidence.sha256}`);
  await closeAll();
}

main().catch(async (e) => { console.error(e); await closeAll().catch(() => {}); process.exit(1); });
