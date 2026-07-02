export type GateForgeSecretStatus = 'READY' | 'MISSING' | 'EMPTY' | 'PLACEHOLDER' | 'INVALID';

export type GateForgeSecretValidation = {
  status: GateForgeSecretStatus;
  reason?: string;
};

export function validateGateForgeSecretValue(name: string, value: string | null | undefined): GateForgeSecretValidation {
  if (value === null || value === undefined) return { status: 'MISSING' };
  const trimmed = value.trim();
  if (!trimmed) return { status: 'EMPTY' };
  if (isGateForgePlaceholder(trimmed)) return { status: 'PLACEHOLDER' };
  const invalidReason = invalidGateForgeSecretReason(name, trimmed);
  if (invalidReason) return { status: 'INVALID', reason: invalidReason };
  return { status: 'READY' };
}

export function isGateForgePlaceholder(value: string): boolean {
  if (value.includes('REPLACE_WITH_')) return true;
  if (value.includes('USER:PASSWORD@HOST')) return true;
  if (value === 'HOST') return true;
  if (value.startsWith('value-for-')) return true;
  if (value.toLowerCase().includes('placeholder')) return true;
  return false;
}

export function invalidGateForgeSecretReason(name: string, value: string): string | null {
  if (name === 'GATEFORGE_HOSTED_STAGING_ATTESTATION_JSON') return invalidJsonAttestationReason(value);
  if (name === 'GATEFORGE_HOSTED_STAGING_ATTESTATION_B64') return invalidBase64AttestationReason(value);
  if (name === 'CONTROL_PLANE_DATABASE_URL' || name === 'TENANT_DB_ADMIN_URL') return invalidPostgresUrlReason(value);
  if (name === 'TENANT_DB_HOST') return invalidHostReason(value);
  if (name === 'FNNLR_AI_TENANT_DAILY_USD_CAP' || name === 'FNNLR_AI_GLOBAL_DAILY_USD_CAP') return invalidPositiveNumberReason(value);
  if (name === 'SENTRY_DSN') return invalidHttpsUrlReason(value, 'must be an https DSN');
  if (name === 'UPTIME_HEALTHCHECK_URL' || name === 'ALERT_WEBHOOK_URL') return invalidHttpsUrlReason(value, 'must be an https URL');
  if (name === 'ALERT_EMAIL_TO' || name === 'EMAIL_FROM' || name === 'EMAIL_REPLY_TO') return invalidEmailReason(value);
  if (name === 'RESEND_API_KEY') return value.length < 12 ? 'must be a non-trivial provider API key' : null;
  if (name === 'ANTHROPIC_API_KEY') return invalidAnthropicApiKeyReason(value);
  if (name.endsWith('ENCRYPTION_KEY') || name === 'FNNLR_CRON_SECRET') return value.length < 24 ? 'must be at least 24 characters' : null;
  return null;
}

function invalidJsonAttestationReason(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== 'object') return 'must be a JSON object';
    return invalidAttestationPacketReason(parsed);
  } catch {
    return 'must be valid JSON';
  }
}

function invalidBase64AttestationReason(value: string): string | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return 'must be base64 text';
  if (value.length < 24) return 'must be a non-trivial base64 evidence packet';
  let decoded = '';
  try {
    decoded = Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return 'must decode to JSON';
  }
  return invalidJsonAttestationReason(decoded);
}

function invalidAttestationPacketReason(packet: unknown): string | null {
  const candidate = packet as {
    environment?: unknown;
    decisionRequested?: unknown;
    items?: unknown;
  };
  if (candidate.environment !== 'HOSTED_STAGING' && candidate.environment !== 'PRODUCTION_READ_ONLY') {
    return 'must include a valid evidence environment';
  }
  if (candidate.decisionRequested !== 'CONDITIONAL_GO' && candidate.decisionRequested !== 'GO') {
    return 'must request CONDITIONAL_GO or GO';
  }
  if (!Array.isArray(candidate.items)) return 'must include evidence items';
  const requiredIds = [
    'hosted_staging_gateforge_run',
    'provider_webhook_replay_idempotency',
    'monitoring_alerting_proof',
    'hosted_restore_drill',
    'email_deliverability_runtime_proof',
    'legal_commercial_final_approval',
    'admin_mfa_runtime_proof',
    'ai_budget_runtime_proof',
  ];
  const byId = new Map(
    candidate.items
      .filter((item): item is { id: string; status: string } => Boolean(item && typeof item === 'object' && 'id' in item && 'status' in item))
      .map((item) => [item.id, item]),
  );
  for (const id of requiredIds) {
    const item = byId.get(id);
    if (!item) return `must include evidence item ${id}`;
    if (item.status !== 'PASS') return `evidence item ${id} must be PASS`;
  }
  return null;
}

function invalidPostgresUrlReason(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return 'must be a valid postgres URL';
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) return 'must use postgres/postgresql protocol';
  if (!parsed.username || !parsed.password || !parsed.hostname) return 'must include username, password, and host';
  if (isLocalHostname(parsed.hostname)) return 'must target hosted staging, not localhost';
  if (parsed.searchParams.get('sslmode') !== 'require') return 'must require TLS with sslmode=require';
  return null;
}

function invalidHostReason(value: string): string | null {
  if (value.includes('://') || value.includes('@') || value.includes('/')) return 'must be a host only, without protocol, credentials, or path';
  if (!/^[a-zA-Z0-9.-]+$/.test(value)) return 'must contain only host-safe characters';
  if (!value.includes('.')) return 'must look like a real staging host';
  if (isLocalHostname(value)) return 'must target hosted staging, not localhost';
  return null;
}

function invalidPositiveNumberReason(value: string): string | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 'must be a positive number';
  return null;
}

function invalidHttpsUrlReason(value: string, reason: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return reason;
  }
  if (parsed.protocol !== 'https:') return reason;
  if (!parsed.hostname.includes('.')) return reason;
  if (isLocalHostname(parsed.hostname)) return reason;
  return null;
}

function invalidEmailReason(value: string): string | null {
  const angleMatch = value.match(/^.+<([^<>]+)>$/);
  const address = (angleMatch ? angleMatch[1] : value).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return 'must be a valid email address';
  return null;
}

function invalidAnthropicApiKeyReason(value: string): string | null {
  if (!value.startsWith('sk-ant-')) return 'must use an Anthropic API key prefix';
  if (value.length < 20) return 'must be a non-trivial provider API key';
  return null;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '::1';
}
