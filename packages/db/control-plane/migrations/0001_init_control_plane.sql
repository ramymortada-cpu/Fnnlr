-- ============================================================================
-- CONTROL-PLANE SCHEMA (the only shared database)
-- ----------------------------------------------------------------------------
-- Holds WHO the tenants are and WHERE their dedicated database lives.
-- It NEVER holds raw customer data (leads, conversations, payments, messages).
-- The only cross-tenant data here is ANONYMIZED, AGGREGATED benchmark signals.
-- ============================================================================

-- Tenant types: an individual seller, or an agency (which owns child businesses).
DO $$ BEGIN
  CREATE TYPE tenant_type AS ENUM ('individual', 'agency');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('provisioning', 'active', 'suspended', 'deleting', 'deleted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- tenants: one row per isolated database.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            tenant_type   NOT NULL,
  status          tenant_status NOT NULL DEFAULT 'provisioning',
  display_name    TEXT          NOT NULL,

  -- Routing: where this tenant's DEDICATED database physically lives.
  db_host         TEXT          NOT NULL,
  db_port         INTEGER       NOT NULL,
  db_name         TEXT          NOT NULL UNIQUE,   -- the physical database name
  db_role         TEXT          NOT NULL,          -- the dedicated role for this DB
  db_credential   TEXT          NOT NULL,          -- ENCRYPTED connection secret (KMS in prod)

  -- Optional residency / region pin (compliance).
  region          TEXT          NOT NULL DEFAULT 'eu-central',

  -- Agency hierarchy: which agency (if any) owns this tenant.
  parent_agency_id UUID         REFERENCES tenants(id) ON DELETE RESTRICT,

  -- Benchmark participation (opt-in only; default OFF preserves the trust promise).
  benchmark_opt_in BOOLEAN      NOT NULL DEFAULT FALSE,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tenants_status      ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_parent      ON tenants(parent_agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_dbname ON tenants(db_name);

-- ----------------------------------------------------------------------------
-- tenant_users: maps a login identity to the tenant(s) it can access.
-- The login/auth layer lives in the control-plane; the DATA lives per-tenant.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'owner',   -- owner | seller | agency_admin
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(email);

-- ----------------------------------------------------------------------------
-- schema_migrations_control: tracks control-plane migration state.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schema_migrations_control (
  version    TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- tenant_migration_status: which tenant DB is on which schema version.
-- Lets the migration runner apply tenant migrations across ALL tenant DBs
-- and know exactly which ones are behind.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant_migration_status (
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  schema_version   TEXT NOT NULL,
  last_migrated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id)
);

-- ----------------------------------------------------------------------------
-- benchmark_aggregates: the ONLY cross-tenant data in the system.
-- Anonymized, aggregated signals pushed from tenant DBs (opt-in tenants only).
-- No tenant_id, no PII — only sector/market buckets and aggregate values.
-- This is what preserves the benchmark MOAT under total isolation.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benchmark_aggregates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector        TEXT NOT NULL,
  market        TEXT NOT NULL,        -- eg | sa | ae | gulf | general
  metric        TEXT NOT NULL,        -- e.g. 'whatsapp_first_reply_seconds'
  bucket_period DATE NOT NULL,        -- e.g. week start
  sample_count  INTEGER NOT NULL,     -- must be >= k for k-anonymity before exposure
  agg_value     NUMERIC NOT NULL,     -- e.g. median reply seconds
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sector, market, metric, bucket_period)
);
CREATE INDEX IF NOT EXISTS idx_benchmarks_lookup
  ON benchmark_aggregates(sector, market, metric, bucket_period);

-- ----------------------------------------------------------------------------
-- control_audit: audit of control-plane actions (provisioning, deletion, access).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS control_audit (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,        -- provision | delete | suspend | access_grant
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_control_audit_tenant ON control_audit(tenant_id);
