import fs from 'node:fs';

export type HostedSecretsManifest = {
  attestationSecrets: string[];
  runtimeSecrets: string[];
};

export const hostedSecretsManifestPath = 'gateforge-audit/external-attestations/hosted-staging-secrets.manifest.json';

export function loadHostedSecretsManifest(): HostedSecretsManifest {
  const manifest = JSON.parse(fs.readFileSync(hostedSecretsManifestPath, 'utf8')) as HostedSecretsManifest;
  if (!Array.isArray(manifest.attestationSecrets) || !manifest.attestationSecrets.length) {
    throw new Error('hosted secrets manifest must include attestationSecrets');
  }
  if (!Array.isArray(manifest.runtimeSecrets) || !manifest.runtimeSecrets.length) {
    throw new Error('hosted secrets manifest must include runtimeSecrets');
  }
  return manifest;
}
