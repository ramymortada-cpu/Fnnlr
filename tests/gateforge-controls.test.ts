import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailReadiness } from '../modules/email/src/service.js';
import { observabilityReadiness } from '../modules/observability/src/readiness.js';

test('email readiness is explicit about Resend staging requirements', () => {
  const missing = emailReadiness({});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing.sort(), ['EMAIL_FROM', 'RESEND_API_KEY']);
  const ready = emailReadiness({ RESEND_API_KEY: 'test', EMAIL_FROM: 'fnnlr@example.com' });
  assert.equal(ready.ok, true);
  assert.equal(ready.provider, 'resend');
});

test('observability readiness requires error, uptime, and alert recipient evidence', () => {
  const missing = observabilityReadiness({});
  assert.equal(missing.ok, false);
  assert.ok(missing.missing.includes('SENTRY_DSN'));
  const ready = observabilityReadiness({
    SENTRY_DSN: 'https://example.invalid/1',
    UPTIME_HEALTHCHECK_URL: 'https://status.example.invalid/health',
    ALERT_EMAIL_TO: 'ops@example.com',
  });
  assert.equal(ready.ok, true);
  assert.equal(ready.level, 'ok');
});
