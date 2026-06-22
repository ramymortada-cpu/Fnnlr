# fnnlr — Sprint 34 Report (Security Hardening)

fnnlr now has a wide security surface — auth, sessions, public pages, tracked redirects, webhooks, integration credentials, internal cron, command execution, and apply handlers. Sprint 34 closes the practical abuse paths **before** any scaling work, so growth doesn't open holes. No new features, no auto-send, no payment processing, no tenant-from-header.

**Result: 357 tests. On real Postgres all 357 pass, 0 skipped. Without a DB, 343 pass and 14 skip with an explicit reason. Typecheck clean.**

## 1. Rate limiting (`modules/security/src/rate-limit.ts`)

A pure, in-memory sliding-window limiter with a lockout window, keyed per dimension. Wired in:
- **Login** — limited per IP *and* per IP+email, so neither a single IP nor a targeted email can be hammered. A successful login resets the counter.
- **Signup** — per IP.
- **Public redirect `/r/:code`** and **tracking `/track/page-event`** — per IP, so codes can't be brute-forced and the tracking endpoint can't be flooded.
- **Command bar** — per user, so apply/run can't be spammed.

Every limited response returns `429` with `Retry-After`. (A distributed deployment would back this with Redis; the interface is identical.)

## 2. No user enumeration

Login failure is always the same generic body (`invalid credentials`) whether the email exists, the password is wrong, or the request was rate-limited. The rate-limit response on login deliberately reuses that same message so timing/ър status can't be used to enumerate accounts.

## 3. Session security (already solid, confirmed + tested)

Tokens are hashed (`hashToken`) before storage — the raw token is never persisted or logged. `resolveSession` only accepts a token where `revoked_at IS NULL AND expires_at > now()`. Logout revokes the token (a logged-out token cannot be reused). Login issues a fresh token each time (rotation). All auth responses are `Cache-Control: no-store`.

## 4. Payload size limits

`readBodyLimited` enforces per-route caps (auth 4 KB, tracking 8 KB, command 16 KB, webhook 256 KB, default 64 KB) and returns **413** when exceeded — closing the oversized-payload DoS vector. Proven by an oversized-login test.

## 5. Public route abuse protection

Beyond rate limiting: the tracking endpoint validates the event type against an allow-list (`page_view`, `cta_click`, `form_submit`, …) and rejects anything else with 422. Unknown public codes/slugs and unknown connections return safe 404s. No public route ever trusts a client tenant.

## 6. Webhook fail-closed defaults

- **Unknown payment provider → 400** (provider allow-list).
- **In production, a provider that signs its webhooks but has no secret configured → rejected**, not silently accepted.
- **A configured secret now REQUIRES a valid signature** — a *missing* signature is rejected, not skipped (this closed a real gap in the WhatsApp handler where an empty signature bypassed the check).
- Unknown connectionId → 404; wrong/missing signature → rejected and **audited**.
- Tenant is still always resolved server-side from the connection, never a header.

## 7. Integration credentials safety

Reads never expose secrets: the frontend-safe serializer returns only `credentials_masked` and a `hasWebhookSecret` boolean — never the raw or encrypted secret. Disconnect deletes the connection row (credentials gone) and unregisters the webhook route. Production without an encryption key already fails closed (Sprint 32). A live test proves the create/get responses and the stored row never contain the plaintext, and that disconnect removes everything.

## 8. Command execution abuse prevention

- **Apply-twice is idempotent** — a second apply returns `alreadyApplied`, never re-executes.
- **Apply-after-discard is refused** — a discarded command cannot be applied.
- **Bulk threshold** — a command whose blast radius exceeds 25 objects requires an explicit confirm phrase (`أكّد التنفيذ الجماعي`) or `confirmBulk`.
- **Cross-tenant safety** — a command id from tenant B cannot be applied inside tenant A (separate databases make it a clean "not found"); B's command stays untouched.

## 9. Audit logging (`modules/security/src/audit.ts`)

Sensitive events now land in the tenant's `audit_events` table: command apply/discard, webhook rejected/accepted, integration disconnect, credential changes. Best-effort (an audit failure never breaks the action). Not a SIEM — just enough that a security review can reconstruct what happened.

## 10. Security headers

Every API response carries `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, and a conservative `Content-Security-Policy` with `frame-ancestors 'none'`. Sensitive routes add `Cache-Control: no-store`.

## Tests
- `tests/security-hardening.test.ts` (9): rate-limiter behavior, IP extraction, login rate-limit + no enumeration, security headers, 413 on oversized payload, invalid tracking event, unknown provider, public brute-force limiting.
- Live-DB security tests (5 of the 12-test live suite): discarded-command refusal + apply idempotency + audit, cross-tenant command mutation rejection, integration secret masking + disconnect removal, webhook signature fail-closed (missing + wrong) + audit.
- The Sprint-32 `webhook-security.test.ts` (spoofed header, cron secret) and `production-safety.test.ts` (encryption fail-closed) still pass.

## Acceptance — all met
Auth rate limiting ✓ · public route protection ✓ · webhooks fail-closed ✓ · secrets never leak ✓ · command apply abuse controlled ✓ · bulk strongly confirmed ✓ · cross-tenant mutation rejected ✓ · audit logging expanded ✓ · security headers present ✓ · tests green (357/357 on live DB) ✓ · no new features ✓ · no auto-send ✓ · no payment processing ✓ · no tenant header trust ✓.

## Remaining risks (honest)
- The rate limiter is per-process/in-memory. Behind multiple API instances each node limits independently; a production multi-node deploy should move the counters to Redis (interface unchanged). Documented, not yet wired.
- `x-forwarded-for` is trusted for rate-limiting only (not authz). Behind an untrusted proxy an attacker could rotate the header to dodge IP limits; the per-email login limit still applies, and authz never depends on it. A trusted-proxy allowlist is the proper hardening when the deployment topology is known.
- Provider signature verification is exercised for present/missing/wrong cases with our own HMAC; real per-provider signature fixtures (actual Paymob/Meta samples) should be added when those credentials are available.
- Audit is append-only to `audit_events`; there's no retention/rotation policy yet. Fine at current scale.

## Next: Sprint 35 — Scheduler / Ingestion Scaling (batch the daily/weekly fan-out across many tenants, backpressure on webhook ingestion, idempotent re-runs at scale — building on the idempotency already proven on real Postgres).
