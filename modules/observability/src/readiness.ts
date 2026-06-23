export interface ObservabilityReadiness {
  ok: boolean;
  level: 'ok' | 'warn' | 'fail';
  missing: string[];
  checks: string[];
}

export function observabilityReadiness(env: NodeJS.ProcessEnv = process.env): ObservabilityReadiness {
  const missing: string[] = [];
  const checks: string[] = [];
  if (env.SENTRY_DSN) checks.push('error alerting configured');
  else missing.push('SENTRY_DSN');
  if (env.UPTIME_HEALTHCHECK_URL) checks.push('uptime healthcheck configured');
  else missing.push('UPTIME_HEALTHCHECK_URL');
  if (env.ALERT_WEBHOOK_URL || env.ALERT_EMAIL_TO) checks.push('alert recipient configured');
  else missing.push('ALERT_WEBHOOK_URL or ALERT_EMAIL_TO');
  const ok = missing.length === 0;
  return { ok, level: ok ? 'ok' : 'warn', missing, checks };
}
