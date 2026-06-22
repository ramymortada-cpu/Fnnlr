import { getControlPool } from '../../../packages/db/src/router.js';
import { provisionTenant } from '../../provisioning/src/provision.js';
import { hashPassword, verifyPassword, generateToken, hashToken } from './crypto.js';

/**
 * Auth service (control-plane).
 *
 * The security core of Sprint 1: a request's tenant is resolved from the
 * server-side SESSION, never from a client header. resolveSession() is the only
 * sanctioned way to learn which tenant database a request may touch.
 */

export interface SessionContext {
  userId: string;
  email: string;
  workspaceId: string;
  tenantId: string;        // the isolated tenant DB this session may touch
  businessId: string | null;
  role: 'owner' | 'admin' | 'member';
}

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

/**
 * Sign up: creates a user, provisions a dedicated tenant DB, a workspace, and a
 * default business — then returns a session. This is the full "user → workspace
 * → business → tenant database" chain established server-side.
 */
export async function signup(input: { email: string; password: string; businessName: string; type?: 'individual' | 'agency' }): Promise<{ token: string; ctx: SessionContext }> {
  const control = getControlPool();
  const email = input.email.trim().toLowerCase();

  const exists = await control.query(`SELECT 1 FROM users WHERE email=$1`, [email]);
  if (exists.rowCount) throw new Error('email already registered');

  // 1) user
  const u = await control.query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id`,
    [email, hashPassword(input.password), input.businessName],
  );
  const userId = u.rows[0].id as string;

  // 2) provision a dedicated tenant database (creates a businesses row inside it)
  const tenant = await provisionTenant({
    type: input.type ?? 'individual',
    displayName: input.businessName,
    ownerEmail: email,
  });

  // 3) workspace + membership (owner)
  const w = await control.query(
    `INSERT INTO workspaces (tenant_id, name) VALUES ($1,$2) RETURNING id`,
    [tenant.tenantId, input.businessName],
  );
  const workspaceId = w.rows[0].id as string;
  await control.query(
    `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')`,
    [workspaceId, userId],
  );

  // 4) mirror the tenant's seeded business id into the control-plane mapping
  let businessId: string | null = null;
  try {
    const { withTenant } = await import('../../../packages/db/src/router.js');
    businessId = await withTenant(tenant.tenantId, async (c) => {
      const r = await c.query(`SELECT id, name FROM businesses ORDER BY created_at LIMIT 1`);
      return r.rowCount ? (r.rows[0].id as string) : null;
    });
    if (businessId) {
      await control.query(
        `INSERT INTO workspace_businesses (id, workspace_id, name) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO NOTHING`,
        [businessId, workspaceId, input.businessName],
      );
    }
  } catch { /* business mirror is best-effort */ }

  const token = await createSession(userId);
  return { token, ctx: { userId, email, workspaceId, tenantId: tenant.tenantId, businessId, role: 'owner' } };
}

export async function login(input: { email: string; password: string }): Promise<{ token: string; ctx: SessionContext }> {
  const control = getControlPool();
  const email = input.email.trim().toLowerCase();
  const u = await control.query(`SELECT id, password_hash FROM users WHERE email=$1`, [email]);
  if (!u.rowCount || !u.rows[0].password_hash || !verifyPassword(input.password, u.rows[0].password_hash)) {
    throw new Error('invalid credentials');
  }
  const userId = u.rows[0].id as string;
  await control.query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [userId]);
  const token = await createSession(userId);
  const ctx = await contextForUser(userId);
  return { token, ctx };
}

async function createSession(userId: string): Promise<string> {
  const control = getControlPool();
  const { token, tokenHash } = generateToken();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  await control.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)`,
    [tokenHash, userId, expires],
  );
  return token;
}

/**
 * THE security gate. Given a bearer token, resolve the full session context —
 * including which tenant DB the request may touch. Returns null if invalid,
 * expired, or revoked. A client cannot influence the tenant: it comes from the
 * session row joined to the user's workspace membership.
 */
export async function resolveSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token) return null;
  const control = getControlPool();
  const s = await control.query(
    `SELECT user_id FROM sessions
      WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at > now()`,
    [hashToken(token)],
  );
  if (!s.rowCount) return null;
  return contextForUser(s.rows[0].user_id);
}

async function contextForUser(userId: string): Promise<SessionContext> {
  const control = getControlPool();
  const r = await control.query(
    `SELECT u.email, m.role, w.id AS workspace_id, w.tenant_id
       FROM users u
       JOIN workspace_members m ON m.user_id = u.id
       JOIN workspaces w ON w.id = m.workspace_id
      WHERE u.id = $1
      ORDER BY m.created_at ASC
      LIMIT 1`,
    [userId],
  );
  if (!r.rowCount) throw new Error('user has no workspace');
  const row = r.rows[0];
  const biz = await control.query(
    `SELECT id FROM workspace_businesses WHERE workspace_id=$1 ORDER BY created_at LIMIT 1`,
    [row.workspace_id],
  );
  return {
    userId,
    email: row.email,
    workspaceId: row.workspace_id,
    tenantId: row.tenant_id,
    businessId: biz.rowCount ? (biz.rows[0].id as string) : null,
    role: row.role,
  };
}

export async function logout(token: string): Promise<void> {
  const control = getControlPool();
  await control.query(`UPDATE sessions SET revoked_at=now() WHERE token_hash=$1`, [hashToken(token)]);
}

/** Role gate helper. */
export function requireRole(ctx: SessionContext, allowed: SessionContext['role'][]): boolean {
  return allowed.includes(ctx.role);
}
