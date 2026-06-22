import crypto from 'node:crypto';

/**
 * Secret service — encrypt credentials before storing, decrypt only server-side,
 * and expose only masked values to any caller that might reach the frontend.
 *
 * Production should back encryptSecret/decryptSecret with a KMS; this is the
 * interface + a working AES-256-GCM dev implementation. In local/dev with no
 * key set, values are stored with a `plain:` marker so the foundation runs
 * without KMS — and maskSecret still prevents accidental exposure.
 */

function key(): Buffer | null {
  const k = process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
  return k ? crypto.createHash('sha256').update(k).digest() : null;
}

export function encryptSecret(plaintext: string): string {
  const k = key();
  if (!k) {
    // PRODUCTION: never store credentials in plaintext. Fail closed.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to store credentials: INTEGRATION_ENCRYPTION_KEY (or TENANT_CREDENTIAL_ENCRYPTION_KEY) is not set in production.');
    }
    return `plain:${Buffer.from(plaintext, 'utf8').toString('base64')}`; // dev-only fallback, clearly marked
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8');
  if (stored.startsWith('gcm:')) {
    const k = key();
    if (!k) throw new Error('encryption key not available to decrypt');
    const [, ivHex, tagHex, dataHex] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
  }
  return stored; // legacy plaintext (dev only)
}

/** Masked display, e.g. "EAAB••••••3Zd". Never reveals the full secret. */
export function maskSecret(stored: string): string {
  let v = '';
  try { v = decryptSecret(stored); } catch { return '••••••'; }
  if (!v) return '';
  if (v.length <= 6) return '••••••';
  return `${v.slice(0, 4)}••••••${v.slice(-3)}`;
}

/** Encrypt a record of secret fields. */
export function encryptCredentials(creds: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(creds)) if (val) out[k] = encryptSecret(val);
  return out;
}

/** Mask a record of stored (encrypted) secret fields for safe display. */
export function maskCredentials(stored: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(stored || {})) out[k] = maskSecret(val);
  return out;
}

/** HMAC-SHA256 signature for outbound webhook payloads. */
export function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time compare for inbound signature verification. */
export function verifySignature(payload: string, secret: string, provided: string): boolean {
  if (!provided) return false;
  const expected = signPayload(payload, secret);
  const a = Buffer.from(expected); const b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
