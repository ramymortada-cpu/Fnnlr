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
  byState: Record<string, number>;
  rows: { id: string; executionState: string; priority: string }[];
  openP0: OpenP0Row[];
};

type GateForgeStatus = {
  decision?: {
    state?: string;
  };
  blockers?: {
    openRuntimeSecrets?: string[];
    openAttestationSecrets?: string[];
    openExternalBlockers?: string[];
    externalBlockerProgressCounts?: Record<string, number>;
    externalBlockerReadiness?: {
      localUnreadySecretNames?: string[];
      githubMissingSecretNames?: string[];
    };
  };
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceCodeFixesAppliedByThisCommand?: boolean;
  };
};

type Closeout = {
  status?: string;
  count?: number;
  blockerIds?: string[];
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceDumpsIncluded?: boolean;
  };
};

type Progress = {
  total?: number;
  counts?: Record<string, number>;
  readiness?: {
    localUnreadySecretNames?: string[];
    githubMissingSecretNames?: string[];
  };
  rows?: { id: string; status: string }[];
  safety?: {
    secretValuesPrinted?: boolean;
    productionMutated?: boolean;
    sourceDumpsIncluded?: boolean;
  };
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
const gateForgeStatusPath = 'gateforge-audit/run-2026-06-23-1035/47_ga_unblock_status.json';
const closeoutPath = 'gateforge-audit/run-2026-06-23-1035/48_remaining_external_blocker_closeout.json';
const progressPath = 'gateforge-audit/run-2026-06-23-1035/49_external_blocker_progress.json';
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
const gateForgeStatus = readJson<GateForgeStatus>(gateForgeStatusPath);
const closeout = readJson<Closeout>(closeoutPath);
const progress = readJson<Progress>(progressPath);
const packet = readJson<OperatorPacket>(packetPath);
const openP0ById = new Map(status.openP0.map((row) => [row.id, row]));
const packetIds = packet.rows.map((row) => row.id).sort();
const closeoutIds = [...(closeout.blockerIds || [])].sort();
const progressIds = (progress.rows || []).map((row) => row.id).sort();
const gateForgeOpenExternalIds = [...(gateForgeStatus.blockers?.openExternalBlockers || [])].sort();
const blockedExternalIds = status.openP0
  .filter((row) => row.state === 'BLOCKED_EXTERNAL')
  .map((row) => row.id)
  .sort();
const expectedPacketIds = Array.from({ length: 16 }, (_, index) => `GF-${String(index + 1).padStart(3, '0')}`);

if (status.total !== 165) fail(`expected 165 moat actions, found ${status.total}`);
if (!Array.isArray(status.rows) || status.rows.length !== 165) {
  fail(`status rows should contain 165 records, found ${status.rows?.length ?? 'unknown'}`);
}
const byStateTotal = Object.values(status.byState || {}).reduce((sum, count) => sum + count, 0);
if (byStateTotal !== status.total) fail(`byState totals ${byStateTotal} do not equal total ${status.total}`);
const evidencePresent = status.byState?.EVIDENCE_FILE_PRESENT ?? 0;
if (evidencePresent !== 144) fail(`expected 144 evidence-present actions, found ${evidencePresent}`);
if (!Array.isArray(status.openP0) || status.openP0.length !== 21) {
  fail(`expected 21 open P0 actions, found ${status.openP0?.length ?? 'unknown'}`);
}
if (status.openP0.length !== status.total - evidencePresent) {
  fail(`open P0 count ${status.openP0.length} does not match total-evidencePresent ${status.total - evidencePresent}`);
}

for (const row of status.openP0) {
  if (!row.nextCommand) fail(`${row.id} is missing nextCommand`);
  if (!row.unblockEvidence) fail(`${row.id} is missing unblockEvidence`);
}

if (gateForgeStatus.decision?.state !== 'CANNOT_APPROVE_LOCAL_EVIDENCE') {
  fail(`GateForge status should remain CANNOT_APPROVE_LOCAL_EVIDENCE, found ${gateForgeStatus.decision?.state || 'missing'}`);
}
if (
  gateForgeStatus.safety?.secretValuesPrinted !== false ||
  gateForgeStatus.safety?.productionMutated !== false ||
  gateForgeStatus.safety?.sourceCodeFixesAppliedByThisCommand !== false
) {
  fail('GateForge status safety flags are not all false');
}
if (closeout.status !== 'BLOCKED_EXTERNAL' || closeout.count !== 16) {
  fail(`closeout should report 16 BLOCKED_EXTERNAL rows, found status=${closeout.status}, count=${closeout.count}`);
}
if (progress.total !== 16) fail(`progress board should contain 16 rows, found ${progress.total ?? 'unknown'}`);
if (progress.counts?.LOCAL_SECRET_PENDING !== 16) {
  fail(`progress board should report 16 LOCAL_SECRET_PENDING rows, found ${progress.counts?.LOCAL_SECRET_PENDING ?? 'unknown'}`);
}
if (packet.total !== 16 || !Array.isArray(packet.rows) || packet.rows.length !== 16) {
  fail(`operator packet should contain 16 rows, found total=${packet.total}, rows=${packet.rows?.length ?? 'unknown'}`);
}
if (blockedExternalIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`BLOCKED_EXTERNAL ids changed: ${blockedExternalIds.join(',')}`);
}
if (gateForgeOpenExternalIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`GateForge open external ids changed: ${gateForgeOpenExternalIds.join(',')}`);
}
if (closeoutIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`closeout ids changed: ${closeoutIds.join(',')}`);
}
if (progressIds.join(',') !== expectedPacketIds.join(',')) {
  fail(`progress ids changed: ${progressIds.join(',')}`);
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

const runtimeSecrets = [...(gateForgeStatus.blockers?.openRuntimeSecrets || [])].sort();
const progressLocalUnready = [...(progress.readiness?.localUnreadySecretNames || [])].sort();
const progressGithubMissing = [...(progress.readiness?.githubMissingSecretNames || [])].sort();
const statusLocalUnready = [...(gateForgeStatus.blockers?.externalBlockerReadiness?.localUnreadySecretNames || [])].sort();
const statusGithubMissing = [...(gateForgeStatus.blockers?.externalBlockerReadiness?.githubMissingSecretNames || [])].sort();
if (runtimeSecrets.length !== 11) fail(`expected 11 open runtime secrets, found ${runtimeSecrets.length}`);
if (progressLocalUnready.join(',') !== runtimeSecrets.join(',')) {
  fail('progress local unready secrets do not match GateForge open runtime secrets');
}
if (progressGithubMissing.join(',') !== runtimeSecrets.join(',')) {
  fail('progress GitHub missing secrets do not match GateForge open runtime secrets');
}
if (statusLocalUnready.join(',') !== runtimeSecrets.join(',')) {
  fail('GateForge external readiness local unready secrets do not match open runtime secrets');
}
if (statusGithubMissing.join(',') !== runtimeSecrets.join(',')) {
  fail('GateForge external readiness GitHub missing secrets do not match open runtime secrets');
}

const attestationSecrets = [...(gateForgeStatus.blockers?.openAttestationSecrets || [])].sort();
const expectedAttestationSecrets = ['GATEFORGE_HOSTED_STAGING_ATTESTATION_B64', 'GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON'];
if (attestationSecrets.join(',') !== expectedAttestationSecrets.join(',')) {
  fail(`expected hosted attestation secret options ${expectedAttestationSecrets.join(',')}, found ${attestationSecrets.join(',')}`);
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
  closeout.safety?.secretValuesPrinted !== false ||
  closeout.safety?.productionMutated !== false ||
  closeout.safety?.sourceDumpsIncluded !== false ||
  progress.safety?.secretValuesPrinted !== false ||
  progress.safety?.productionMutated !== false ||
  progress.safety?.sourceDumpsIncluded !== false ||
  packet.safety?.secretValuesPrinted !== false ||
  packet.safety?.productionMutated !== false ||
  packet.safety?.sourceDumpsIncluded !== false
) {
  fail('GateForge external blocker safety flags are not all false');
}

console.log('SaaS moat status consistency smoke: PASS');
