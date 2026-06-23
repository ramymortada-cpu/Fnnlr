import http from 'node:http';
import { withTenant, closeAll, getControlPool } from '../../../packages/db/src/router.js';
import {
  saveAutomation, updateAutomation, listAutomations, setEnabled,
  deleteAutomation, ingestEvent,
} from '../../../modules/automation/src/service.js';
import { approve, reject } from '../../../modules/automation/src/store.js';
import {
  createFunnelFromOnboarding, listFunnels, getFunnel, updateOffer,
  addStage, updateStage, removeStage,
  getOffer, runOfferAction, listStages, reorderStages,
} from '../../../modules/funnel/src/service.js';
import {
  createTrackedLink, handleTrackedClick, ingestPageEvent,
  listTrackedLinks, updateTrackedLink, deleteTrackedLink, recentClicks, captureStatus,
} from '../../../modules/capture/src/service.js';
import { resolveTenantByPublicCode, registerPublicCode } from '../../../modules/capture/src/resolver.js';
import {
  listLeads, getLeadDetail, patchLead, changeStage, addNote, createTask,
  updateTask, getLeadEvents, updateConversation, leadsNeedingAction,
} from '../../../modules/pipeline/src/service.js';
import {
  runDiagnosis, listLeaks, getBiggestLeak, getSummary, updateLeakStatus,
} from '../../../modules/leaks/src/service.js';
import {
  getPaymentFlow, addPaymentMethod, updatePaymentMethod, deletePaymentMethod,
  generatePaymentFlow, setPaymentState as setPaymentStateV2, savePaymentProof, getPaymentTimeline,
} from '../../../modules/payments/src/service.js';
import {
  generateWhatsAppFlow, getWhatsAppFlow, updateStep as updateWaStep, addStep as addWaStep,
  deleteStep as deleteWaStep, reorderSteps as reorderWaSteps, draftReply, markSent,
} from '../../../modules/whatsapp/src/service.js';
import {
  refreshActions, listActions, topAction, updateActionStatus,
} from '../../../modules/actions/src/service.js';
import {
  generateReport, getLatestReport, markReportReviewed,
} from '../../../modules/reports/src/service.js';
import {
  runCommand, applyCommand, discardCommand, commandHistory,
} from '../../../modules/command/src/service.js';
import { seedDemo, destroyDemo, DEMO_EMAIL, DEMO_PASSWORD } from '../../../modules/demo/src/seed.js';
import { getChecklist, isDemoTenant } from '../../../modules/demo/src/service.js';
import {
  listProviders, listConnections, getConnection, createConnection, updateConnection,
  deleteConnection, rotateSecret, healthCheck, handleWhatsAppWebhook, handlePaymentWebhook, testOutboundWebhook,
} from '../../../modules/integrations/src/service.js';
import { resolveTenantByConnection } from '../../../modules/integrations/src/resolver.js';
import {
  getActivityFeed, getConversation, addConversationNote, suggestFromInbound, getIntegrationEvents,
} from '../../../modules/realtime/src/feed.js';
import {
  buildRepairFromLeak, buildRepairForBiggest, getRepair, listRepairs,
  approveRepair, rejectRepair, applyRepair, patchRepairStep, repairStatus, switchToAlternative,
} from '../../../modules/repairs/src/service.js';
import { getLearning, learningRollup } from '../../../modules/repairs/src/learning.js';
import {
  regeneratePlaybooks, listPlaybooks, explainPlaybook, recordApplication, playbookReportSummary,
} from '../../../modules/playbooks/src/service.js';
import {
  planPlaybookApplication, getApplicationPlan, listApplicationPlans,
  approveApplication, rejectApplication, applyPlaybookApplication, patchApplicationStep,
} from '../../../modules/playbooks/src/apply-service.js';
import {
  measureApplicationOutcome, listApplicationOutcomes, confirmApplicationOutcome, applicationOutcomeSummary,
} from '../../../modules/playbooks/src/app-outcomes.js';
import {
  getPortfolioMetrics, analyzePortfolio, listInsights, updateInsight, listSnapshots, transferPlaybookPlan,
} from '../../../modules/portfolio/src/service.js';
import {
  dailyBusinessRefresh, weeklyBusinessReport, portfolioAnalysisRefresh,
  repairOutcomeDueCheck, applicationOutcomeDueCheck, staleDataCheck,
  listRuns, getRun, rhythmStatus,
} from '../../../modules/scheduler/src/service.js';
import {
  refreshOpportunities, listOpportunities, getOpportunity, opportunitySummary,
  markInProgress, markCaptured, dismissOpportunity, createTaskForOpportunity,
} from '../../../modules/opportunities/src/service.js';
import {
  checkOpportunityOutcome, getOpportunityOutcome, markOutcome, getLearning as getOppLearning, outcomesSummary,
} from '../../../modules/opportunities/src/outcomes.js';
import {
  runAttribution, getAttribution, getAttributionLearning, attributionSummary,
} from '../../../modules/attribution/src/service.js';
import {
  refreshRecommendations, listRecommendations, getRecommendation, recommendForOpportunityId,
  applyRecommendation, dismissRecommendation, recommendationsSummary,
} from '../../../modules/recommendations/src/service.js';
import {
  checkRecommendationOutcome, getRecommendationOutcome, markRecOutcome, getRecLearning, recOutcomesSummary,
} from '../../../modules/recommendations/src/outcomes.js';
import { getRevenueDesk, revenueDeskSummary } from '../../../modules/revenue-desk/src/service.js';
import { getActivationStatus, activationSummary, getNextActivationAction } from '../../../modules/activation/src/service.js';
import { authLimiter, publicLimiter, commandLimiter, RULES, MAX_BODY } from '../../../modules/security/src/rate-limit.js';
import { SECURITY_HEADERS, NO_STORE, clientIp } from '../../../modules/security/src/headers.js';
import {
  measureOutcome, listOutcomes, listFunnelOutcomes, outcomeSummary, confirmOutcome,
} from '../../../modules/repairs/src/outcomes.js';
import {
  generatePage, getPage, updateSection, addSection, deleteSection,
  reorderSections, runSectionAction, publishPage, unpublishPage, getPublicPage,
} from '../../../modules/pages/src/service.js';
import { anthropicLLM, failingLLM } from '../../../packages/ai-core/src/llm.js';
import type { LLMClient } from '../../../packages/ai-core/src/gateway.js';
import { signup, login, logout, resolveSession, setupMfa, verifyMfa, adminMfaSatisfied } from '../../../modules/auth/src/service.js';
import { AutomationEngine } from '../../../modules/automation/src/engine.js';
import { makeTenantRunStore } from '../../../modules/automation/src/store.js';
import { makeTenantActionPorts, type ChannelSenders } from '../../../modules/automation/src/ports.js';
import type { RunContext } from '../../../modules/automation/src/types.js';

/**
 * Minimal, dependency-free HTTP API for the automation platform.
 *
 * Tenancy: every request must carry a tenant id (header `x-tenant-id`). In
 * production this is derived from an authenticated session in the control-plane;
 * here it's a header so the builder + tests can drive it directly. All data
 * access goes through the tenant's isolated DB.
 *
 * Senders are injected (no-op by default) so the API runs without a BSP token;
 * swap in makeChannelSenders() for real WhatsApp.
 */

export interface ApiDeps {
  senders?: (tenantId: string) => ChannelSenders;
  /** LLM client per tenant; defaults to Anthropic if ANTHROPIC_API_KEY is set, else a failing client (brains fall back). */
  llm?: (tenantId: string) => LLMClient;
}

const noopSenders: ChannelSenders = {
  async whatsapp() {}, async email() {},
};

function json(res: http.ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type,x-tenant-id,authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    ...SECURITY_HEADERS, ...extraHeaders });
  res.end(payload);
}

class PayloadTooLarge extends Error { constructor() { super('payload too large'); } }

async function readBodyLimited(req: http.IncomingMessage, maxBytes: number): Promise<{ raw: string; json: any }> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const c of req) {
    total += (c as Buffer).length;
    if (total > maxBytes) throw new PayloadTooLarge();
    chunks.push(c as Buffer);
  }
  const raw = chunks.length ? Buffer.concat(chunks).toString('utf8') : '';
  let parsed: any = {};
  if (raw) { try { parsed = JSON.parse(raw); } catch { parsed = {}; } }
  return { raw, json: parsed };
}

async function readBody(req: http.IncomingMessage): Promise<any> {
  const { json } = await readBodyLimited(req, MAX_BODY.default);
  return json;
}

/** Read the raw request body as a string (for webhook signature verification). */
async function readRawBody(req: http.IncomingMessage): Promise<string> {
  const { raw } = await readBodyLimited(req, MAX_BODY.webhook);
  return raw;
}

/** Lower-cased header map (string values). */
function lowerHeaders(req: http.IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) out[k.toLowerCase()] = Array.isArray(v) ? v.join(',') : (v ?? '');
  return out;
}

/** Extract a bearer token from the Authorization header. */
function bearer(req: http.IncomingMessage): string | undefined {
  const h = req.headers['authorization'];
  if (!h || !h.startsWith('Bearer ')) return undefined;
  return h.slice('Bearer '.length).trim();
}

export function createApiServer(deps: ApiDeps = {}): http.Server {
  const sendersFor = deps.senders ?? (() => noopSenders);
  const llmFor = deps.llm ?? ((_t: string) => (process.env.ANTHROPIC_API_KEY ? anthropicLLM() : failingLLM));

  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return json(res, 204, {});

      const url = new URL(req.url ?? '/', 'http://localhost');
      const parts = url.pathname.split('/').filter(Boolean);

      // Health check needs no auth.
      if (url.pathname === '/health') return json(res, 200, { ok: true });

      const devMode = process.env.FNNLR_DEV_MODE === 'true';

      // Demo workspace bootstrap (public): seed/reset return the demo login.
      if (parts[0] === 'demo' && parts[1] === 'seed' && req.method === 'POST') {
        const r = await seedDemo();
        return json(res, 200, { ok: true, email: DEMO_EMAIL, password: DEMO_PASSWORD, tenantId: r.tenantId, pageSlug: r.pageSlug });
      }
      if (parts[0] === 'demo' && parts[1] === 'reset' && req.method === 'POST') {
        const r = await seedDemo(); // seed already destroys+rebuilds
        return json(res, 200, { ok: true, email: DEMO_EMAIL, password: DEMO_PASSWORD, tenantId: r.tenantId });
      }
      if (parts[0] === 'demo' && parts[1] === 'credentials' && req.method === 'GET') {
        // does a demo workspace exist yet?
        const control = getControlPool();
        const exists = await control.query(`SELECT 1 FROM users WHERE email=$1`, [DEMO_EMAIL]);
        return json(res, 200, { exists: (exists.rowCount ?? 0) > 0, email: DEMO_EMAIL, password: DEMO_PASSWORD });
      }

      // ---- HEALTH (public-safe; no secrets, no tenant data) ----
      if (parts[0] === 'health' && req.method === 'GET') {
        const { basicHealth, dbHealth, jobsHealth, integrationsHealth, fullHealth } = await import('../../../modules/release/src/health.js');
        if (parts.length === 1) { const h = await fullHealth(); return json(res, h.status === 'failed' ? 503 : 200, h); }
        if (parts[1] === 'db') { const h = await dbHealth(); return json(res, h.status === 'failed' ? 503 : 200, h); }
        if (parts[1] === 'jobs') return json(res, 200, await jobsHealth());
        if (parts[1] === 'integrations') return json(res, 200, integrationsHealth());
        return json(res, 200, basicHealth());
      }

      // ---- WEBHOOKS (public; tenant resolved from connectionId, NEVER a header) ----
      if (parts[0] === 'webhooks' && parts[1] === 'whatsapp' && parts.length === 3) {
        const connectionId = parts[2];
        // GET = Meta verify handshake (echo hub.challenge)
        if (req.method === 'GET') {
          const challenge = url.searchParams.get('hub.challenge');
          return challenge ? (res.writeHead(200), res.end(challenge)) : json(res, 400, { error: 'missing challenge' });
        }
        if (req.method === 'POST') {
          const route = await resolveTenantByConnection(connectionId);
          if (!route) return json(res, 404, { error: 'unknown connection' });
          const raw = await readRawBody(req);
          const r = await handleWhatsAppWebhook(route.tenantId, connectionId, raw, lowerHeaders(req));
          return json(res, r.ok ? 200 : 400, r);
        }
      }
      if (parts[0] === 'webhooks' && parts[1] === 'payments' && parts.length === 4 && req.method === 'POST') {
        const provider = parts[2]; const connectionId = parts[3];
        const KNOWN_PROVIDERS = new Set(['paymob', 'fawry', 'tap', 'hyperpay', 'moyasar', 'instapay', 'vodafone_cash']);
        if (!KNOWN_PROVIDERS.has(provider)) return json(res, 400, { error: 'unknown provider' });
        const route = await resolveTenantByConnection(connectionId);
        if (!route) return json(res, 404, { error: 'unknown connection' });
        const raw = await readRawBody(req);
        const r = await handlePaymentWebhook(route.tenantId, provider, connectionId, raw, lowerHeaders(req));
        return json(res, r.ok ? 200 : 400, r);
      }

      // ---- Internal cron trigger (Sprint 24) — SECURED BY SIGNED SECRET -----
      // Never trusts x-tenant-id; requires x-cron-secret matching FNNLR_CRON_SECRET.
      // The tenant is taken from the (secret-authenticated) request body, not a header.
      if (parts[0] === 'internal' && parts[1] === 'cron' && parts.length === 3 && req.method === 'POST') {
        const secret = process.env.FNNLR_CRON_SECRET;
        const provided = req.headers['x-cron-secret'] as string | undefined;
        if (!secret || !provided || provided !== secret) return json(res, 401, { error: 'invalid cron secret' });
        if (process.env.FNNLR_DISABLE_JOBS === 'true') return json(res, 503, { error: 'scheduled jobs are disabled' }); // admin kill-switch
        const b = await readBody(req);
        const job = parts[2];
        // cross-tenant fan-out: no tenantId needed; iterates active tenants safely
        if (job === 'fanout-daily') {
          const { fanOutTenants } = await import('../../../modules/scheduler/src/fanout.js');
          return json(res, 200, await fanOutTenants('daily_business_refresh', (t) => dailyBusinessRefresh(t), { batchSize: Number(b.batchSize) || 25, maxConcurrent: Number(b.maxConcurrent) || 5 }));
        }
        if (job === 'fanout-weekly') {
          const { fanOutTenants } = await import('../../../modules/scheduler/src/fanout.js');
          return json(res, 200, await fanOutTenants('weekly_business_report', (t) => weeklyBusinessReport(t), { batchSize: Number(b.batchSize) || 25, maxConcurrent: Number(b.maxConcurrent) || 5 }));
        }
        // per-tenant jobs require a tenantId from the signed body (never a header)
        if (!b.tenantId) return json(res, 422, { error: 'tenantId required' });
        if (job === 'daily-refresh') return json(res, 200, await dailyBusinessRefresh(b.tenantId));
        if (job === 'weekly-report') return json(res, 200, await weeklyBusinessReport(b.tenantId));
        if (job === 'portfolio-refresh') return json(res, 200, await portfolioAnalysisRefresh(b.tenantId));
        if (job === 'outcomes-due-check') return json(res, 200, { repairs: await repairOutcomeDueCheck(b.tenantId), applications: await applicationOutcomeDueCheck(b.tenantId) });
        if (job === 'outbound-retries') {
          const { processOutboundRetries } = await import('../../../modules/realtime/src/outbound.js');
          return json(res, 200, await processOutboundRetries(b.tenantId, Number(b.batchSize) || 50));
        }
        return json(res, 422, { error: 'unknown job' });
      }

      // ---- Auth routes (no session required) -------------------------------
      if (parts[0] === 'auth') {
        const ip = clientIp(req);
        if (req.method === 'POST' && parts[1] === 'signup') {
          const sig = authLimiter.check(`signup:${ip}`, RULES.signup);
          if (!sig.allowed) return json(res, 429, { error: 'too many attempts, try later' }, { 'Retry-After': String(Math.ceil(sig.retryAfterMs / 1000)) });
          const { json: b } = await readBodyLimited(req, MAX_BODY.auth);
          if (!b.email || !b.password || !b.businessName) return json(res, 422, { error: 'email, password, businessName required' });
          try { const { token, ctx } = await signup(b); return json(res, 201, { token, ctx }, NO_STORE); }
          catch (e) { return json(res, 409, { error: (e as Error).message }); }
        }
        if (req.method === 'POST' && parts[1] === 'login') {
          const { json: b } = await readBodyLimited(req, MAX_BODY.auth);
          const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
          // rate-limit on BOTH ip and ip+email so neither dimension can be abused
          const byIp = authLimiter.check(`login:ip:${ip}`, RULES.login);
          const byEmail = authLimiter.check(`login:em:${ip}:${email}`, RULES.login);
          if (!byIp.allowed || !byEmail.allowed) {
            const wait = Math.max(byIp.retryAfterMs, byEmail.retryAfterMs);
            return json(res, 429, { error: 'invalid credentials' }, { 'Retry-After': String(Math.ceil(wait / 1000)) }); // generic: no enumeration
          }
          try {
            const { token, ctx } = await login(b);
            authLimiter.reset(`login:ip:${ip}`); authLimiter.reset(`login:em:${ip}:${email}`); // success clears the counter
            return json(res, 200, { token, ctx }, NO_STORE);
          }
          catch { return json(res, 401, { error: 'invalid credentials' }); } // same message whether or not the email exists
        }
        if (req.method === 'POST' && parts[1] === 'logout') {
          const tok = bearer(req); if (tok) await logout(tok);
          return json(res, 200, { ok: true }, NO_STORE);
        }
        if (req.method === 'GET' && parts[1] === 'me') {
          const ctx = await resolveSession(bearer(req));
          return ctx ? json(res, 200, { ctx }, NO_STORE) : json(res, 401, { error: 'not authenticated' }, NO_STORE);
        }
        if (req.method === 'POST' && parts[1] === 'mfa' && parts[2] === 'setup') {
          try { return json(res, 200, await setupMfa(bearer(req)), NO_STORE); }
          catch (e) { return json(res, 403, { error: (e as Error).message }, NO_STORE); }
        }
        if (req.method === 'POST' && parts[1] === 'mfa' && parts[2] === 'verify') {
          const { json: b } = await readBodyLimited(req, MAX_BODY.auth);
          const r = await verifyMfa(bearer(req), String(b.code ?? ''));
          return r.ok ? json(res, 200, { ok: true }, NO_STORE) : json(res, 401, { error: 'invalid mfa code' }, NO_STORE);
        }
      }

      // ---- Resolve tenant SERVER-SIDE from the session (the hardening core) -
      // Production: the tenant comes ONLY from the authenticated session.
      // The x-tenant-id header is honored ONLY in explicit dev mode.
      const session = await resolveSession(bearer(req));
      let tenantId: string | undefined = session?.tenantId;
      if (!tenantId && devMode) {
        tenantId = req.headers['x-tenant-id'] as string | undefined;
      }

      // Tracked redirect: /r/:code — PUBLIC, no login. Tenant resolved from the
      // code via the control-plane map (production-safe). The dev header is a
      // fallback ONLY in dev mode; production never trusts a client tenant.
      if (parts[0] === 'r' && parts.length === 2 && req.method === 'GET') {
        const rl = publicLimiter.check(`r:${clientIp(req)}`, RULES.publicHit);
        if (!rl.allowed) return json(res, 429, { error: 'rate limited' }, { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) });
        let t = await resolveTenantByPublicCode(parts[1]);
        if (!t && devMode) t = (req.headers['x-tenant-id'] as string | undefined) ?? null;
        if (!t) return json(res, 404, { error: 'link not found' });
        const hit = await handleTrackedClick(t, parts[1]);
        if (!hit) return json(res, 404, { error: 'link not found or inactive' });
        res.writeHead(302, { Location: hit.destination, 'Access-Control-Allow-Origin': '*' });
        return res.end();
      }

      // Public page read: /p/:slug — NO login required to VIEW. Tenant resolved
      // from the slug via control-plane (production-safe); dev header only in dev.
      if (parts[0] === 'p' && parts.length === 2 && req.method === 'GET') {
        let t = await resolveTenantByPublicCode(parts[1]);
        if (!t && devMode) t = (req.headers['x-tenant-id'] as string | undefined) ?? null;
        if (!t) return json(res, 404, { error: 'page not found' });
        const page = await getPublicPage(t, parts[1]);
        return page ? json(res, 200, page) : json(res, 404, { error: 'page not found' });
      }

      // Public page tracking: /track/page-event — emitted by the hosted page snippet,
      // no login. Tenant from code (slug) via control-plane; dev header only in dev.
      if (parts[0] === 'track' && parts[1] === 'page-event' && req.method === 'POST') {
        const rl = publicLimiter.check(`track:${clientIp(req)}`, RULES.trackEvent);
        if (!rl.allowed) return json(res, 429, { error: 'rate limited' }, { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) });
        const { json: b } = await readBodyLimited(req, MAX_BODY.track);
        const ALLOWED_EVENTS = new Set(['page_view', 'cta_click', 'form_submit', 'scroll_depth', 'whatsapp_click', 'payment_click', 'proof_upload']);
        if (!b.type || !ALLOWED_EVENTS.has(b.type)) return json(res, 422, { error: 'invalid or missing event type' });
        let t = b.slug ? await resolveTenantByPublicCode(b.slug) : null;
        if (!t && devMode) t = (req.headers['x-tenant-id'] as string | undefined) ?? null;
        if (!t) return json(res, 400, { error: 'tenant context required' });
        await ingestPageEvent(t, b);
        return json(res, 200, { ok: true });
      }

      // Batch page tracking: /track/page-events — array of events, partial accept.
      if (parts[0] === 'track' && parts[1] === 'page-events' && req.method === 'POST') {
        const rl = publicLimiter.check(`trackb:${clientIp(req)}`, RULES.trackEvent);
        if (!rl.allowed) return json(res, 429, { error: 'rate limited' }, { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) });
        const { json: b } = await readBodyLimited(req, MAX_BODY.webhook); // batches are bigger but capped
        const events = Array.isArray(b.events) ? b.events : null;
        if (!events) return json(res, 422, { error: 'events[] required' });
        if (events.length > 500) return json(res, 413, { error: 'batch too large (max 500)' });
        let t = b.slug ? await resolveTenantByPublicCode(b.slug) : null;
        if (!t && devMode) t = (req.headers['x-tenant-id'] as string | undefined) ?? null;
        if (!t) return json(res, 400, { error: 'tenant context required' });
        const { ingestPageEventsBatch } = await import('../../../modules/capture/src/service.js');
        const out = await ingestPageEventsBatch(t, events);
        return json(res, 200, out);
      }

      if (!tenantId) return json(res, 401, { error: 'authentication required' });

      // ---- Ops observability (admin only) ----------------------------------
      if (parts[0] === 'ops' && req.method === 'GET') {
        if (session && session.role !== 'owner' && session.role !== 'admin') return json(res, 403, { error: 'admin only' });
        if (session && !adminMfaSatisfied(session)) return json(res, 403, { error: 'admin mfa required' }, NO_STORE);
        const { opsStatus, opsRetries, opsIngestion, opsQueues } = await import('../../../modules/scheduler/src/ops.js');
        if (parts[1] === 'status') return json(res, 200, await opsStatus(tenantId), NO_STORE);
        if (parts[1] === 'retries') return json(res, 200, await opsRetries(tenantId), NO_STORE);
        if (parts[1] === 'ingestion') return json(res, 200, await opsIngestion(tenantId), NO_STORE);
        if (parts[1] === 'queues') return json(res, 200, await opsQueues(tenantId), NO_STORE);
      }

      // ---- Admin / support (admin only) ------------------------------------
      if (parts[0] === 'admin' && req.method === 'GET') {
        if (session && session.role !== 'owner' && session.role !== 'admin') return json(res, 403, { error: 'admin only' });
        if (session && !adminMfaSatisfied(session)) return json(res, 403, { error: 'admin mfa required' }, NO_STORE);
        const { listWorkspaces, listTenants, tenantDiagnostics, tenantActivationSnapshot } = await import('../../../modules/release/src/admin.js');
        if (parts[1] === 'workspaces') return json(res, 200, await listWorkspaces(), NO_STORE);
        if (parts[1] === 'tenants') return json(res, 200, await listTenants(), NO_STORE);
        if (parts[1] === 'diagnostics') return json(res, 200, await tenantDiagnostics(tenantId), NO_STORE);
        if (parts[1] === 'activation-snapshot') return json(res, 200, await tenantActivationSnapshot(tenantId), NO_STORE);
        if (parts[1] === 'customer-snapshot') {
          const fid = url.searchParams.get('funnelId');
          if (!fid) return json(res, 422, { error: 'funnelId required' });
          const { customerSnapshot } = await import('../../../modules/customer-zero/src/support.js');
          return json(res, 200, await customerSnapshot(tenantId, fid), NO_STORE);
        }
        // ---- Operating Room (admin only) ----
        if (parts[1] === 'daily-check' || parts[1] === 'customer-status' || parts[1] === 'week1-review') {
          const fid = url.searchParams.get('funnelId');
          if (!fid) return json(res, 422, { error: 'funnelId required' });
          const { dailyCheck, customerStatus, week1Review } = await import('../../../modules/operating-room/src/service.js');
          if (parts[1] === 'daily-check') return json(res, 200, await dailyCheck(tenantId, fid), NO_STORE);
          if (parts[1] === 'customer-status') return json(res, 200, await customerStatus(tenantId, fid), NO_STORE);
          return json(res, 200, await week1Review(tenantId, fid), NO_STORE);
        }
        if (parts[1] === 'triage') {
          const fid = url.searchParams.get('funnelId'); const issue = url.searchParams.get('issue');
          if (!fid || !issue) return json(res, 422, { error: 'funnelId and issue required' });
          const { triage } = await import('../../../modules/operating-room/src/service.js');
          return json(res, 200, await triage(tenantId, fid, issue as any, { connectionId: url.searchParams.get('connectionId') ?? undefined }), NO_STORE);
        }
        // ---- Execution lock (admin only) ----
        if (parts[1] === 'launch-check') {
          const fid = url.searchParams.get('funnelId');
          if (!fid) return json(res, 422, { error: 'funnelId required' });
          const { launchCheck } = await import('../../../modules/execution/src/service.js');
          return json(res, 200, await launchCheck(tenantId, fid), NO_STORE);
        }
        if (parts[1] === 'execution-log') {
          const { readExecutionLog } = await import('../../../modules/execution/src/log.js');
          return json(res, 200, await readExecutionLog(tenantId), NO_STORE);
        }
        if (parts[1] === '72h-monitor' || parts[1] === 'ledger') {
          const fid = url.searchParams.get('funnelId');
          if (!fid) return json(res, 422, { error: 'funnelId required' });
          const { monitor72h, eventLedger } = await import('../../../modules/execution/src/live.js');
          if (parts[1] === '72h-monitor') return json(res, 200, await monitor72h(tenantId, fid), NO_STORE);
          return json(res, 200, await eventLedger(tenantId, fid), NO_STORE);
        }
        if (parts[1] === 'issues') {
          const { listIssues } = await import('../../../modules/execution/src/issues.js');
          return json(res, 200, await listIssues(tenantId), NO_STORE);
        }
        if (parts[1] === 'support-pack') {
          const fid = url.searchParams.get('funnelId');
          if (!fid) return json(res, 422, { error: 'funnelId required' });
          const { supportPack } = await import('../../../modules/execution/src/support-pack.js');
          return json(res, 200, await supportPack(tenantId, fid), NO_STORE);
        }
        // admin-safe tenant health for the CURRENT tenant
        if (parts[1] === 'tenant-health') { const { tenantHealth } = await import('../../../modules/release/src/health.js'); return json(res, 200, await tenantHealth(tenantId), NO_STORE); }
      }

      // ---- /automations ----------------------------------------------------
      if (parts[0] === 'automations') {
        if (req.method === 'GET' && parts.length === 1) {
          return json(res, 200, await listAutomations(tenantId));
        }
        if (req.method === 'POST' && parts.length === 1) {
          const body = await readBody(req);
          if (!body.name || !body.triggerEvent || !Array.isArray(body.actions)) {
            return json(res, 422, { error: 'name, triggerEvent, actions[] required' });
          }
          return json(res, 201, await saveAutomation(tenantId, body));
        }
        if (req.method === 'PATCH' && parts.length === 2) {
          await updateAutomation(tenantId, parts[1], await readBody(req));
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'enable') {
          await setEnabled(tenantId, parts[1], true); return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'disable') {
          await setEnabled(tenantId, parts[1], false); return json(res, 200, { ok: true });
        }
        if (req.method === 'DELETE' && parts.length === 2) {
          await deleteAutomation(tenantId, parts[1]); return json(res, 200, { ok: true });
        }
      }

      // ---- /events  (ingest → fire engine) ---------------------------------
      if (parts[0] === 'events' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.event?.type || !body.entity?.type || !body.entity?.id) {
          return json(res, 422, { error: 'event.type, entity.type, entity.id required' });
        }
        const ctx: RunContext = {
          event: { type: body.event.type, payload: body.event.payload ?? {}, occurredAt: body.event.occurredAt ?? new Date().toISOString() },
          entity: body.entity,
          lead: body.lead, conversation: body.conversation, payment: body.payment, business: body.business,
          whatsapp: body.whatsapp ?? { windowState: 'free_service' },
          now: new Date().toISOString(),
        };
        const result = await ingestEvent(tenantId, ctx, sendersFor(tenantId));
        return json(res, 200, result);
      }

      // ---- /approvals ------------------------------------------------------
      if (parts[0] === 'approvals') {
        if (req.method === 'GET') {
          const rows = await withTenant(tenantId, async (c) => {
            const r = await c.query(
              `SELECT id, run_id, step_index, proposed_action, created_at
                 FROM automation_approvals WHERE status='pending' ORDER BY created_at`);
            return r.rows;
          });
          return json(res, 200, rows);
        }
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'approve') {
          const runId = await approve(tenantId, parts[1], (req.headers['x-user'] as string) ?? 'owner');
          if (runId) {
            const engine = new AutomationEngine({
              store: makeTenantRunStore(tenantId),
              ports: makeTenantActionPorts(tenantId, sendersFor(tenantId)),
            });
            await engine.onApproved(runId);
          }
          return json(res, 200, { ok: true, runId });
        }
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'reject') {
          await reject(tenantId, parts[1], (req.headers['x-user'] as string) ?? 'owner');
          return json(res, 200, { ok: true });
        }
      }

      // ---- /funnels (create from onboarding, list, get, edit) --------------
      if (parts[0] === 'funnels') {
        if (req.method === 'POST' && parts.length === 1) {
          const body = await readBody(req);
          if (!body.businessId || !body.onboarding) {
            return json(res, 422, { error: 'businessId and onboarding required' });
          }
          const result = await createFunnelFromOnboarding(
            tenantId, body.businessId, body.onboarding, llmFor(tenantId),
          );
          return json(res, 201, result);
        }
        if (req.method === 'GET' && parts.length === 1) {
          return json(res, 200, await listFunnels(tenantId));
        }
        if (req.method === 'GET' && parts.length === 2) {
          const f = await getFunnel(tenantId, parts[1]);
          return f ? json(res, 200, f) : json(res, 404, { error: 'funnel not found' });
        }
        if (req.method === 'PATCH' && parts.length === 3 && parts[2] === 'offer') {
          await updateOffer(tenantId, parts[1], (await readBody(req)).offer);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'offer') {
          const o = await getOffer(tenantId, parts[1]);
          return o ? json(res, 200, o) : json(res, 404, { error: 'offer not found' });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'offer' && parts[3] === 'action') {
          const b = await readBody(req);
          if (!b.action) return json(res, 422, { error: 'action required' });
          const r = await runOfferAction(tenantId, parts[1], b.action, llmFor(tenantId));
          return r ? json(res, 200, r) : json(res, 404, { error: 'offer not found' });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'stages') {
          return json(res, 200, await listStages(tenantId, parts[1]));
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'stages' && parts[3] === 'reorder') {
          const b = await readBody(req);
          if (!Array.isArray(b.orderedIds)) return json(res, 422, { error: 'orderedIds[] required' });
          await reorderStages(tenantId, parts[1], b.orderedIds);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'stages') {
          const id = await addStage(tenantId, parts[1], (await readBody(req)).name ?? 'مرحلة جديدة');
          return json(res, 201, { id });
        }

        // ---- page (Landing Page Intelligence) ----
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'page' && parts[3] === 'generate') {
          const r = await generatePage(tenantId, parts[1], llmFor(tenantId));
          return r ? json(res, 201, r) : json(res, 404, { error: 'funnel/offer not found' });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'page') {
          const p = await getPage(tenantId, parts[1]);
          return p ? json(res, 200, p) : json(res, 404, { error: 'no page yet' });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'page' && parts[3] === 'sections') {
          const id = await addSection(tenantId, (await readBody(req)).pageId, (await readBody(req)).type ?? 'benefits');
          return json(res, 201, { id });
        }
        if (req.method === 'POST' && parts.length === 5 && parts[2] === 'page' && parts[3] === 'sections' && parts[4] === 'reorder') {
          const b = await readBody(req);
          if (!Array.isArray(b.orderedIds) || !b.pageId) return json(res, 422, { error: 'pageId and orderedIds[] required' });
          await reorderSections(tenantId, b.pageId, b.orderedIds);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'page' && parts[3] === 'publish') {
          const b = await readBody(req);
          const r = await publishPage(tenantId, parts[1], b.whatsappDestination);
          if (r) await registerPublicCode(r.slug, 'page', tenantId);
          return r ? json(res, 200, r) : json(res, 404, { error: 'no page to publish' });
        }
        // ---- tracked links (capture) ----
        if (req.method === 'POST' && parts.length === 3 && parts[2] === 'links') {
          const b = await readBody(req);
          if (!b.destinationPhone && !b.destination) return json(res, 422, { error: 'destinationPhone or destination required' });
          return json(res, 201, await createTrackedLink(tenantId, { ...b, journeyId: parts[1] }));
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'links') {
          return json(res, 200, await listTrackedLinks(tenantId, parts[1]));
        }
        if (req.method === 'PATCH' && parts.length === 4 && parts[2] === 'links') {
          await updateTrackedLink(tenantId, parts[3], await readBody(req));
          return json(res, 200, { ok: true });
        }
        if (req.method === 'DELETE' && parts.length === 4 && parts[2] === 'links') {
          await deleteTrackedLink(tenantId, parts[3]);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'capture' && parts[3] === 'clicks') {
          return json(res, 200, await recentClicks(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'capture' && parts[3] === 'status') {
          return json(res, 200, await captureStatus(tenantId, parts[1]));
        }
        // ---- leads pipeline ----
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'leads') {
          const filter = url.searchParams.get('filter') ?? 'all';
          const source = url.searchParams.get('source') ?? undefined;
          const campaign = url.searchParams.get('campaign') ?? undefined;
          return json(res, 200, await listLeads(tenantId, parts[1], { filter: filter as any, source, campaign }));
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'leads' && parts[3] === 'needing-action') {
          return json(res, 200, { count: await leadsNeedingAction(tenantId, parts[1]) });
        }
        // ---- leak board ----
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'leaks' && parts[3] === 'run') {
          return json(res, 200, await runDiagnosis(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'leaks') {
          return json(res, 200, await listLeaks(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'leaks' && parts[3] === 'biggest') {
          return json(res, 200, { biggest: await getBiggestLeak(tenantId, parts[1]) });
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'leaks' && parts[3] === 'summary') {
          return json(res, 200, await getSummary(tenantId, parts[1]));
        }
        // ---- payment flow ----
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'payment-flow') {
          return json(res, 200, await getPaymentFlow(tenantId, parts[1]));
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'payment-flow' && parts[3] === 'methods') {
          const b = await readBody(req);
          if (!b.method) return json(res, 422, { error: 'method required' });
          return json(res, 201, { id: await addPaymentMethod(tenantId, parts[1], b) });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'payment-flow' && parts[3] === 'generate') {
          const r = await generatePaymentFlow(tenantId, parts[1], llmFor(tenantId));
          return r ? json(res, 200, r) : json(res, 404, { error: 'funnel/offer not found' });
        }
        // ---- whatsapp flow ----
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'whatsapp-flow' && parts[3] === 'generate') {
          const r = await generateWhatsAppFlow(tenantId, parts[1], llmFor(tenantId));
          return r ? json(res, 200, r) : json(res, 404, { error: 'funnel/offer not found' });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'whatsapp-flow') {
          const r = await getWhatsAppFlow(tenantId, parts[1]);
          return r ? json(res, 200, r) : json(res, 404, { error: 'no flow yet' });
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'pilot' && parts[3] === 'checklist') {
          return json(res, 200, await getChecklist(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'activity') {
          return json(res, 200, await getActivityFeed(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'repairs') {
          return json(res, 200, await listRepairs(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'repair-outcomes') {
          return json(res, 200, await listFunnelOutcomes(tenantId, parts[1]));
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'repair-outcomes' && parts[3] === 'summary') {
          return json(res, 200, await outcomeSummary(tenantId, parts[1]));
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'repairs' && parts[3] === 'biggest') {
          const r = await buildRepairForBiggest(tenantId, parts[1]);
          return json(res, 200, r);
        }
        if (req.method === 'POST' && parts.length === 5 && parts[2] === 'repairs' && parts[3] === 'from-leak') {
          const r = await buildRepairFromLeak(tenantId, parts[1], parts[4]);
          return r ? json(res, 200, r) : json(res, 404, { error: 'leak not found' });
        }
        // ---- action center ----
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'actions' && parts[3] === 'refresh') {
          await refreshActions(tenantId, parts[1]);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'actions') {
          const filter = url.searchParams.get('filter') ?? 'today';
          await refreshActions(tenantId, parts[1]);
          return json(res, 200, await listActions(tenantId, parts[1], filter));
        }
        if (req.method === 'GET' && parts.length === 4 && parts[2] === 'actions' && parts[3] === 'top') {
          return json(res, 200, { top: await topAction(tenantId, parts[1]) });
        }
        // ---- weekly report ----
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'report' && parts[3] === 'generate') {
          const r = await generateReport(tenantId, parts[1], llmFor(tenantId));
          return r ? json(res, 200, r) : json(res, 404, { error: 'funnel not found' });
        }
        if (req.method === 'GET' && parts.length === 3 && parts[2] === 'report') {
          const r = await getLatestReport(tenantId, parts[1]);
          return r ? json(res, 200, r) : json(res, 404, { error: 'no report yet' });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'whatsapp-flow' && parts[3] === 'steps') {
          const id = await addWaStep(tenantId, parts[1], (await readBody(req)).stepType ?? 'no_response');
          return id ? json(res, 201, { id }) : json(res, 404, { error: 'no flow' });
        }
        if (req.method === 'POST' && parts.length === 4 && parts[2] === 'page' && parts[3] === 'unpublish') {
          await unpublishPage(tenantId, parts[1]);
          return json(res, 200, { ok: true });
        }
      }
      if (parts[0] === 'stages' && parts.length === 2) {
        if (req.method === 'PATCH') { await updateStage(tenantId, parts[1], await readBody(req)); return json(res, 200, { ok: true }); }
        if (req.method === 'DELETE') { await removeStage(tenantId, parts[1]); return json(res, 200, { ok: true }); }
      }

      // ---- /sections/:id (page section edit/delete/AI action) ----
      if (parts[0] === 'sections' && parts.length === 2) {
        if (req.method === 'PATCH') { await updateSection(tenantId, parts[1], await readBody(req)); return json(res, 200, { ok: true }); }
        if (req.method === 'DELETE') { await deleteSection(tenantId, parts[1]); return json(res, 200, { ok: true }); }
      }
      if (parts[0] === 'sections' && parts.length === 3 && parts[2] === 'action' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.action) return json(res, 422, { error: 'action required' });
        const r = await runSectionAction(tenantId, parts[1], b.action, llmFor(tenantId));
        return r ? json(res, 200, r) : json(res, 404, { error: 'section not found' });
      }

      // ---- /leads/:id (CRM) ----
      if (parts[0] === 'leads' && parts.length === 2) {
        if (req.method === 'GET') {
          const d = await getLeadDetail(tenantId, parts[1]);
          return d ? json(res, 200, d) : json(res, 404, { error: 'lead not found' });
        }
        if (req.method === 'PATCH') { await patchLead(tenantId, parts[1], await readBody(req)); return json(res, 200, { ok: true }); }
      }
      if (parts[0] === 'leads' && parts.length === 3) {
        const leadId = parts[1];
        if (parts[2] === 'conversation' && req.method === 'GET') {
          return json(res, 200, await getConversation(tenantId, leadId));
        }
        if (parts[2] === 'stage' && req.method === 'POST') {
          const b = await readBody(req);
          if (!b.stage) return json(res, 422, { error: 'stage required' });
          await changeStage(tenantId, leadId, b.stage, b.lostReason);
          return json(res, 200, { ok: true });
        }
        if (parts[2] === 'notes' && req.method === 'POST') {
          const b = await readBody(req);
          if (!b.body) return json(res, 422, { error: 'body required' });
          return json(res, 201, { id: await addNote(tenantId, leadId, b.body) });
        }
        if (parts[2] === 'tasks' && req.method === 'POST') {
          const b = await readBody(req);
          if (!b.title) return json(res, 422, { error: 'title required' });
          return json(res, 201, { id: await createTask(tenantId, leadId, b) });
        }
        if (parts[2] === 'payment-state' && req.method === 'POST') {
          const b = await readBody(req);
          if (!b.state) return json(res, 422, { error: 'state required' });
          const r = await setPaymentStateV2(tenantId, leadId, b.state, { method: b.method, note: b.note });
          return r.ok ? json(res, 200, { ok: true }) : json(res, 409, { error: r.reason });
        }
        if (parts[2] === 'payment-proof' && req.method === 'POST') {
          await savePaymentProof(tenantId, leadId, await readBody(req));
          return json(res, 200, { ok: true });
        }
        if (parts[2] === 'payment-timeline' && req.method === 'GET') {
          return json(res, 200, await getPaymentTimeline(tenantId, leadId));
        }
        if (parts[2] === 'events' && req.method === 'GET') {
          return json(res, 200, await getLeadEvents(tenantId, leadId));
        }
      }
      if (parts[0] === 'leads' && parts.length === 4 && parts[2] === 'copilot') {
        const leadId = parts[1];
        if (parts[3] === 'draft' && req.method === 'POST') {
          const b = await readBody(req);
          const r = await draftReply(tenantId, leadId, { stepType: b.stepType, objectionKey: b.objectionKey });
          return r ? json(res, 200, r) : json(res, 404, { error: 'lead not found' });
        }
        if (parts[3] === 'mark-sent' && req.method === 'POST') {
          return json(res, 200, await markSent(tenantId, leadId, await readBody(req)));
        }
        if (parts[3] === 'suggest-from-inbound' && req.method === 'POST') {
          return json(res, 200, await suggestFromInbound(tenantId, leadId));
        }
      }
      if (parts[0] === 'leads' && parts.length === 4 && parts[2] === 'conversation' && parts[3] === 'note' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.note) return json(res, 422, { error: 'note required' });
        return json(res, 200, await addConversationNote(tenantId, parts[1], b.note));
      }
      if (parts[0] === 'tasks' && parts.length === 2 && req.method === 'PATCH') {
        await updateTask(tenantId, parts[1], await readBody(req));
        return json(res, 200, { ok: true });
      }
      if (parts[0] === 'conversations' && parts.length === 2 && req.method === 'PATCH') {
        await updateConversation(tenantId, parts[1], await readBody(req));
        return json(res, 200, { ok: true });
      }
      // Is the current workspace the demo? (drives the demo banner)
      if (parts[0] === 'demo' && parts[1] === 'status' && req.method === 'GET') {
        return json(res, 200, { demo: await isDemoTenant(tenantId) });
      }
      // ---- AI Command Bar ----
      if (parts[0] === 'command' && parts.length === 1 && req.method === 'POST') {
        const cl = commandLimiter.check(`cmd:${session?.userId ?? clientIp(req)}`, RULES.command);
        if (!cl.allowed) return json(res, 429, { error: 'too many commands, slow down' }, { 'Retry-After': String(Math.ceil(cl.retryAfterMs / 1000)) });
        const { json: b } = await readBodyLimited(req, MAX_BODY.command);
        if (!b.text || !b.text.trim()) return json(res, 422, { error: 'command text required' });
        return json(res, 200, await runCommand(tenantId, {
          text: b.text, funnelId: b.funnelId, tab: b.tab, leadId: b.leadId, leakId: b.leakId,
        }, llmFor(tenantId)));
      }
      if (parts[0] === 'command' && parts.length === 3 && parts[2] === 'apply' && req.method === 'POST') {
        const b = await readBody(req);
        return json(res, 200, await applyCommand(tenantId, parts[1], { confirmBulk: b.confirmBulk === true || b.confirmPhrase === 'أكّد التنفيذ الجماعي' }));
      }
      if (parts[0] === 'command' && parts.length === 3 && parts[2] === 'discard' && req.method === 'POST') {
        return json(res, 200, await discardCommand(tenantId, parts[1]));
      }
      if (parts[0] === 'commands' && parts.length === 2 && parts[1] === 'history' && req.method === 'GET') {
        return json(res, 200, await commandHistory(tenantId, url.searchParams.get('funnelId') ?? undefined));
      }
      // ---- integrations (session-scoped) ----
      if (parts[0] === 'integrations' && parts.length === 1) {
        if (req.method === 'GET') return json(res, 200, { providers: listProviders(), connections: await listConnections(tenantId, url.searchParams.get('funnelId') ?? undefined) });
        if (req.method === 'POST') {
          const b = await readBody(req);
          if (!b.provider) return json(res, 422, { error: 'provider required' });
          const conn = await createConnection(tenantId, b);
          return conn ? json(res, 201, conn) : json(res, 422, { error: 'unknown provider' });
        }
      }
      if (parts[0] === 'integrations' && parts.length === 2) {
        const id = parts[1];
        if (req.method === 'GET') { const c = await getConnection(tenantId, id); return c ? json(res, 200, c) : json(res, 404, { error: 'not found' }); }
        if (req.method === 'PATCH') return json(res, 200, await updateConnection(tenantId, id, await readBody(req)) ?? { error: 'not found' });
        if (req.method === 'DELETE') return json(res, 200, await deleteConnection(tenantId, id));
      }
      if (parts[0] === 'integrations' && parts.length === 3 && req.method === 'POST') {
        const id = parts[1];
        if (parts[2] === 'test') {
          // outbound webhooks get a signed sample; others get a config health check
          const conn = await getConnection(tenantId, id);
          if (conn && (conn.provider === 'outbound_webhook' || conn.provider === 'zapier_make_webhook')) {
            return json(res, 200, await testOutboundWebhook(tenantId, id));
          }
          return json(res, 200, await healthCheck(tenantId, id) ?? { error: 'not found' });
        }
        if (parts[2] === 'rotate-secret') {
          const b = await readBody(req);
          if (!b.field || !b.value) return json(res, 422, { error: 'field and value required' });
          return json(res, 200, await rotateSecret(tenantId, id, b.field, b.value) ?? { error: 'not found' });
        }
        if (parts[2] === 'health') return json(res, 200, await healthCheck(tenantId, id) ?? { error: 'not found' });
      }
      if (parts[0] === 'integrations' && parts.length === 3 && parts[2] === 'events' && req.method === 'GET') {
        return json(res, 200, await getIntegrationEvents(tenantId, parts[1]));
      }
      // ---- repairs ----
      if (parts[0] === 'repairs' && parts.length === 2 && req.method === 'GET') {
        const r = await getRepair(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'repairs' && parts.length === 3 && req.method === 'POST') {
        const id = parts[1];
        if (parts[2] === 'approve') return json(res, 200, await approveRepair(tenantId, id));
        if (parts[2] === 'reject') return json(res, 200, await rejectRepair(tenantId, id));
        if (parts[2] === 'apply') return json(res, 200, await applyRepair(tenantId, id, llmFor(tenantId)));
        if (parts[2] === 'switch-strategy') return json(res, 200, await switchToAlternative(tenantId, id));
      }
      if (parts[0] === 'repair-learning' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await learningRollup(tenantId));
      }
      // ---- adaptive playbooks ----
      if (parts[0] === 'playbooks' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await listPlaybooks(tenantId));
      }
      if (parts[0] === 'playbooks' && parts.length === 2 && parts[1] === 'regenerate' && req.method === 'POST') {
        return json(res, 200, await regeneratePlaybooks(tenantId));
      }
      if (parts[0] === 'playbooks' && parts.length === 3 && parts[1] === 'explain' && req.method === 'GET') {
        return json(res, 200, await explainPlaybook(tenantId, parts[2] as any));
      }
      if (parts[0] === 'playbooks' && parts.length === 2 && parts[1] === 'apply' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.playbookType || !b.funnelId) return json(res, 422, { error: 'playbookType and funnelId required' });
        return json(res, 200, await recordApplication(tenantId, b));
      }
      // ---- playbook application plans (apply a playbook to an existing funnel) ----
      if (parts[0] === 'funnels' && parts.length === 4 && parts[2] === 'playbook-application' && req.method === 'POST') {
        // POST /funnels/:id/playbook-application/:scope
        const r = await planPlaybookApplication(tenantId, parts[1], parts[3] as any);
        return json(res, 200, r);
      }
      if (parts[0] === 'funnels' && parts.length === 3 && parts[2] === 'playbook-applications' && req.method === 'GET') {
        return json(res, 200, await listApplicationPlans(tenantId, parts[1]));
      }
      if (parts[0] === 'playbook-applications' && parts.length === 2 && req.method === 'GET') {
        const r = await getApplicationPlan(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'playbook-applications' && parts.length === 3 && req.method === 'POST') {
        const id = parts[1];
        if (parts[2] === 'approve') return json(res, 200, await approveApplication(tenantId, id));
        if (parts[2] === 'reject') return json(res, 200, await rejectApplication(tenantId, id));
        if (parts[2] === 'apply') return json(res, 200, await applyPlaybookApplication(tenantId, id));
        if (parts[2] === 'measure') {
          const r = await measureApplicationOutcome(tenantId, id);
          return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
        }
      }
      if (parts[0] === 'playbook-applications' && parts.length === 3 && parts[2] === 'outcomes' && req.method === 'GET') {
        return json(res, 200, await listApplicationOutcomes(tenantId, parts[1]));
      }
      if (parts[0] === 'playbook-application-outcomes' && parts.length === 3 && parts[2] === 'confirm' && req.method === 'POST') {
        return json(res, 200, await confirmApplicationOutcome(tenantId, parts[1]));
      }
      if (parts[0] === 'playbook-application-summary' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await applicationOutcomeSummary(tenantId));
      }
      // ---- portfolio intelligence (Sprint 23) ----
      if (parts[0] === 'portfolio' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await getPortfolioMetrics(tenantId));
      }
      if (parts[0] === 'portfolio' && parts.length === 2 && parts[1] === 'analyze' && req.method === 'POST') {
        return json(res, 200, await analyzePortfolio(tenantId));
      }
      if (parts[0] === 'portfolio' && parts.length === 2 && parts[1] === 'insights' && req.method === 'GET') {
        return json(res, 200, await listInsights(tenantId, (url.searchParams.get('status') as string) || 'open'));
      }
      if (parts[0] === 'portfolio' && parts.length === 3 && parts[1] === 'insights' && req.method === 'PATCH') {
        const b = await readBody(req);
        return json(res, 200, await updateInsight(tenantId, parts[2], b.status || 'reviewed'));
      }
      if (parts[0] === 'portfolio' && parts.length === 2 && parts[1] === 'snapshots' && req.method === 'GET') {
        return json(res, 200, await listSnapshots(tenantId));
      }
      if (parts[0] === 'portfolio' && parts.length === 2 && parts[1] === 'transfer-playbook-plan' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.targetFunnelId || !b.playbookType) return json(res, 422, { error: 'targetFunnelId and playbookType required' });
        return json(res, 200, await transferPlaybookPlan(tenantId, b));
      }
      // ---- scheduled intelligence / operating rhythm (Sprint 24) ----
      if (parts[0] === 'scheduled' && parts.length === 2 && req.method === 'POST') {
        if (parts[1] === 'daily-refresh') return json(res, 200, await dailyBusinessRefresh(tenantId));
        if (parts[1] === 'weekly-report') return json(res, 200, await weeklyBusinessReport(tenantId));
        if (parts[1] === 'portfolio-refresh') return json(res, 200, await portfolioAnalysisRefresh(tenantId));
        if (parts[1] === 'outcomes-due-check') {
          const rd = await repairOutcomeDueCheck(tenantId);
          const ad = await applicationOutcomeDueCheck(tenantId);
          return json(res, 200, { repairs: rd, applications: ad });
        }
        if (parts[1] === 'stale-check') return json(res, 200, await staleDataCheck(tenantId));
        if (parts[1] === 'run-now') {
          const b = await readBody(req);
          const job = b.job as string;
          if (job === 'daily') return json(res, 200, await dailyBusinessRefresh(tenantId));
          if (job === 'weekly') return json(res, 200, await weeklyBusinessReport(tenantId));
          if (job === 'portfolio') return json(res, 200, await portfolioAnalysisRefresh(tenantId));
          if (job === 'outcomes') return json(res, 200, { repairs: await repairOutcomeDueCheck(tenantId), applications: await applicationOutcomeDueCheck(tenantId) });
          return json(res, 422, { error: 'unknown job' });
        }
      }
      if (parts[0] === 'scheduled' && parts.length === 2 && parts[1] === 'runs' && req.method === 'GET') {
        return json(res, 200, await listRuns(tenantId));
      }
      if (parts[0] === 'scheduled' && parts.length === 3 && parts[1] === 'runs' && req.method === 'GET') {
        const r = await getRun(tenantId, parts[2]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'scheduled' && parts.length === 2 && parts[1] === 'status' && req.method === 'GET') {
        return json(res, 200, await rhythmStatus(tenantId));
      }
      // ---- revenue opportunities (Sprint 25) ----
      if (parts[0] === 'funnels' && parts.length === 4 && parts[2] === 'opportunities' && parts[3] === 'refresh' && req.method === 'POST') {
        return json(res, 200, await refreshOpportunities(tenantId, parts[1]));
      }
      if (parts[0] === 'funnels' && parts.length === 3 && parts[2] === 'opportunities' && req.method === 'GET') {
        return json(res, 200, await listOpportunities(tenantId, parts[1], (url.searchParams.get('filter') as string) || 'all'));
      }
      if (parts[0] === 'opportunities' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await listOpportunities(tenantId, null, (url.searchParams.get('filter') as string) || 'all'));
      }
      if (parts[0] === 'opportunities' && parts.length === 2 && parts[1] === 'summary' && req.method === 'GET') {
        return json(res, 200, await opportunitySummary(tenantId));
      }
      if (parts[0] === 'opportunities' && parts.length === 2 && parts[1] === 'learning' && req.method === 'GET') {
        return json(res, 200, await getOppLearning(tenantId));
      }
      if (parts[0] === 'opportunities' && parts.length === 3 && parts[1] === 'outcomes' && parts[2] === 'summary' && req.method === 'GET') {
        return json(res, 200, await outcomesSummary(tenantId));
      }
      if (parts[0] === 'opportunities' && parts.length === 3 && parts[2] === 'outcome' && req.method === 'GET') {
        const r = await getOpportunityOutcome(tenantId, parts[1]);
        return json(res, 200, r ?? { status: null });
      }
      if (parts[0] === 'opportunities' && parts.length === 4 && parts[2] === 'outcome' && parts[3] === 'check' && req.method === 'POST') {
        const r = await checkOpportunityOutcome(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      // ---- revenue attribution (Sprint 27) ----
      if (parts[0] === 'opportunities' && parts.length === 4 && parts[2] === 'attribution' && parts[3] === 'run' && req.method === 'POST') {
        const r = await runAttribution(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'opportunities' && parts.length === 3 && parts[2] === 'attribution' && req.method === 'GET') {
        const r = await getAttribution(tenantId, parts[1]);
        return json(res, 200, r ?? { attribution: null });
      }
      if (parts[0] === 'attribution' && parts.length === 2 && parts[1] === 'summary' && req.method === 'GET') {
        return json(res, 200, await attributionSummary(tenantId));
      }
      if (parts[0] === 'attribution' && parts.length === 2 && parts[1] === 'learning' && req.method === 'GET') {
        return json(res, 200, await getAttributionLearning(tenantId));
      }
      if (parts[0] === 'attribution' && parts.length === 2 && parts[1] === 'recompute' && req.method === 'POST') {
        // recompute attribution for all captured opportunities without one
        const ids = await (async () => { try { const { withTenant } = await import('../../../packages/db/src/router.js'); return await withTenant(tenantId, async (c: any) => (await c.query(`SELECT id FROM revenue_opportunities WHERE status='captured' AND id NOT IN (SELECT opportunity_id FROM revenue_attributions WHERE opportunity_id IS NOT NULL) LIMIT 100`)).rows.map((r: any) => r.id)); } catch { return []; } })();
        let n = 0; for (const id of ids) { await runAttribution(tenantId, id).catch(() => null); n++; }
        return json(res, 200, { recomputed: n });
      }
      // ---- action recommendations (Sprint 28) ----
      if (parts[0] === 'recommendations' && parts.length === 2 && parts[1] === 'refresh' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.funnelId) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, await refreshRecommendations(tenantId, b.funnelId));
      }
      if (parts[0] === 'recommendations' && parts.length === 2 && parts[1] === 'summary' && req.method === 'GET') {
        return json(res, 200, await recommendationsSummary(tenantId, url.searchParams.get('funnelId') || undefined));
      }
      if (parts[0] === 'recommendations' && parts.length === 2 && parts[1] === 'learning' && req.method === 'GET') {
        return json(res, 200, await getRecLearning(tenantId));
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[1] === 'outcomes' && parts[2] === 'summary' && req.method === 'GET') {
        return json(res, 200, await recOutcomesSummary(tenantId, url.searchParams.get('funnelId') || undefined));
      }
      if (parts[0] === 'recommendations' && parts.length === 4 && parts[2] === 'outcome' && parts[3] === 'check' && req.method === 'POST') {
        const r = await checkRecommendationOutcome(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[2] === 'outcome' && req.method === 'GET') {
        return json(res, 200, await getRecommendationOutcome(tenantId, parts[1]) ?? { status: null });
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[2] === 'mark-worked' && req.method === 'POST') {
        const b = await readBody(req); return json(res, 200, await markRecOutcome(tenantId, parts[1], 'worked', b.reason || 'user confirmed'));
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[2] === 'mark-no-result' && req.method === 'POST') {
        const b = await readBody(req); return json(res, 200, await markRecOutcome(tenantId, parts[1], 'no_result', b.reason || 'user marked no result'));
      }
      if (parts[0] === 'recommendations' && parts.length === 1 && req.method === 'GET') {
        return json(res, 200, await listRecommendations(tenantId, url.searchParams.get('funnelId'), (url.searchParams.get('filter') as string) || 'all'));
      }
      if (parts[0] === 'recommendations' && parts.length === 2 && req.method === 'GET') {
        const r = await getRecommendation(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[2] === 'apply' && req.method === 'POST') {
        const b = await readBody(req);
        return json(res, 200, await applyRecommendation(tenantId, parts[1], b.approved === true));
      }
      if (parts[0] === 'recommendations' && parts.length === 3 && parts[2] === 'dismiss' && req.method === 'POST') {
        const b = await readBody(req);
        return json(res, 200, await dismissRecommendation(tenantId, parts[1], b.reason));
      }
      if (parts[0] === 'opportunities' && parts.length === 3 && parts[2] === 'recommendations' && req.method === 'POST') {
        return json(res, 200, await recommendForOpportunityId(tenantId, parts[1]));
      }
      // ---- revenue desk (Sprint 33) ----
      if (parts[0] === 'revenue-desk' && parts.length === 1 && req.method === 'GET') {
        const fid = url.searchParams.get('funnelId');
        if (!fid) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, await getRevenueDesk(tenantId, fid));
      }
      if (parts[0] === 'revenue-desk' && parts.length === 2 && parts[1] === 'summary' && req.method === 'GET') {
        const fid = url.searchParams.get('funnelId');
        if (!fid) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, await revenueDeskSummary(tenantId, fid));
      }
      // ---- activation (Sprint 36) ----
      if (parts[0] === 'activation' && parts.length === 1 && req.method === 'GET') {
        const fid = url.searchParams.get('funnelId');
        if (!fid) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, await getActivationStatus(tenantId, fid));
      }
      if (parts[0] === 'activation' && parts.length === 2 && parts[1] === 'summary' && req.method === 'GET') {
        const fid = url.searchParams.get('funnelId');
        if (!fid) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, await activationSummary(tenantId, fid));
      }
      if (parts[0] === 'activation' && parts.length === 2 && parts[1] === 'next' && req.method === 'GET') {
        const fid = url.searchParams.get('funnelId');
        if (!fid) return json(res, 422, { error: 'funnelId required' });
        return json(res, 200, { next: await getNextActivationAction(tenantId, fid) });
      }
      if (parts[0] === 'opportunities' && parts.length === 2 && req.method === 'GET') {
        const r = await getOpportunity(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'opportunities' && parts.length === 2 && req.method === 'PATCH') {
        const b = await readBody(req);
        if (b.status === 'in_progress') return json(res, 200, await markInProgress(tenantId, parts[1]));
        if (b.status === 'captured') return json(res, 200, await markCaptured(tenantId, parts[1]));
        if (b.status === 'dismissed') return json(res, 200, await dismissOpportunity(tenantId, parts[1]));
        return json(res, 422, { error: 'unknown status' });
      }
      if (parts[0] === 'opportunities' && parts.length === 3 && req.method === 'POST') {
        const id = parts[1];
        if (parts[2] === 'create-task') return json(res, 200, await createTaskForOpportunity(tenantId, id));
        if (parts[2] === 'mark-captured') { const b = await readBody(req); return json(res, 200, await markOutcome(tenantId, id, 'captured', b.reason || 'user confirmed')); }
        if (parts[2] === 'mark-missed') { const b = await readBody(req); return json(res, 200, await markOutcome(tenantId, id, 'missed', b.reason || 'user marked missed')); }
        if (parts[2] === 'dismiss') return json(res, 200, await dismissOpportunity(tenantId, id));
      }
      if (parts[0] === 'playbook-application-steps' && parts.length === 2 && req.method === 'PATCH') {
        return json(res, 200, await patchApplicationStep(tenantId, parts[1], await readBody(req)));
      }
      if (parts[0] === 'repairs' && parts.length === 4 && parts[2] === 'outcomes' && parts[3] === 'measure' && req.method === 'POST') {
        const r = await measureOutcome(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'repairs' && parts.length === 3 && parts[2] === 'outcomes' && req.method === 'GET') {
        return json(res, 200, await listOutcomes(tenantId, parts[1]));
      }
      if (parts[0] === 'repair-outcomes' && parts.length === 3 && req.method === 'POST') {
        const id = parts[1];
        if (parts[2] === 'confirm') return json(res, 200, await confirmOutcome(tenantId, id));
        if (parts[2] === 'next-action') {
          // build a fresh repair for the same leak as the "next action"
          const o = await listOutcomes(tenantId, id).catch(() => []);
          return json(res, 200, { ok: true, note: 'استخدم «ابنِ خطة إصلاح» على التسريب لبناء إصلاح تالي.' });
        }
      }
      if (parts[0] === 'repairs' && parts.length === 3 && parts[2] === 'status' && req.method === 'GET') {
        const r = await repairStatus(tenantId, parts[1]);
        return r ? json(res, 200, r) : json(res, 404, { error: 'not found' });
      }
      if (parts[0] === 'repair-steps' && parts.length === 2 && req.method === 'PATCH') {
        return json(res, 200, await patchRepairStep(tenantId, parts[1], await readBody(req)));
      }
      // ---- /actions/:id + /reports/:id ----
      if (parts[0] === 'actions' && parts.length === 2 && req.method === 'PATCH') {
        const b = await readBody(req);
        if (!b.status) return json(res, 422, { error: 'status required' });
        await updateActionStatus(tenantId, parts[1], b.status, b.snoozeHours);
        return json(res, 200, { ok: true });
      }
      if (parts[0] === 'reports' && parts.length === 3 && parts[2] === 'reviewed' && req.method === 'POST') {
        await markReportReviewed(tenantId, parts[1]);
        return json(res, 200, { ok: true });
      }
      // ---- /payment-methods/:id ----
      if (parts[0] === 'payment-methods' && parts.length === 2) {
        if (req.method === 'PATCH') { await updatePaymentMethod(tenantId, parts[1], await readBody(req)); return json(res, 200, { ok: true }); }
        if (req.method === 'DELETE') { await deletePaymentMethod(tenantId, parts[1]); return json(res, 200, { ok: true }); }
      }
      // ---- /whatsapp-flow-steps/:id + reorder ----
      if (parts[0] === 'whatsapp-flow-steps' && parts.length === 2 && parts[1] === 'reorder' && req.method === 'POST') {
        const b = await readBody(req);
        if (!b.flowId || !Array.isArray(b.orderedIds)) return json(res, 422, { error: 'flowId and orderedIds[] required' });
        await reorderWaSteps(tenantId, b.flowId, b.orderedIds);
        return json(res, 200, { ok: true });
      }
      if (parts[0] === 'whatsapp-flow-steps' && parts.length === 2) {
        if (req.method === 'PATCH') { await updateWaStep(tenantId, parts[1], await readBody(req)); return json(res, 200, { ok: true }); }
        if (req.method === 'DELETE') { await deleteWaStep(tenantId, parts[1]); return json(res, 200, { ok: true }); }
      }
      // ---- /leaks/:id ----
      if (parts[0] === 'leaks' && parts.length === 2 && req.method === 'PATCH') {
        const b = await readBody(req);
        if (!b.status) return json(res, 422, { error: 'status required' });
        await updateLeakStatus(tenantId, parts[1], b.status);
        return json(res, 200, { ok: true });
      }
      if (parts[0] === 'leaks' && parts.length === 4 && parts[2] === 'actions' && parts[3] === 'task' && req.method === 'POST') {
        // Repair action: create a follow-up task from a leak (leak → action link).
        const b = await readBody(req);
        if (!b.leadId || !b.title) return json(res, 422, { error: 'leadId and title required' });
        return json(res, 201, { id: await createTask(tenantId, b.leadId, { title: b.title, kind: b.kind }) });
      }

      return json(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof PayloadTooLarge) return json(res, 413, { error: 'payload too large' });
      return json(res, 500, { error: (err as Error).message });
    }
  });
}

// Runnable entry.
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.API_PORT || 8787);
  const server = createApiServer();
  server.listen(port, () => console.log(`Automation API listening on :${port}`));
  process.on('SIGINT', async () => { server.close(); await closeAll(); process.exit(0); });
}
