-- ============================================================================
-- AUTH & WORKSPACE (control-plane) — Sprint 1
-- ----------------------------------------------------------------------------
-- Auth lives in the control-plane. It maps a login identity to the workspace(s),
-- business(es), and the TENANT DATABASE the session is allowed to touch.
-- The tenant is ALWAYS derived here, server-side — never from a client header.
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A login identity.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT,                 -- scrypt hash; null until set (OTP-first allowed)
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- A workspace groups businesses (an individual has one; an agency has many).
-- It is tied to a tenant (and therefore a tenant database).
CREATE TABLE IF NOT EXISTS workspaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_workspaces_tenant ON workspaces(tenant_id);

-- Which user belongs to which workspace, and with what role.
CREATE TABLE IF NOT EXISTS workspace_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          member_role NOT NULL DEFAULT 'owner',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ws_members_user ON workspace_members(user_id);

-- A business/brand inside a workspace. The id here MATCHES a businesses row
-- inside the tenant DB (same UUID), linking control-plane identity to tenant data.
CREATE TABLE IF NOT EXISTS workspace_businesses (
  id            UUID PRIMARY KEY,     -- equals businesses.id inside the tenant DB
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ws_businesses_ws ON workspace_businesses(workspace_id);

-- Opaque server-side sessions. The session — never the client — carries the
-- identity from which we resolve workspace → business → tenant.
CREATE TABLE IF NOT EXISTS sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash    TEXT NOT NULL UNIQUE,   -- sha256 of the bearer token
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
