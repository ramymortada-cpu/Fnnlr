# Threat Model

Confirmed from repository: main trust boundaries are public browser/webhook traffic, API server, control-plane DB, per-tenant DBs, optional LLM provider, and operational scripts. Evidence: `apps/api/src/server.ts`, `packages/db/src/router.ts`, database migrations, webhook/security tests.

STRIDE summary:
- Spoofing: login/session/webhook secret risks.
- Tampering: tenant-scoped mutations.
- Repudiation: audit_events exist; retention enforcement needs production policy.
- Information disclosure: masking and public route tenant resolution are tested.
- Denial of service: rate limits and batch caps exist; distributed limits not found.
- Elevation of privilege: explicit RBAC is limited.

Top recommendations: live DB CI, RBAC matrix implementation, production secret manager, AI red-team, external penetration test.
