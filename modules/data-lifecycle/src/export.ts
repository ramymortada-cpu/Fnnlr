import crypto from 'node:crypto';

export interface SanitizedTableEvidence {
  table: string;
  rows: number;
}

export interface TenantExportEvidence {
  tenantId: string;
  generatedAt: string;
  tables: SanitizedTableEvidence[];
  sha256: string;
}

export function buildTenantExportEvidence(tenantId: string, tables: SanitizedTableEvidence[], generatedAt = new Date().toISOString()): TenantExportEvidence {
  const sorted = [...tables].sort((a, b) => a.table.localeCompare(b.table));
  const payload = JSON.stringify({ tenantId, generatedAt, tables: sorted });
  return { tenantId, generatedAt, tables: sorted, sha256: crypto.createHash('sha256').update(payload).digest('hex') };
}
