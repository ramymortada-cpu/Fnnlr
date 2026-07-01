#!/usr/bin/env tsx
import fs from 'node:fs';

type OpenP0Row = {
  id: string;
  state: string;
  nextCommand?: string;
  unblockEvidence?: string;
};

type MoatStatus = {
  total: number;
  openP0: OpenP0Row[];
};

type OperatorPacket = {
  total: number;
  rows: { id: string; status: string; nextAction?: string }[];
  secrets: unknown[];
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceDumpsIncluded?: boolean;
  };
};

const statusPath = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const packetPath = 'gateforge-audit/run-2026-06-23-1035/50_operator_execution_packet.json';

function fail(message: string): never {
  console.error(`SaaS moat status consistency smoke: FAIL - ${message}`);
  process.exit(1);
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) fail(`missing ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

const status = readJson<MoatStatus>(statusPath);
const packet = readJson<OperatorPacket>(packetPath);
const openP0ById = new Map(status.openP0.map((row) => [row.id, row]));
const packetIds = packet.rows.map((row) => row.id).sort();
const blockedExternalIds = status.openP0
  .filter((row) => row.state === 'BLOCKED_EXTERNAL')
  .map((row) => row.id)
  .sort();
const expectedPacketIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);

if (status.total !== 165) fail(`expected 165 moat actions, found ${status.total}`);
if (!Array.isArray(status.openP0) || status.openP0.length !== 21) {
  fail(`expected 21 open P0 actions, found ${status.openP0?.length ?? 'unknown'}`);
}

for (const row of status.openP0) {
  if (!row.nextCommand) fail(`${row.id} is missing nextCommand`);
  if (!row.unblockEvidence) fail(`${row.id} is missing unblockEvidence`);
}

if (packet.total !== 16 || !Array.isArray(packet.rows) || packet.rows.length !== 16) {
  fail(`operator packet should contain 16 rows, found total=${packet.total}, rows=${packet.rows?.length ?? 'unknown'}`);
}
if (blockedExternalIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`BLOCKED_EXTERNAL ids changed: ${blockedExternalIds.join(',')}`);
}
if (packetIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`operator packet ids changed: ${packetIds.join(',')}`);
}

for (const id of blockedExternalIds) {
  const row = openP0ById.get(id);
  if (!row) fail(`${id} is missing from openP0`);
  if (row.nextCommand !== 'npm run gateforge:operator-execution-packet') {
    fail(`${id} nextCommand should point to operator execution packet`);
  }
  if (!row.unblockEvidence?.includes('50_operator_execution_packet.md')) {
    fail(`${id} unblockEvidence should reference 50_operator_execution_packet.md`);
  }
}

const dependencyExpectations: Record<string, { state: string; nextCommand: string }> = {
  'GF-017': {
    state: 'BLOCKED_BY_SECRET_READINESS',
    nextCommand: 'npm run gateforge:scaffold-local-secrets && npm run gateforge:local-secret-files-check',
  },
  'GF-018': {
    state: 'BLOCKED_BY_HOSTED_ATTESTATION',
    nextCommand: 'npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json',
  },
  'GF-019': {
    state: 'BLOCKED_BY_HOSTED_ATTESTATION',
    nextCommand: 'npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json',
  },
  'GF-021': {
    state: 'BLOCKED_BY_SECRET_READINESS',
    nextCommand: 'npm run gateforge:scaffold-local-secrets && npm run gateforge:local-secret-files-check',
  },
  'GF-022': {
    state: 'BLOCKED_BY_GITHUB_SECRET_READINESS',
    nextCommand: 'npm run gateforge:github-secrets-audit',
  },
};

for (const [id, expectation] of Object.entries(dependencyExpectations)) {
  const row = openP0ById.get(id);
  if (!row) fail(`${id} is missing from openP0`);
  if (row.state !== expectation.state) fail(`${id} state should be ${expectation.state}, found ${row.state}`);
  if (row.nextCommand !== expectation.nextCommand) {
    fail(`${id} nextCommand should be "${expectation.nextCommand}", found "${row.nextCommand}"`);
  }
}

if (!Array.isArray(packet.secrets) || packet.secrets.length < 19) {
  fail(`operator packet should list at least 19 hosted secret file options, found ${packet.secrets?.length ?? 'unknown'}`);
}
if (
  packet.safety?.secretValuesPrinted !== false ||
  packet.safety?.productionMutated !== false ||
  packet.safety?.sourceDumpsIncluded !== false
) {
  fail('operator packet safety flags are not all false');
}

console.log('SaaS moat status consistency smoke: PASS');
