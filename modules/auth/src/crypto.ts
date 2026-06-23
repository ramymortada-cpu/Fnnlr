import crypto from 'node:crypto';

/**
 * Auth primitives — dependency-free (node:crypto only).
 * scrypt for passwords, sha256 for session-token lookup hashing.
 */

const SCRYPT_KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, expected] = parts;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  // constant-time compare
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Generate an opaque bearer token + its lookup hash (only the hash is stored). */
export function generateToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20): string {
  const raw = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of raw) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, '').replace(/\s+/g, '').toUpperCase();
  let bits = '';
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('invalid base32 secret');
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, atMs = Date.now(), stepSeconds = 30): string {
  const key = base32Decode(secret);
  const counter = Math.floor(atMs / 1000 / stepSeconds);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(msg).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, atMs = Date.now(), window = 1): boolean {
  const normalized = String(code ?? '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const stepMs = 30_000;
  for (let offset = -window; offset <= window; offset++) {
    const expected = totpCode(secret, atMs + offset * stepMs);
    const a = Buffer.from(expected);
    const b = Buffer.from(normalized);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  return false;
}

function mfaKey(): Buffer | null {
  const k = process.env.AUTH_MFA_ENCRYPTION_KEY || process.env.TENANT_CREDENTIAL_ENCRYPTION_KEY;
  return k ? crypto.createHash('sha256').update(k).digest() : null;
}

export function encryptMfaSecret(secret: string): string {
  const k = mfaKey();
  if (!k) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Refusing to store MFA secret without AUTH_MFA_ENCRYPTION_KEY in production.');
    }
    return `plain:${Buffer.from(secret, 'utf8').toString('base64')}`;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decryptMfaSecret(stored: string): string {
  if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8');
  if (!stored.startsWith('gcm:')) return stored;
  const k = mfaKey();
  if (!k) throw new Error('MFA encryption key not available.');
  const [, ivHex, tagHex, dataHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', k, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(dataHex, 'hex')).toString('utf8') + decipher.final('utf8');
}
