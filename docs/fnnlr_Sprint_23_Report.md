# fnnlr — Sprint 23 Build Report (Multi-Funnel Portfolio Intelligence)

fnnlr stopped learning inside one funnel at a time. It now understands **all the funnels in a business, compares them, and extracts learning that transfers across them** — which funnel converts best, which playbook that worked in funnel A could lift funnel B. Honest by construction: it never ranks or declares a "best funnel" without enough comparable data — it says "not enough comparable data yet." This is an intelligence layer, not a BI dashboard. **224 tests, 222 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Portfolio comparison (`modules/portfolio/src/compare.ts`, pure & tested)
`comparePortfolio` takes per-funnel metric bags and produces evidence-based cross-funnel insights, with **minimum-data gating on every comparison**: CTA rate needs ≥30 page views on both funnels, WhatsApp strength needs ≥10 clicks, payment friction needs ≥5 payment-state leads. A **"strongest funnel" is declared only when ≥2 categories are comparable** — otherwise an honest `insufficient_data` insight. `funnelHealth` is a transparent weighted sum of real signals (published, tracking, leads, views, CTA clicks, paid, minus open leaks and waiting-payment). `findTransferable` detects a measured-improved source funnel and a same-market target weak in the same area, and proposes a transfer — never across different markets, never auto-applied.

### 2. Portfolio service (`modules/portfolio/src/service.ts`)
`getPortfolioMetrics` gathers comparable metrics for every funnel in the business (health, page, WhatsApp, payment, follow-up, and learning outcomes across repairs + applications). `analyzePortfolio` runs the comparison + transfer detection, archives previous open insights (no stale lingering), persists fresh insights + a snapshot. `transferPlaybookPlan` builds a **proposed** playbook application plan on the target funnel (reusing Sprint 21's engine — preview + approval, no auto-apply). `portfolioReportSummary` feeds the weekly report.

### 3. Data model (migration 0021)
`portfolio_insights` (insight_type, evidence, confidence, affected_funnels, recommended_action, status) and `portfolio_snapshots` (metrics + insights over time). No warehouse.

### 4. UI — Portfolio screen + funnel list health
A new **محفظة القمعات** screen: funnel cards with a transparent health score, leads/leaks/views/paid, published/tracking badges, and improvement badges; plus an **insights panel** with evidence, confidence, and — for transferable playbooks — an **اعمل خطة نقل** button that builds the proposed application on the target. An executive intelligence screen, not a chart wall. The **funnel list** on the dashboard now shows each funnel's health score, leads, open-leak count, and not-published / no-tracking flags.

### 5. Command Bar
New intents — "قارن القمعات", "أنهي قمع أقوى؟", "فين أضعف قمع؟", "إيه القمعات اللي محتاجة إصلاح؟", "انقل playbook ناجح لقمع تاني", "إيه أفضل offer angle عندي؟" — analyze the portfolio and return the most relevant evidence-based insight with confidence. No fabricated rankings.

### 6. Action Center
Surfaces open portfolio insights — transferable playbooks (priority 75) and underperforming-page / payment-friction / missing-tracking notices (68) — as cross-funnel actions.

### 7. Weekly Report
Adds a portfolio line: number of funnels, the strongest (if enough data), how many need attention, transferable count, and an explicit "some comparisons lack sufficient data" note when relevant.

### 8. API endpoints
```
GET  /portfolio                        per-funnel comparable metrics + health
POST /portfolio/analyze                 compute + persist insights
GET  /portfolio/insights[?status=]      list insights
PATCH /portfolio/insights/:id           review / ignore
GET  /portfolio/snapshots               history
POST /portfolio/transfer-playbook-plan  propose a transfer (preview + approval)
```

## Tests added (12)
Single funnel → insufficient_data · **CTA needs min views on both** · CTA produced with enough views · **payment needs min payment leads** · **no fake strongest funnel without ≥2 comparable categories** · strongest emerges with ≥2 categories · every insight carries evidence + affected funnels · transferable detected (improved source + weak same-market target) · **no transfer across different markets** · health reflects real signals · command routes portfolio intents · portfolio routes reject header tenant in production.

## Acceptance — all met
Portfolio module exists ✓ · gathers metrics for all funnels ✓ · **no comparison without minimum data** ✓ · insights carry evidence ✓ · suggests transferable playbooks ✓ · **no auto-apply** ✓ · portfolio UI ✓ · funnel list shows health/status ✓ · Command Bar compares funnels ✓ · Action Center receives portfolio insights ✓ · Report mentions cross-funnel learnings ✓ · tests green ✓ · RTL premium ✓ · **no huge BI dashboard** ✓ · **no fake ranking** ✓.

## Strict prohibitions respected
No fake rankings · no "best funnel" without enough data · no analytics dashboard bloat · no auto-apply · no auto-archiving/deleting funnels (archive is a suggestion only) · no auto-send · no payment processing · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real multi-funnel data · `ANTHROPIC_API_KEY` optional.

## The intelligence now spans the whole business
Single funnel: Build → Track → Diagnose → Repair → Measure → Learn → Apply → Measure. Across funnels: **Compare → Detect transferable wins → Propose safe transfers → Approve → Apply → Measure again.** Every step evidence-gated, approval-gated, honest about confidence.

## Next: Sprint 24 — workspace-level scheduled intelligence (periodic re-analysis + digest), or begin actual pilot onboarding.
