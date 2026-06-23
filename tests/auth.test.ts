import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, generateToken, hashToken, generateTotpSecret, totpCode, verifyTotp } from '../modules/auth/src/crypto.js';
import { adminMfaRequired, adminMfaSatisfied, type SessionContext } from '../modules/auth/src/service.js';

/**
 * Auth primitive tests — no DB, no network. Prove password hashing and token
 * handling are correct and safe.
 */

test('password hash verifies correctly and rejects wrong password', () => {
  const stored = hashPassword('s3cret-pass');
  assert.equal(verifyPassword('s3cret-pass', stored), true);
  assert.equal(verifyPassword('wrong', stored), false);
});

test('each password hash is salted (different hashes for same password)', () => {
  assert.notEqual(hashPassword('same'), hashPassword('same'));
});

test('malformed stored hash is rejected, not crashed', () => {
  assert.equal(verifyPassword('x', 'garbage'), false);
  assert.equal(verifyPassword('x', ''), false);
});

test('token and its stored hash differ; only the hash is persisted', () => {
  const { token, tokenHash } = generateToken();
  assert.notEqual(token, tokenHash);
  assert.equal(hashToken(token), tokenHash, 'lookup hash is deterministic');
});

test('TOTP code verifies within the current time window and rejects bad codes', () => {
  const secret = generateTotpSecret();
  const at = Date.parse('2026-06-23T10:00:00Z');
  const code = totpCode(secret, at);
  assert.equal(verifyTotp(secret, code, at), true);
  assert.equal(verifyTotp(secret, '000000', at), false);
});

test('production admin routes require MFA-enabled verified sessions', () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const base: SessionContext = {
    userId: 'u', email: 'owner@example.com', workspaceId: 'w', tenantId: 't',
    businessId: null, role: 'owner', mfaEnabled: false, mfaVerified: false,
  };
  assert.equal(adminMfaRequired(base), true);
  assert.equal(adminMfaSatisfied(base), false);
  assert.equal(adminMfaSatisfied({ ...base, mfaEnabled: true, mfaVerified: true }), true);
  process.env.NODE_ENV = prev;
});
