#!/usr/bin/env tsx
import fs from 'node:fs';
import crypto from 'node:crypto';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = fs.existsSync('package-lock.json') ? JSON.parse(fs.readFileSync('package-lock.json', 'utf8')) : {};
const packages = Object.entries(lock.packages ?? {})
  .filter(([name]) => name && name.startsWith('node_modules/'))
  .map(([name, meta]: [string, any]) => ({
    name: name.replace(/^node_modules\//, ''),
    version: meta.version ?? 'unknown',
    license: meta.license ?? null,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const sbom = {
  bomFormat: 'CycloneDX-lite',
  specVersion: '1.5',
  generatedAt: new Date().toISOString(),
  project: { name: pkg.name, version: pkg.version ?? '0.0.0' },
  components: packages,
};
fs.mkdirSync('gateforge-audit/evidence', { recursive: true });
const out = 'gateforge-audit/evidence/sbom.json';
fs.writeFileSync(out, JSON.stringify(sbom, null, 2));
const sha = crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');
console.log(`SBOM written: ${out}`);
console.log(`sha256: ${sha}`);
