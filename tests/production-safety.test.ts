import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptSecret, decryptSecret, maskSecret, encryptCredentials, maskCredentials } from '../modules/integrations/src/secrets.js';

/**
 * Sprint 32 — Production safety for credential handling.
 * In production with no encryption key, storing a secret must FAIL CLOSED
 * (throw) rather than silently persisting plaintext. In dev it falls back to a
 * clearly-marked `plain:` value. Masking never exposes the raw secret.
 */

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) { saved[k] = process.env[k]; if (env[k] === undefined) delete process.env[k]; else process.env[k] = env[k]; }
  try { fn(); } finally { for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } }
}

test('PRODUCTION + missing key → storing a secret throws (fail-closed)', () => {
  withEnv({ NODE_ENV: 'production', INTEGRATION_ENCRYPTION_KEY: undefined, TENANT_CREDENTIAL_ENCRYPTION_KEY: undefined }, () => {
    assert.throws(() => encryptSecret('paymob_hmac_xyz'), /Refusing to store credentials/);
  });
});

test('PRODUCTION + missing key → encryptCredentials also throws', () => {
  withEnv({ NODE_ENV: 'production', INTEGRATION_ENCRYPTION_KEY: undefined, TENANT_CREDENTIAL_ENCRYPTION_KEY: undefined }, () => {
    assert.throws(() => encryptCredentials({ hmac_secret: 'x', api_key: 'y' }), /Refusing to store credentials/);
  });
});

test('DEV + missing key → works with an explicit plain: marker (round-trips)', () => {
  withEnv({ NODE_ENV: 'development', INTEGRATION_ENCRYPTION_KEY: undefined, TENANT_CREDENTIAL_ENCRYPTION_KEY: undefined }, () => {
    const stored = encryptSecret('dev_secret');
    assert.ok(stored.startsWith('plain:'), 'dev fallback is clearly marked');
    assert.equal(decryptSecret(stored), 'dev_secret');
  });
});

test('with a key → AES-GCM round-trips and is NOT plaintext', () => {
  withEnv({ NODE_ENV: 'production', INTEGRATION_ENCRYPTION_KEY: 'a-strong-key-for-tests-0123456789' }, () => {
    const stored = encryptSecret('real_secret_value');
    assert.ok(stored.startsWith('gcm:'), 'encrypted with AES-GCM');
    assert.ok(!stored.includes('real_secret_value'), 'ciphertext does not contain the plaintext');
    assert.equal(decryptSecret(stored), 'real_secret_value');
  });
});

test('masking never exposes the raw secret to any frontend-bound caller', () => {
  withEnv({ INTEGRATION_ENCRYPTION_KEY: 'a-strong-key-for-tests-0123456789' }, () => {
    const stored = encryptSecret('super_secret_token_1234');
    const masked = maskSecret(stored);
    assert.ok(!masked.includes('super_secret_token_1234'), 'masked value hides the secret');
    const maskedCreds = maskCredentials(encryptCredentials({ api_key: 'sk_live_abcdef123456' }));
    assert.ok(!JSON.stringify(maskedCreds).includes('sk_live_abcdef123456'), 'masked creds hide secrets');
  });
});
