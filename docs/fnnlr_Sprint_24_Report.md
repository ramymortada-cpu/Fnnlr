# fnnlr — Sprint 24 Build Report (Scheduled Intelligence + Operating Rhythm)

fnnlr stopped waiting for the user to run everything by hand. It now has a daily and weekly **operating rhythm** — it observes, refreshes, measures-when-due, and surfaces what needs attention, all through idempotent, audited jobs that produce records inside fnnlr. No external sending, no auto-apply, no fabricated results. This is an operating rhythm inside the product, not a scheduler platform or a notification system. **233 tests, 231 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Due-detection logic (`modules/scheduler/src/due.ts`, pure & tested)
`detectDue` decides which applied repairs / playbook applications are due for (re-)measurement: **never before the minimum window has passed**, due when never-measured / awaiting_data / early_signal once the window passes, and **never for a settled outcome** (improved/no_change/worsened/inconclusive). `isStale` flags an artifact that was never refreshed or is past its interval. Same honesty gate as the measurement engines — the scheduler surfaces what's due, it does not fabricate verdicts.

### 2. Scheduled run framework + jobs (`modules/scheduler/src/service.ts`)
Every run is **idempotent** (a unique index on `job_type + idempotency_key`; a completed run returns without re-executing — daily keyed by date, weekly by ISO week), **audited** (`scheduled_runs` + per-item `scheduled_run_items`), and **safe to retry** (failures recorded, status transitions tracked). Jobs:
- **daily_business_refresh** — orchestrates the rhythm: lists funnels, refreshes actions, re-diagnoses leaks *only where there's enough observed data* (skips and records the skip otherwise), runs repair + application outcome-due checks, refreshes portfolio insights, runs the stale check, and writes an owner-facing summary (funnels checked, new leaks, actions, due counts, portfolio insights, items skipped for insufficient data).
- **weekly_business_report** — a business/workspace-level report: top funnels by health, funnels needing attention, portfolio summary, and per-funnel headlines. No fake rankings, no fake ROI.
- **repair_outcome_due_check** / **playbook_application_outcome_due_check** — surface what's due (does not measure; measurement stays explicit per item).
- **portfolio_analysis_refresh**, **stale_data_check**.

### 3. Data model (migration 0022)
`scheduled_runs` (job_type, target, status, idempotency_key, started/finished, error, summary) with a unique idempotency index, `scheduled_run_items` (per-item audit), and minimal stale fields (`portfolio_insights.stale/last_refreshed_at`, `leak_findings.last_refreshed_at`, `reports.stale`).

### 4. Operating Rhythm UI + dashboard
A new **نبض التشغيل** screen: last daily refresh / last weekly report / open + stale insight counts, **run-now** buttons (daily refresh, weekly report, portfolio refresh, check outcomes due) — each safe + idempotent — and a recent-runs audit list with status. The **dashboard** gains a rhythm strip showing the last intelligence refresh and items needing attention, with a one-tap "حدّث دلوقتي".

### 5. Command Bar
New intents — "حدّث ذكاء البيزنس" (daily refresh), "اعمل تقرير أسبوعي للبيزنس", "إيه اللي محتاج قياس؟", "إيه اللي اتأخر؟", "حدّث portfolio insights", "قيس كل المستحقة" — each explains what ran, the scope, and a result summary. The refresh result reports idempotently ("already ran today") rather than re-doing work.

### 6. Action Center
Receives rhythm signals: repairs awaiting measurement past their window (priority 72) and stale portfolio insights needing a refresh (64).

### 7. API endpoints
```
POST /scheduled/daily-refresh | /weekly-report | /portfolio-refresh | /outcomes-due-check | /stale-check | /run-now
GET  /scheduled/runs · /scheduled/runs/:id · /scheduled/status
POST /internal/cron/:job        SECURED by x-cron-secret; tenant from body, never the header
```

### 8. Secured internal cron
The optional `/internal/cron/:job` endpoint requires `x-cron-secret` matching `FNNLR_CRON_SECRET` and takes the tenant from the (secret-authenticated) body — **never** from `x-tenant-id`. Unsigned or wrong-secret calls are rejected with 401; a correct secret without a body tenant is 422.

## Tests added (9)
Not due before the window · due when never-measured + window passed · awaiting_data window-passed · early_signal re-check · **settled outcomes never due** · isStale behavior · command routes the rhythm intents · scheduled routes reject header tenant in production · **cron endpoint rejects unsigned/wrong-secret and never trusts the tenant header**. (DB-backed idempotency + run records run in the live suite.)

## Acceptance — all met
Scheduled runs table ✓ · daily refresh idempotent ✓ · weekly business report ✓ · outcome-due detection ✓ · portfolio refresh in the run ✓ · Action Center updated from rhythm signals ✓ · Operating Rhythm UI ✓ · dashboard shows last refresh ✓ · Command Bar runs refresh/report ✓ · runs have audit + summary ✓ · **no external sending** ✓ · **no auto-apply** ✓ · **no fake impact** ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No email/notification system · no WhatsApp auto-send · no autonomous repair apply · no fake weekly results · no huge analytics dashboard · no complex queue infra (plain idempotent runs) · no external messaging · no payment processing · no docs-instead-of-code · no polish-only.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real scheduled accumulation · `FNNLR_CRON_SECRET` to enable the internal cron trigger · an external scheduler (system cron / platform scheduler) to hit `/internal/cron/*` on a daily/weekly cadence · `ANTHROPIC_API_KEY` optional.

## fnnlr now has a pulse
It no longer waits to be driven. On a daily and weekly rhythm it observes, refreshes, measures what's due, learns, and raises the right actions — without sending anything externally and without any destructive execution. Every run is idempotent, auditable, and honest about what it did and what it skipped.

## Next: Sprint 25 — owner digest delivery rails (in-app first, opt-in external later), or begin actual pilot onboarding.
