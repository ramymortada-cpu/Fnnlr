import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { getControlPool, resolveTenant, closeAll } from '../packages/db/src/router.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANT_MIGRATIONS_DIR = path.join(__dirname, '../packages/db/tenant/migrations');

/**
 * Apply every pending tenant migration to EVERY active tenant database.
 * This is the operational cost of total isolation — handled once, centrally.
 */
async function main() {
  const control = getControlPool();
  const files = fs.readdirSync(TENANT_MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  const tenants = await control.query(
    `SELECT id FROM tenants WHERE status='active' AND deleted_at IS NULL`,
  );
  console.log(`Applying ${files.length} migration(s) across ${tenants.rowCount} tenant database(s)...`);

  for (const row of tenants.rows) {
    const route = await resolveTenant(row.id);
    if (!route) continue;
    const client = new Client({
      host: route.dbHost, port: route.dbPort, database: route.dbName,
      user: route.dbRole, password: route.dbCredential,
    });
    await client.connect();
    try {
      await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations_tenant (
        version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
      for (const file of files) {
        const version = file.replace('.sql', '');
        const done = await client.query(`SELECT 1 FROM schema_migrations_tenant WHERE version=$1`, [version]);
        if (done.rowCount && done.rowCount > 0) continue;
        const sql = fs.readFileSync(path.join(TENANT_MIGRATIONS_DIR, file), 'utf8');
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations_tenant (version) VALUES ($1)`, [version]);
        console.log(`  ✓ ${route.dbName}: applied ${version}`);
      }
      const latest = files[files.length - 1]?.replace('.sql', '');
      if (latest) {
        await control.query(
          `INSERT INTO tenant_migration_status (tenant_id, schema_version) VALUES ($1,$2)
           ON CONFLICT (tenant_id) DO UPDATE SET schema_version=EXCLUDED.schema_version, last_migrated_at=now()`,
          [row.id, latest],
        );
      }
    } finally {
      await client.end();
    }
  }
  await closeAll();
  console.log('All tenant migrations complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
