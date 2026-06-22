import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, generateToken, hashToken } from '../modules/auth/src/crypto.js';

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
