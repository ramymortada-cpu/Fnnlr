import { getControlPool, withTenant } from '../../../packages/db/src/router.js';
import { provisionTenant } from '../../provisioning/src/provision.js';
import { hashPassword } from '../../auth/src/crypto.js';
import { validateCustomerConfig, type CustomerConfig } from './config.js';

/**
 * Customer setup runner. Stands up a real customer from a config, IDEMPOTENTLY:
 * re-running must not create a second user / workspace / business / funnel. No
 * demo data — these are real empty records the customer then fills in. Secrets
 * never come from the config (the owner password is passed separately).
 */

export interface SetupResult {
  ok: boolean;
  blocking: string[];
  tenantId: string | null;
  workspaceId: string | null;
  businessId: string | null;
  funnelId: string | null;
  created: { user: boolean; workspace: boolean; business: boolean; funnel: boolean; trackedLink: boolean; paymentMethod: boolean };
  nextAction: string | null;
}

export async function setupCustomerFromConfig(cfg: CustomerConfig, ownerPassword: string, opts: { production?: boolean } = {}): Promise<SetupResult> {
  const created = { user: false, workspace: false, business: false, funnel: false, trackedLink: false, paymentMethod: false };
  const v = validateCustomerConfig(cfg, opts);
  if (!v.ok) {
    return { ok: false, blocking: v.issues.filter((i) => i.level === 'fail').map((i) => `${i.field}: ${i.message}`), tenantId: null, workspaceId: null, businessId: null, funnelId: null, created, nextAction: 'fix the customer config' };
  }

  const control = getControlPool();
  const email = cfg.ownerEmail.trim().toLowerCase();

  // 1) user (reuse by email)
  let userId: string;
  const existingUser = await control.query(`SELECT id FROM users WHERE email=$1`, [email]);
  if (existingUser.rowCount) userId = existingUser.rows[0].id;
  else {
    userId = (await control.query(`INSERT INTO users (email, password_hash, display_name) VALUES ($1,$2,$3) RETURNING id`, [email, hashPassword(ownerPassword), cfg.business.name])).rows[0].id;
    created.user = true;
  }

  // 2) workspace (reuse by owner membership + name)
  let workspaceId: string | null = null;
  let tenantId: string | null = null;
  const existingWs = await control.query(
    `SELECT w.id, w.tenant_id FROM workspaces w
       JOIN workspace_members m ON m.workspace_id=w.id
      WHERE m.user_id=$1 AND w.name=$2 LIMIT 1`, [userId, cfg.workspaceName]);
  if (existingWs.rowCount) { workspaceId = existingWs.rows[0].id; tenantId = existingWs.rows[0].tenant_id; }
  else {
    const tenant = await provisionTenant({ type: 'individual', displayName: cfg.workspaceName });
    tenantId = tenant.tenantId;
    workspaceId = (await control.query(`INSERT INTO workspaces (tenant_id, name) VALUES ($1,$2) RETURNING id`, [tenantId, cfg.workspaceName])).rows[0].id;
    await control.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'owner')`, [workspaceId, userId]);
    created.workspace = true;
  }

  // 3) business (reuse by name within the tenant)
  const businessId = await withTenant(tenantId!, async (c) => {
    const existing = await c.query(`SELECT id FROM businesses WHERE name=$1 AND deleted_at IS NULL LIMIT 1`, [cfg.business.name]);
    if (existing.rowCount) return existing.rows[0].id as string;
    created.business = true;
    return (await c.query(`INSERT INTO businesses (name, market, dialect) VALUES ($1,$2,$3) RETURNING id`, [cfg.business.name, cfg.business.market ?? 'eg', cfg.business.language ?? 'masry'])).rows[0].id as string;
  });

  // 4) funnel (reuse the first; only create if none and config asks)
  const wantFunnel = cfg.createFunnel !== false;
  const funnelId = await withTenant(tenantId!, async (c) => {
    const existing = await c.query(`SELECT id FROM journeys WHERE business_id=$1 AND deleted_at IS NULL ORDER BY created_at LIMIT 1`, [businessId]);
    if (existing.rowCount) return existing.rows[0].id as string;
    if (!wantFunnel) return null;
    created.funnel = true;
    const fid = (await c.query(`INSERT INTO journeys (business_id, name, channel, status) VALUES ($1,$2,'whatsapp','active') RETURNING id`, [businessId, cfg.business.name])).rows[0].id as string;
    // offer shell (empty content the customer fills in — NOT fabricated copy)
    await c.query(`INSERT INTO offers (journey_id, content) VALUES ($1,$2)`, [fid, JSON.stringify({ promise: cfg.offer?.promise ?? '', price: cfg.offer?.price ?? '', package: cfg.offer?.package ?? '' })]);
    // a single blueprint stage shell
    await c.query(`INSERT INTO funnel_stages (journey_id, position, name) VALUES ($1,0,'الوعي')`, [fid]);
    return fid;
  });

  // 5) payment method (reuse by method)
  if (cfg.payment?.method && funnelId) {
    await withTenant(tenantId!, async (c) => {
      const existing = await c.query(`SELECT id FROM payment_methods WHERE journey_id=$1 AND method=$2 LIMIT 1`, [funnelId, cfg.payment!.method]);
      if (!existing.rowCount) {
        await c.query(`INSERT INTO payment_methods (journey_id, method, account_details, customer_instructions) VALUES ($1,$2,$3,$4)`, [funnelId, cfg.payment!.method, cfg.payment!.accountDetails ?? null, cfg.payment!.instructions ?? null]);
        created.paymentMethod = true;
      }
    });
  }

  // activation status → next action
  let nextAction: string | null = null;
  if (funnelId) {
    const { getActivationStatus } = await import('../../activation/src/service.js');
    const act = await getActivationStatus(tenantId!, funnelId).catch(() => null);
    nextAction = act?.nextAction?.nextAction ?? null;
  }

  return { ok: true, blocking: [], tenantId, workspaceId, businessId, funnelId, created, nextAction };
}
