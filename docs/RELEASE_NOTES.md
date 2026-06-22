# fnnlr — Release Notes (Release Candidate)

Honest scope. No flattery. This is what ships, what's production-safe, what
degrades, and what is deliberately not included.

## What works (production-safe)
- **Database-per-tenant isolation** — every tenant gets a dedicated Postgres
  database; cross-tenant reads/writes are physically impossible. Proven on real
  Postgres (isolation, constraint, transaction, and cross-tenant mutation tests).
- **Auth & sessions** — scrypt password hashing, tokens hashed at rest, logout
  revokes, sessions expire. Login is rate-limited and enumeration-safe.
- **Evidence-based activation** — a real business goes from setup to first live
  revenue signal along a checklist where every step is "done" only when the
  underlying record/event exists. No fake progress.
- **Revenue Desk** — one operating surface; before any real signal it shows
  activation steps, never fabricated opportunities; it switches to live
  operations the moment real data exists.
- **Real-time ingestion** — WhatsApp + payment webhooks and page tracking are
  processed into structured events, leads, and state, with per-event idempotency
  (a redelivered event is not processed twice).
- **Revenue Leak / Opportunity / Recommendation intelligence** — all computed on
  observed data, with learning bounded and honestly confidence-gated.
- **Approval-gated repairs / playbook applications / recommendations** — nothing
  destructive runs without explicit approval; before/after snapshots are stored.
- **Scheduler at scale** — batched, concurrency-capped, failure-isolated fan-out
  with job leases (no duplicate concurrent runs) and idempotent re-runs.
- **Security** — rate limits, payload caps, security headers, webhook fail-closed,
  audit logging on sensitive actions, admin-only support/ops endpoints.
- **Release tooling** — env audit, release checker, health checks, first-customer
  setup script, runbook backed by scripts.

## Degraded without an LLM key
- Funnel/offer/page generation and AI copilots run in a **degraded fallback**
  (clearly marked) without `ANTHROPIC_API_KEY`. The system does not crash; output
  quality is lower until a key is configured.

## Not included / explicit limits
- **No auto-send.** fnnlr never sends a WhatsApp message on its own; it drafts,
  the human sends.
- **No payment processing.** Payment state is **manual** — fnnlr records and
  tracks payment states (e.g. from a webhook or a human marking proof reviewed);
  it does not move money or act as a PSP.
- **WhatsApp requires BSP/webhook configuration.** Inbound processing needs a
  Business API connection and a configured webhook secret; without a secret in
  production, signed webhooks are rejected (fail-closed).
- **Rate limiter is in-process / in-memory.** Behind multiple API instances each
  node limits independently; a multi-node deployment should back the counters
  with Redis (the interface is unchanged).
- **Jobs run in-process.** Fan-out is worker-ready (pure, idempotent leases) but
  is driven by an external scheduler hitting `/internal/cron/*`; there is no
  bundled distributed worker yet.
- **No bundled BI dashboard.** Ops/admin surfaces are minimal triage endpoints,
  not analytics dashboards.
- **Single primary funnel** is assumed for the dashboard activation/desk strips;
  multi-funnel businesses use the portfolio/desk views for the rest.

## Security posture
- Tenant is always resolved server-side; the API never trusts a client
  `x-tenant-id` header in production (and the release checker blocks
  `FNNLR_DEV_MODE=true` in prod).
- Encryption fails closed in production (no plaintext credentials).
- Secrets never appear in health, support, or API responses.

## Test status at release
- Full unit/integration suite green; **live database suite green on real
  Postgres** (isolation, constraints, transactions, idempotency, security,
  scaling, activation, and the end-to-end release smoke path).
- CI should run `npm run test:pg` against the managed Postgres on every deploy.
