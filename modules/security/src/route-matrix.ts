export type RouteAuthClass = 'public' | 'authenticated' | 'admin' | 'internal_cron' | 'webhook';

export interface RouteMatrixEntry {
  method: string;
  pattern: string;
  auth: RouteAuthClass;
  negativeTest: string;
  notes?: string;
}

export const ROUTE_AUTH_MATRIX: RouteMatrixEntry[] = [
  { method: 'GET', pattern: '/health', auth: 'public', negativeTest: 'health check needs no auth' },
  { method: 'GET', pattern: '/health/*', auth: 'public', negativeTest: 'health endpoints return no tenant data' },
  { method: 'POST', pattern: '/demo/seed', auth: 'public', negativeTest: 'demo routes are non-production demo bootstrap only' },
  { method: 'POST', pattern: '/demo/reset', auth: 'public', negativeTest: 'demo routes are non-production demo bootstrap only' },
  { method: 'GET', pattern: '/demo/credentials', auth: 'public', negativeTest: 'demo routes are non-production demo bootstrap only' },
  { method: 'POST', pattern: '/auth/signup', auth: 'public', negativeTest: 'signup payload/rate-limit tests' },
  { method: 'POST', pattern: '/auth/login', auth: 'public', negativeTest: 'login generic failure/rate-limit tests' },
  { method: 'POST', pattern: '/auth/logout', auth: 'public', negativeTest: 'logout is idempotent and no-store' },
  { method: 'GET', pattern: '/auth/me', auth: 'authenticated', negativeTest: 'auth/me without a token is unauthenticated' },
  { method: 'POST', pattern: '/auth/mfa/setup', auth: 'authenticated', negativeTest: 'MFA setup requires a session' },
  { method: 'POST', pattern: '/auth/mfa/verify', auth: 'authenticated', negativeTest: 'MFA verify requires a session and valid code' },
  { method: 'GET', pattern: '/r/:code', auth: 'public', negativeTest: 'tracked redirect ignores x-tenant-id in production' },
  { method: 'GET', pattern: '/p/:slug', auth: 'public', negativeTest: 'public page ignores x-tenant-id in production' },
  { method: 'POST', pattern: '/track/page-event', auth: 'public', negativeTest: 'tracking resolves tenant from slug, not header' },
  { method: 'POST', pattern: '/track/page-events', auth: 'public', negativeTest: 'tracking batch resolves tenant from slug, not header' },
  { method: 'GET', pattern: '/webhooks/whatsapp/:connectionId', auth: 'webhook', negativeTest: 'handshake only echoes challenge' },
  { method: 'POST', pattern: '/webhooks/whatsapp/:connectionId', auth: 'webhook', negativeTest: 'unknown connection is 404; signature rejected when configured' },
  { method: 'POST', pattern: '/webhooks/payments/:provider/:connectionId', auth: 'webhook', negativeTest: 'unknown connection is 404; signature/replay/idempotency tests' },
  { method: 'POST', pattern: '/internal/cron/:job', auth: 'internal_cron', negativeTest: 'cron requires x-cron-secret and body tenantId' },
  { method: 'GET', pattern: '/ops/*', auth: 'admin', negativeTest: 'ops endpoints reject header-only tenant and non-admin/MFA-missing sessions' },
  { method: 'GET', pattern: '/admin/*', auth: 'admin', negativeTest: 'admin endpoints reject header-only tenant and non-admin/MFA-missing sessions' },
  { method: '*', pattern: '/automations*', auth: 'authenticated', negativeTest: 'automations reject header-only tenant in production' },
  { method: '*', pattern: '/events*', auth: 'authenticated', negativeTest: 'events reject header-only tenant in production' },
  { method: '*', pattern: '/approvals*', auth: 'authenticated', negativeTest: 'approvals reject header-only tenant in production' },
  { method: '*', pattern: '/funnels*', auth: 'authenticated', negativeTest: 'funnel routes reject header-only tenant in production' },
  { method: '*', pattern: '/stages*', auth: 'authenticated', negativeTest: 'stage routes reject header-only tenant in production' },
  { method: '*', pattern: '/sections*', auth: 'authenticated', negativeTest: 'section routes reject header-only tenant in production' },
  { method: '*', pattern: '/leads*', auth: 'authenticated', negativeTest: 'lead routes reject header-only tenant in production' },
  { method: '*', pattern: '/tasks*', auth: 'authenticated', negativeTest: 'task routes reject header-only tenant in production' },
  { method: '*', pattern: '/conversations*', auth: 'authenticated', negativeTest: 'conversation routes reject header-only tenant in production' },
  { method: '*', pattern: '/command*', auth: 'authenticated', negativeTest: 'command routes reject header-only tenant in production' },
  { method: '*', pattern: '/commands*', auth: 'authenticated', negativeTest: 'command history rejects header-only tenant in production' },
  { method: '*', pattern: '/integrations*', auth: 'authenticated', negativeTest: 'integrations reject header-only tenant in production' },
  { method: '*', pattern: '/repairs*', auth: 'authenticated', negativeTest: 'repair routes reject header-only tenant in production' },
  { method: '*', pattern: '/repair-*', auth: 'authenticated', negativeTest: 'repair outcome routes reject header-only tenant in production' },
  { method: '*', pattern: '/playbooks*', auth: 'authenticated', negativeTest: 'playbook routes reject header-only tenant in production' },
  { method: '*', pattern: '/playbook-*', auth: 'authenticated', negativeTest: 'playbook application routes reject header-only tenant in production' },
  { method: '*', pattern: '/portfolio*', auth: 'authenticated', negativeTest: 'portfolio routes reject header-only tenant in production' },
  { method: '*', pattern: '/scheduled*', auth: 'authenticated', negativeTest: 'scheduled routes reject header-only tenant in production' },
  { method: '*', pattern: '/opportunities*', auth: 'authenticated', negativeTest: 'opportunity routes reject header-only tenant in production' },
  { method: '*', pattern: '/attribution*', auth: 'authenticated', negativeTest: 'attribution routes reject header-only tenant in production' },
  { method: '*', pattern: '/recommendations*', auth: 'authenticated', negativeTest: 'recommendation routes reject header-only tenant in production' },
  { method: '*', pattern: '/revenue-desk*', auth: 'authenticated', negativeTest: 'revenue desk routes reject header-only tenant in production' },
  { method: '*', pattern: '/activation*', auth: 'authenticated', negativeTest: 'activation routes reject header-only tenant in production' },
  { method: '*', pattern: '/actions*', auth: 'authenticated', negativeTest: 'action routes reject header-only tenant in production' },
  { method: '*', pattern: '/reports*', auth: 'authenticated', negativeTest: 'report routes reject header-only tenant in production' },
  { method: '*', pattern: '/payment-methods*', auth: 'authenticated', negativeTest: 'payment method routes reject header-only tenant in production' },
  { method: '*', pattern: '/whatsapp-flow-steps*', auth: 'authenticated', negativeTest: 'WhatsApp flow routes reject header-only tenant in production' },
  { method: '*', pattern: '/leaks*', auth: 'authenticated', negativeTest: 'leak routes reject header-only tenant in production' },
];

export function routeMatrixSummary() {
  return ROUTE_AUTH_MATRIX.reduce<Record<RouteAuthClass, number>>((acc, row) => {
    acc[row.auth] = (acc[row.auth] ?? 0) + 1;
    return acc;
  }, { public: 0, authenticated: 0, admin: 0, internal_cron: 0, webhook: 0 });
}
