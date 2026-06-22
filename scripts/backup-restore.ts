#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Backup / restore helpers. Thin wrappers over pg_dump / psql. They REFUSE to run
 * without an explicit DB URL, never print the URL or any secret, and the restore
 * verification checks that critical tables exist (no data printed).
 *   db:backup <DATABASE_URL> <outFile>
 *   db:restore-test <DATABASE_URL> <dumpFile>     (restores into the given test DB)
 *   db:verify-restore <DATABASE_URL> <control|tenant>
 */

import { verifyRestore } from '../modules/deployment/src/deploy.js';

const cmd = process.argv[2];

function redact(msg: string): string {
  // never echo a connection string in errors
  return msg.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgres://<redacted>');
}

function requireUrl(url: string | undefined, label: string): string {
  if (!url || !/^postgres(ql)?:\/\//.test(url)) {
    console.error(`Refusing: ${label} requires a valid DATABASE_URL (got none).`);
    process.exit(2);
  }
  return url;
}

function main(): number {
  try {
    if (cmd === 'backup') {
      const url = requireUrl(process.argv[3], 'db:backup');
      const out = process.argv[4] || `backup_${Date.now()}.sql`;
      execFileSync('pg_dump', ['--no-owner', '--no-privileges', '-f', out, url], { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log(`backup written: ${out} (${fs.statSync(out).size} bytes)`);
      return 0;
    }
    if (cmd === 'restore-test') {
      const url = requireUrl(process.argv[3], 'db:restore-test');
      const dump = process.argv[4];
      if (!dump || !fs.existsSync(dump)) { console.error('Refusing: dump file not found.'); return 2; }
      execFileSync('psql', ['-v', 'ON_ERROR_STOP=1', '-f', dump, url], { stdio: ['ignore', 'inherit', 'inherit'] });
      console.log('restore applied to test DB.');
      return 0;
    }
    if (cmd === 'verify-restore') {
      const url = requireUrl(process.argv[3], 'db:verify-restore');
      const kind = (process.argv[4] as 'control' | 'tenant') || 'control';
      const out = execFileSync('psql', ['-At', '-c', "SELECT tablename FROM pg_tables WHERE schemaname='public'", url], { encoding: 'utf8' });
      const tables = out.split('\n').map((s) => s.trim()).filter(Boolean);
      const r = verifyRestore(kind, tables);
      console.log(`RESTORE VERIFY (${kind}): ${r.ok ? 'PASS' : 'FAIL'} — ${tables.length} tables found`);
      if (r.missing.length) console.log(`  missing critical tables: ${r.missing.join(', ')}`);
      return r.ok ? 0 : 1;
    }
    console.error('Commands: backup <url> <out> | restore-test <url> <dump> | verify-restore <url> <control|tenant>');
    return 2;
  } catch (e: any) {
    console.error('backup/restore error:', redact(String(e?.message ?? e)));
    return 1;
  }
}

process.exit(main());
