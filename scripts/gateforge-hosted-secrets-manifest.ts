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
  validateSecretList('attestationSecrets', manifest.attestationSecrets);
  validateSecretList('runtimeSecrets', manifest.runtimeSecrets);
  const overlap = manifest.attestationSecrets.filter((name) => manifest.runtimeSecrets.includes(name));
  if (overlap.length) throw new Error(`hosted secrets manifest has overlapping secrets: ${overlap.join(', ')}`);
  return manifest;
}

function validateSecretList(label: string, secrets: string[]) {
  const seen = new Set<string>();
  for (const secret of secrets) {
    if (!/^[A-Z][A-Z0-9_]+$/.test(secret)) {
      throw new Error(`hosted secrets manifest ${label} has invalid secret name: ${secret}`);
    }
    if (seen.has(secret)) throw new Error(`hosted secrets manifest ${label} has duplicate secret: ${secret}`);
    seen.add(secret);
  }
}
