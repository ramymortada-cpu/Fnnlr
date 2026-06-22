import { getControlPool } from '../../../packages/db/src/router.js';

/**
 * Public-code → tenant resolution.
 *
 * Public routes (/r/:code, /p/:slug) must NOT trust a client-supplied tenant.
 * This resolves the tenant from the code alone via a control-plane map.
 *
 * registerPublicCode() is called when a link/page is created or published, so
 * the central map stays in sync with the per-tenant records.
 */

export async function registerPublicCode(code: string, kind: 'link' | 'page', tenantId: string): Promise<void> {
  const control = getControlPool();
  await control.query(
    `INSERT INTO public_codes (code, kind, tenant_id) VALUES ($1,$2,$3)
     ON CONFLICT (code) DO UPDATE SET tenant_id = EXCLUDED.tenant_id, kind = EXCLUDED.kind`,
    [code, kind, tenantId],
  );
}

export async function unregisterPublicCode(code: string): Promise<void> {
  const control = getControlPool();
  await control.query(`DELETE FROM public_codes WHERE code=$1`, [code]);
}

/**
 * The production-safe resolver. Returns the tenant id for a public code, or null.
 * Never consults a client header or query param.
 */
export async function resolveTenantByPublicCode(code: string): Promise<string | null> {
  try {
    const control = getControlPool();
    const r = await control.query(`SELECT tenant_id FROM public_codes WHERE code=$1`, [code]);
    return r.rowCount ? (r.rows[0].tenant_id as string) : null;
  } catch {
    // Fail safe: if the control plane is unreachable, deny rather than error.
    return null;
  }
}
