/**
 * Release environment spec — the single source of truth for every env var fnnlr
 * reads, what it's for, and how it must behave when missing in production.
 * Used by the release-candidate checker and documented in the runbook. PURE.
 */

export type EnvClass = 'required_prod' | 'optional' | 'dev_only';

export interface EnvVar {
  name: string;
  klass: EnvClass;
  purpose: string;
  /** If true, a production process must FAIL CLOSED when this is missing. */
  dangerousIfMissing: boolean;
  failClosedBehavior?: string;
}

export const ENV_SPEC: EnvVar[] = [
  { name: 'NODE_ENV', klass: 'required_prod', purpose: 'Must be "production" in prod; gates fail-closed paths.', dangerousIfMissing: true, failClosedBehavior: 'Without it, fail-closed checks (encryption, dev trust) do not engage.' },
  { name: 'CONTROL_PLANE_DATABASE_URL', klass: 'required_prod', purpose: 'Control-plane Postgres (tenants, auth, sessions, public codes, routes).', dangerousIfMissing: true, failClosedBehavior: 'No control DB → no auth, no tenant resolution. Hard fail.' },
  { name: 'TENANT_DB_ADMIN_URL', klass: 'required_prod', purpose: 'Admin connection used to CREATE per-tenant databases/roles.', dangerousIfMissing: true, failClosedBehavior: 'Provisioning impossible without it.' },
  { name: 'TENANT_DB_HOST', klass: 'required_prod', purpose: 'Host for per-tenant DB connection strings.', dangerousIfMissing: true },
  { name: 'TENANT_DB_PORT', klass: 'optional', purpose: 'Port for per-tenant DB connections (defaults to 5432).', dangerousIfMissing: false },
  { name: 'TENANT_DB_PREFIX', klass: 'optional', purpose: 'Name prefix for provisioned tenant databases.', dangerousIfMissing: false },
  { name: 'TENANT_CREDENTIAL_ENCRYPTION_KEY', klass: 'required_prod', purpose: 'AES key for tenant DB credentials at rest.', dangerousIfMissing: true, failClosedBehavior: 'In production, storing a tenant credential throws if absent (no plaintext).' },
  { name: 'INTEGRATION_ENCRYPTION_KEY', klass: 'required_prod', purpose: 'AES key for integration secrets (webhook/HMAC) at rest.', dangerousIfMissing: true, failClosedBehavior: 'In production, encryptSecret throws if absent (no plaintext credentials).' },
  { name: 'FNNLR_CRON_SECRET', klass: 'required_prod', purpose: 'Shared secret required on /internal/cron/* calls.', dangerousIfMissing: true, failClosedBehavior: 'Cron endpoints reject all calls (401) when unset — jobs cannot run, but nothing is exposed.' },
  { name: 'ANTHROPIC_API_KEY', klass: 'optional', purpose: 'Enables real LLM generation; without it, AI features run in degraded fallback mode.', dangerousIfMissing: false, failClosedBehavior: 'AI outputs are marked degraded; no crash.' },
  { name: 'FNNLR_AI_KILL_SWITCH', klass: 'optional', purpose: 'Emergency AI provider-call kill switch.', dangerousIfMissing: false },
  { name: 'FNNLR_AI_REQUIRE_BUDGET', klass: 'optional', purpose: 'Requires configured AI budget caps before provider calls in production.', dangerousIfMissing: false },
  { name: 'FNNLR_AI_GLOBAL_DAILY_USD_CAP', klass: 'optional', purpose: 'Global daily AI spend cap.', dangerousIfMissing: false },
  { name: 'FNNLR_AI_TENANT_DAILY_USD_CAP', klass: 'optional', purpose: 'Per-tenant daily AI spend cap.', dangerousIfMissing: false },
  { name: 'FNNLR_AI_ESTIMATED_USD_PER_1M_TOKENS', klass: 'optional', purpose: 'Cost estimate used before provider calls.', dangerousIfMissing: false },
  { name: 'AUTH_MFA_ENCRYPTION_KEY', klass: 'optional', purpose: 'Encrypts admin TOTP MFA secrets.', dangerousIfMissing: false },
  { name: 'RESEND_API_KEY', klass: 'optional', purpose: 'Transactional email provider key for staging/GA evidence.', dangerousIfMissing: false },
  { name: 'EMAIL_FROM', klass: 'optional', purpose: 'Transactional email sender identity.', dangerousIfMissing: false },
  { name: 'EMAIL_REPLY_TO', klass: 'optional', purpose: 'Support reply-to for transactional email.', dangerousIfMissing: false },
  { name: 'SENTRY_DSN', klass: 'optional', purpose: 'Production error alerting sink.', dangerousIfMissing: false },
  { name: 'UPTIME_HEALTHCHECK_URL', klass: 'optional', purpose: 'External uptime check target for /health.', dangerousIfMissing: false },
  { name: 'ALERT_EMAIL_TO', klass: 'optional', purpose: 'Ops alert recipient email.', dangerousIfMissing: false },
  { name: 'ALERT_WEBHOOK_URL', klass: 'optional', purpose: 'Ops alert webhook recipient.', dangerousIfMissing: false },
  { name: 'API_PORT', klass: 'optional', purpose: 'Port the API server listens on (default 8787).', dangerousIfMissing: false },
  { name: 'SCHEDULER_INTERVAL_MS', klass: 'optional', purpose: 'In-process scheduler tick interval (if the embedded scheduler is used).', dangerousIfMissing: false },
  { name: 'FNNLR_DISABLE_JOBS', klass: 'optional', purpose: 'Global kill-switch: "true" makes cron endpoints return 503.', dangerousIfMissing: false },
  { name: 'FNNLR_DEV_MODE', klass: 'dev_only', purpose: 'DEV ONLY. Allows x-tenant-id header trust for local testing.', dangerousIfMissing: false, failClosedBehavior: 'MUST be unset/false in production; otherwise the API would trust a client tenant header.' },
];

export interface EnvCheck { name: string; klass: EnvClass; present: boolean; level: 'ok' | 'warn' | 'fail'; message: string; }

/**
 * Validate the current environment against the spec for a given mode.
 * Returns per-var checks; the checker turns these into PASS/FAIL.
 */
export function checkEnv(env: Record<string, string | undefined>): { isProd: boolean; checks: EnvCheck[] } {
  const isProd = env.NODE_ENV === 'production';
  const checks: EnvCheck[] = [];

  for (const v of ENV_SPEC) {
    const present = !!env[v.name] && env[v.name] !== '';
    let level: EnvCheck['level'] = 'ok';
    let message = '';

    if (v.klass === 'required_prod' && isProd && !present) {
      level = 'fail';
      message = `Missing required production var: ${v.purpose}` + (v.failClosedBehavior ? ` (${v.failClosedBehavior})` : '');
    } else if (v.klass === 'optional' && !present) {
      level = 'warn';
      message = `Optional, not set: ${v.purpose}`;
    } else if (v.klass === 'dev_only' && isProd && present && env[v.name] === 'true') {
      level = 'fail';
      message = `DANGEROUS: ${v.name} is enabled in production. ${v.failClosedBehavior ?? ''}`;
    } else if (present) {
      message = 'present';
    } else {
      message = 'not set (ok for this mode)';
    }
    checks.push({ name: v.name, klass: v.klass, present, level, message });
  }
  return { isProd, checks };
}
