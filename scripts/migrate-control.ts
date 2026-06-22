import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getControlPool, closeAll } from '../packages/db/src/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '../packages/db/control-plane/migrations');

async function main() {
  const pool = getControlPool();
  // Ensure the tracking table exists (bootstrap).
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations_control (
    version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const version = file.replace('.sql', '');
    const done = await pool.query(`SELECT 1 FROM schema_migrations_control WHERE version=$1`, [version]);
    if (done.rowCount && done.rowCount > 0) {
      console.log(`• control: ${version} already applied`);
      continue;
    }
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    await pool.query(`INSERT INTO schema_migrations_control (version) VALUES ($1)`, [version]);
    console.log(`✓ control: applied ${version}`);
  }
  await closeAll();
  console.log('Control-plane migrations complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
