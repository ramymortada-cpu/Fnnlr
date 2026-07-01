#!/usr/bin/env tsx
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const runDir = 'gateforge-audit/run-2026-06-23-1035';
const packetIndex = process.argv.indexOf('--packet');
const packetPath =
  packetIndex >= 0 ? process.argv[packetIndex + 1] : 'gateforge-audit/external-attestations/hosted-staging-attestation.json';
const secretDirIndex = process.argv.indexOf('--secret-dir');
const secretDir = secretDirIndex >= 0 ? process.argv[secretDirIndex + 1] : '/tmp/fnnlr-gateforge-secrets';
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : `${runDir}/46_attestation_secret_pack.md`;
const jsonOutIndex = process.argv.indexOf('--json-out');
const jsonOutPath = jsonOutIndex >= 0 ? process.argv[jsonOutIndex + 1] : outPath.replace(/\.md$/, '.json');
const writeB64 = process.argv.includes('--write-b64');
const b64SecretPath = path.join(secretDir, 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64');

function runExternalCheck() {
  const result = spawnSync('npx', ['tsx', 'scripts/gateforge-external-check.ts', packetPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    status: result.status ?? 1,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function unsafePacketReason(raw: string): string | null {
  if (/postgres(?:ql)?:\/\/|sk-[A-Za-z0-9_-]{8,}|private[_-]?key|password|secret=.*|token=.*/i.test(raw)) {
    return 'packet contains unsafe secret-like content';
  }
  return null;
}

function writeReport(status: 'READY' | 'BLOCKED', details: string[]) {
  const generatedAt = new Date().toISOString();
  const b64Written = status === 'READY' && writeB64;
  const payload = {
    generatedAt,
    decision: status,
    packet: packetPath,
    b64TargetFile: b64SecretPath,
    b64FileWritten: b64Written,
    details,
    safety: {
      packetBodyPrinted: false,
      b64SecretValuePrinted: false,
      secretValuesPrinted: false,
      productionMutated: false,
      sourceDumpsIncluded: false,
    },
  };
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = `# GateForge Attestation Secret Pack

Generated: \`${generatedAt}\`

This pack validates the hosted staging attestation packet before it can be encoded as a GitHub Actions secret. It never prints the packet body or base64 secret value.

## Status

- Decision: \`${status}\`
- Packet: \`${packetPath}\`
- B64 target file: \`${b64SecretPath}\`
- B64 file written: \`${b64Written ? 'YES' : 'NO'}\`

## Details

${details.map((detail) => `- ${detail}`).join('\n')}

## Next Command

${status === 'READY' ? '`npm run gateforge:local-secret-files-check` then `npm run gateforge:hosted-readiness-doctor`.' : 'Fix the attestation packet until `npm run gateforge:external-check` passes, then rerun this pack with `-- --write-b64`.'}
`;
  fs.writeFileSync(outPath, body);
  fs.mkdirSync(path.dirname(jsonOutPath), { recursive: true });
  fs.writeFileSync(jsonOutPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function fail(details: string[]): never {
  writeReport('BLOCKED', details);
  console.error('GateForge attestation secret pack: BLOCKED');
  for (const detail of details) console.error(`  - ${detail}`);
  console.error(`  wrote ${outPath}`);
  console.error(`  wrote ${jsonOutPath}`);
  console.error('  No secret values were printed.');
  process.exit(1);
}

if (!fs.existsSync(packetPath)) {
  fail([`packet not found: ${packetPath}`]);
}

const raw = fs.readFileSync(packetPath, 'utf8');
const unsafe = unsafePacketReason(raw);
if (unsafe) fail([unsafe]);

const externalCheck = runExternalCheck();
if (externalCheck.status !== 0) {
  const details = externalCheck.output
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
  fail(details.length ? details : ['external evidence check did not pass']);
}

if (writeB64) {
  fs.mkdirSync(secretDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(secretDir, 0o700);
  fs.writeFileSync(b64SecretPath, `${Buffer.from(raw).toString('base64')}\n`, { mode: 0o600 });
  fs.chmodSync(b64SecretPath, 0o600);
}

writeReport('READY', [
  'external evidence packet passed strict validation',
  writeB64 ? `wrote ${b64SecretPath}` : 'dry run only; pass --write-b64 to write the local B64 secret file',
]);

console.log('GateForge attestation secret pack: READY');
console.log(`  packet: ${packetPath}`);
console.log(`  wrote ${outPath}`);
console.log(`  wrote ${jsonOutPath}`);
if (writeB64) console.log(`  wrote ${b64SecretPath}`);
console.log('  No secret values were printed.');
