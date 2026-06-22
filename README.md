# fnnlr — Database-Per-Tenant Foundation (BP0-ISO)

**Total physical database isolation.** Every individual seller and every agency gets its **own dedicated PostgreSQL database**. No tenant's query can ever touch another tenant's data, because the database connection itself is different per tenant — isolation is enforced at the infrastructure layer, not just by application code or row-level security.

This is the strongest isolation model possible (stronger than shared-DB + RLS). It is the foundation requested for fnnlr's individual + agency tenants.

---

## Architecture: Control-Plane / Data-Plane

```
                         ┌─────────────────────────────────────┐
                         │        CONTROL-PLANE DB (1)          │
                         │  • tenants registry                  │
                         │  • db connection routing             │
                         │  • agency → child tenant links       │
                         │  • anonymized benchmark aggregates   │
                         │    (NO raw customer data ever)       │
                         └─────────────────────────────────────┘
                                        │ resolves
                                        ▼
   request ──► Tenant Resolver ──► Connection Router ──► correct Tenant DB
                                        │
        ┌───────────────────────────────┼───────────────────────────────┐
        ▼                               ▼                                ▼
 ┌──────────────┐              ┌──────────────┐                ┌──────────────┐
 │ TENANT DB    │              │ TENANT DB    │                │ AGENCY DB     │
 │ seller_001   │              │ seller_002   │                │ agency_001    │
 │ (isolated)   │              │ (isolated)   │                │ + child DBs   │
 └──────────────┘              └──────────────┘                └──────────────┘
```

- **Control-plane DB**: the only shared database. Holds *who* the tenants are and *where* their database lives — never *what's inside* them. Benchmarks live here as anonymized aggregates only, so the cross-tenant moat survives total isolation.
- **Tenant DB**: one dedicated database per individual seller. Physically separate. Holds all of that seller's revenue-journey data (leads, conversations, payments, leaks, AI memory).
- **Agency DB model**: an agency gets its own database; each of its client businesses is either a schema inside the agency DB or its own database (configurable per agency tier). Default here: **database-per-client even under an agency**, for maximum isolation, with the agency DB holding only the agency's own roster + routing.

---

## Why this design

1. **Total isolation** — a bug in application code cannot leak across tenants, because there is no shared connection to leak through.
2. **Moat preserved** — benchmarks are computed from an anonymized aggregate stream into the control-plane, never by querying raw tenant data across tenants.
3. **Per-tenant operations** — backup, restore, export, and *delete* become trivially complete: drop the database, the tenant is gone (true right-to-be-forgotten).
4. **Compliance-ready** — per-tenant encryption keys, region pinning, and data residency become per-database settings.

## Trade-offs (accepted)

- Migrations must run across every tenant DB → solved by the migration runner (`scripts/migrate-all.ts`).
- More databases to operate → solved by automated provisioning + a connection pool registry.
- Cross-tenant analytics needs an aggregation pipeline → solved by the control-plane aggregate stream.

---

## What's in this foundation

| Path | Purpose |
|---|---|
| `packages/db/control-plane/` | Control-plane schema + migrations (tenant registry, routing, aggregates) |
| `packages/db/tenant/` | The per-tenant schema template + migrations (applied to every tenant DB) |
| `packages/db/src/` | Connection router, tenant resolver, pool registry |
| `modules/provisioning/` | Creates a new dedicated DB when a tenant signs up |
| `modules/tenancy/` | Tenant + agency model, resolver middleware |
| `scripts/` | `migrate-all`, `provision-tenant`, `delete-tenant` |
| `tests/` | **Isolation tests** — prove cross-tenant access is impossible |

## Run order
1. `npm install`
2. Set `CONTROL_PLANE_DATABASE_URL` and `TENANT_DB_ADMIN_URL` (a Postgres role that can `CREATE DATABASE`).
3. `npm run migrate:control` — set up the control-plane.
4. `npm run provision -- --type=individual --name="Test Seller"` — creates a dedicated tenant DB.
5. `npm run migrate:all` — apply the tenant schema to every tenant DB.
6. `npm test` — run the isolation proof.
