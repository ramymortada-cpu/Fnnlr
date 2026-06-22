import { ENV_SPEC } from '../../release/src/env-spec.js';

/**
 * Deployment-ops. Production-readiness surfaces built ON TOP of the existing
 * ENV_SPEC, release checker, and health checks — no parallel truth, no secrets
 * printed, no destructive defaults. PURE where possible; the health gate composes
 * the live health checks.
 */

// ---------------------------------------------------------------------------
// Production env template — generated from ENV_SPEC so it never drifts. Values
// are explanatory placeholders that DO NOT look like real secrets.

const SAFE_PLACEHOLDER: Record<string, string> = {
  NODE_ENV: 'production',
  CONTROL_PLANE_DATABASE_URL: 'postgresql://USER:PASSWORD@HOST:5432/fnnlr_control',
  TENANT_DB_ADMIN_URL: 'postgresql://ADMIN:PASSWORD@HOST:5432/postgres',
  TENANT_DB_HOST: 'your-db-host',
  TENANT_DB_PORT: '5432',
  TENANT_DB_PREFIX: 'fnnlr_tenant_',
  TENANT_CREDENTIAL_ENCRYPTION_KEY: 'CHANGE_ME_32_BYTE_KEY__________!',
  INTEGRATION_ENCRYPTION_KEY: 'CHANGE_ME_32_BYTE_KEY__________!',
  FNNLR_CRON_SECRET: 'CHANGE_ME_RANDOM_LONG_STRING',
  ANTHROPIC_API_KEY: '',
  API_PORT: '8787',
  APP_BASE_URL: 'https://app.your-domain.com',
  API_BASE_URL: 'https://api.your-domain.com',
};

export function renderEnvTemplate(): string {
  const lines: string[] = [
    '# fnnlr — production environment template',
    '# Copy to .env.production and fill real values. NEVER commit real secrets.',
    '# Generated from ENV_SPEC (the single source of truth). Do not hand-edit the var list.',
    '',
  ];
  // include APP_BASE_URL / API_BASE_URL even though they are deployment-level
  const extraUrls = ['APP_BASE_URL', 'API_BASE_URL'];
  for (const name of extraUrls) {
    lines.push(`# ${name}: public base URL used in customer-facing links.`);
    lines.push(`${name}=${SAFE_PLACEHOLDER[name] ?? ''}`, '');
  }
  for (const v of ENV_SPEC) {
    const tag = v.klass === 'required_prod' ? 'REQUIRED in production' : v.klass === 'dev_only' ? 'DEV ONLY — leave unset in production' : 'optional';
    lines.push(`# [${tag}] ${v.purpose}`);
    if (v.failClosedBehavior) lines.push(`#   fail-closed: ${v.failClosedBehavior}`);
    // dev_only vars are shown commented out so they are never accidentally set in prod
    const val = SAFE_PLACEHOLDER[v.name] ?? '';
    lines.push(v.klass === 'dev_only' ? `# ${v.name}=` : `${v.name}=${val}`, '');
  }
  return lines.join('\n');
}

/** The required-var names (for the env-template completeness test). */
export function requiredEnvNames(): string[] {
  return ENV_SPEC.filter((v) => v.klass === 'required_prod').map((v) => v.name);
}

// ---------------------------------------------------------------------------
// Deploy health gate — READY_TO_SERVE / DEGRADED / BLOCKED. Composes live health
// + release checker + ops. No secrets.

export type GateStatus = 'READY_TO_SERVE' | 'DEGRADED' | 'BLOCKED';

export interface HealthGate {
  status: GateStatus;
  checks: { id: string; level: 'ok' | 'warn' | 'fail'; message: string }[];
  blocking: string[];
}

export async function deployHealthGate(): Promise<HealthGate> {
  const checks: HealthGate['checks'] = [];
  const add = (id: string, level: 'ok' | 'warn' | 'fail', message: string) => checks.push({ id, level, message });

  const { fullHealth } = await import('../../release/src/health.js');
  const health = await fullHealth();
  for (const c of health.checks) {
    add(c.name, c.status === 'failed' ? 'fail' : c.status === 'degraded' ? 'warn' : 'ok', `${c.name}: ${c.status}`);
  }

  const { runReleaseChecker } = await import('../../release/src/checker.js');
  const rc = await runReleaseChecker({ probeProvisioning: false }).catch(() => null);
  if (!rc) add('release_checker', 'fail', 'release checker could not run');
  else add('release_checker', rc.pass ? 'ok' : 'fail', rc.pass ? 'release checker passed' : `release checker blocking: ${rc.blocking.map((b) => b.message).slice(0, 2).join('; ')}`);

  // encryption + cron presence (no values printed)
  add('encryption_key', (process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY) ? 'ok' : (process.env.NODE_ENV === 'production' ? 'fail' : 'warn'), 'encryption key present');
  add('cron_secret', process.env.FNNLR_CRON_SECRET ? 'ok' : (process.env.NODE_ENV === 'production' ? 'fail' : 'warn'), 'cron secret present');

  const blocking = checks.filter((c) => c.level === 'fail').map((c) => c.message);
  const status: GateStatus = blocking.length ? 'BLOCKED' : checks.some((c) => c.level === 'warn') ? 'DEGRADED' : 'READY_TO_SERVE';
  return { status, checks, blocking };
}

// ---------------------------------------------------------------------------
// Restore verification — PURE. Given the tables found in a restored DB, verify
// the critical ones exist. Never prints data or secrets.

export const CRITICAL_CONTROL_TABLES = ['tenants', 'users', 'workspaces', 'workspace_members'];
export const CRITICAL_TENANT_TABLES = ['businesses', 'journeys', 'offers', 'pages', 'tracked_links', 'leads', 'payment_states', 'audit_events'];

export function verifyRestore(kind: 'control' | 'tenant', tablesFound: string[]): { ok: boolean; missing: string[] } {
  const required = kind === 'control' ? CRITICAL_CONTROL_TABLES : CRITICAL_TENANT_TABLES;
  const found = new Set(tablesFound);
  const missing = required.filter((t) => !found.has(t));
  return { ok: missing.length === 0, missing };
}
