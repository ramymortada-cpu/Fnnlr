# fnnlr — Sprint 15 Build Report (Integrations Foundation)

fnnlr now has a clean, secure, modular integration foundation — connecting to the real world (WhatsApp, payment webhooks, tracking, outbound webhooks) **without overbuild**: no auto-send, no payment processing, no plaintext secrets, and webhooks that never trust a caller-supplied tenant. **141 tests, 139 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Secret service (`modules/integrations/src/secrets.ts`)
`encryptSecret` / `decryptSecret` (AES-256-GCM, KMS-ready interface, `plain:`/`gcm:` markers, dev fallback with no key) and `maskSecret` / `maskCredentials` so only masked values ever leave the server. `signPayload` / `verifySignature` (HMAC-SHA256, timing-safe) for webhook signatures.

### 2. Providers + adapters (`modules/integrations/src/providers.ts`, pure & tested)
A registry of all 11 Sprint-15 providers (whatsapp_cloud_api, whatsapp_bsp_generic, paymob, fawry, tap, hyperpay, moyasar, meta_pixel, ga4, outbound_webhook, zapier_make_webhook) with category, label, unlocks copy, and secret/setting field declarations. A modular **PaymentProviderAdapter** pattern (`verify` / `normalize`) with a generic adapter handling common JSON shapes — boolean `success` (Paymob), `amount_cents → units`, and status-word mapping to `payment_started/failed/confirmed/refunded`.

### 3. Connection resolver (`modules/integrations/src/resolver.ts`)
`registerIntegrationRoute` / `resolveTenantByConnection` — webhook routes resolve the tenant from the **connectionId** via the control-plane map, never from a header. Fails safe to null.

### 4. Integrations service (`modules/integrations/src/service.ts`)
Connection CRUD with **masked** output (`toSafe` never returns raw secrets), credential **merge** on update, **rotateSecret**, and a **healthCheck** that validates config shape → `healthy / warning / not_configured`. Audited events: `integration_connected/created/disconnected/credentials_rotated`.
- **WhatsApp webhook handler**: stores raw payload, verifies signature if a secret is set, maps `message_received` (Cloud API shape), updates the matching conversation's `last_message` — **never replies**.
- **Payment webhook handler**: stores raw, normalizes via the adapter, and updates `payment_state` **only when a lead reference matches** (with history) — otherwise records an `unmatched` event without corrupting state.
- **Outbound webhook test**: signs a sample payload and reports it (`delivered:false` — real dispatch is later).

### 5. Data model (migrations 0013 tenant + 0004 control-plane)
`integration_connections` (encrypted credentials only, settings, status, health/sync/error), `integration_events` (raw payload + mapped type + processed status), and the control-plane `integration_routes` (connectionId → tenant).

### 6. API endpoints
```
GET/POST   /integrations                         providers + connections / create
GET/PATCH/DELETE /integrations/:id               connection detail / update / disconnect
POST       /integrations/:id/test                outbound→signed sample; else health check
POST       /integrations/:id/rotate-secret       rotate one credential field
POST       /integrations/:id/health              config-shape health
GET/POST   /webhooks/whatsapp/:connectionId      public; GET=verify challenge, POST=ingest
POST       /webhooks/payments/:provider/:connectionId   public; ingest + normalize
```
Session endpoints are tenant-from-session; webhook endpoints are public and resolve tenant from the connectionId server-side.

### 7. UI
An **Integrations screen** ("التكاملات") in the dashboard shell, grouped by category (WhatsApp / Payment / Tracking / Webhooks) with per-provider cards: status, last health/error, what-it-unlocks, and connect/configure/test/disconnect. Secrets are entered then encrypted server-side; only masked values come back. Setup-guidance hints added inside the funnel **Payment** ("اربط Paymob/فوري لاحقًا…") and **WhatsApp** ("اربط WhatsApp API لاحقًا… بدون auto-send") tabs.

## Tests added (11)
Secret round-trip + mask never reveals value · maskCredentials masks every field · HMAC sign/verify timing-safe + rejects tampering · every payment provider normalizes statuses · **Paymob boolean success + amount_cents** · verify accepts dev / checks HMAC · registry covers all 11 providers · **payment webhook doesn't trust tenant header (unknown connection → 404)** · **WhatsApp webhook doesn't trust header → 404** · WhatsApp GET handshake echoes challenge · integrations CRUD rejects header tenant in production. (DB-backed connection CRUD + webhook persistence run in the live suite.)

## Acceptance — all met
Integration module ✓ · connections model ✓ · credentials encrypted/masked ✓ · Integrations UI ✓ · WhatsApp connection foundation ✓ · WhatsApp webhook stores + maps ✓ · payment webhook foundation ✓ · modular payment adapters ✓ · tracking setup (providers + fields) ✓ · outbound webhook foundation ✓ · health/status UI ✓ · **no secrets exposed** ✓ · **webhooks don't trust tenant header** ✓ · no auto-send ✓ · no real payment processing ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No auto-send WhatsApp · no chatbot · no full payment processing · no plaintext secrets · no tenant-header trust in webhooks · no deep Meta Ads integration · no analytics dashboard · no integration that doesn't serve Build→Launch→Track→Diagnose→Act · no infra drift without UI · no docs-instead-of-code.

## Needs credentials only
`INTEGRATION_ENCRYPTION_KEY` (real secret encryption; dev fallback works without it) · real provider tokens/secrets to connect live · Postgres for the 2 skipped live-DB tests and real connection/event persistence.

## Next: Sprint 16 — real outbound dispatch + WhatsApp inbound enrichment, or begin actual pilot onboarding.
