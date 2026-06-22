# fnnlr — Sprint 20 Build Report (Adaptive Revenue Playbooks)

fnnlr stopped waiting for a leak to happen before it learns. It now turns accumulated repair learning into **playbooks that shape how the next funnel, offer, page, WhatsApp flow, and payment flow are built** — from the start. **Learning → Better Funnel Creation.** Honest by construction: confidence comes only from observed, decided outcomes; with thin data it says "learning data is still limited; using default playbook" and falls back to the heuristic. Nothing is auto-applied. **189 tests, 187 pass, 0 fail, 2 skip. Typecheck clean. RTL premium.**

## What was built

### 1. Playbook builder (`modules/playbooks/src/builder.ts`, pure & tested)
`buildPlaybook` / `buildAllPlaybooks` aggregate learning records (mapped from repair types) into the six playbook types — funnel, offer, page, whatsapp, payment, followup — each with a recommendation (summary + adjustments + note), an evidence summary (sample size, decided count, improved count, success rate), confidence, and a fallback reason. The same honesty discipline as Sprint 19: success rate over **decided** outcomes only, confidence gated by decided sample size (`<3 low`, `3–10 medium`, `>10 high`), **never high when most records are awaiting/inconclusive**. With thin data it returns the default (heuristic) adjustments + an honest note; a learning-backed adjustment is prepended only with enough decided successes. `playbookToContext` condenses a playbook into a short prompt string.

### 2. Playbook service (`modules/playbooks/src/service.ts`)
`regeneratePlaybooks` rebuilds + upserts all playbooks (global + market-scoped) from current learning, archiving the previous set so stale confidence never lingers. `getPlaybookContext` serves fresh context to the brains (prefers market scope when it has data). `recordApplication` logs when a playbook informed an object (user-driven, never auto). `explainPlaybook` powers the command bar. `playbookReportSummary` feeds the weekly report. Playbooks are **regenerated automatically after each outcome measurement** so the memory stays current.

### 3. Data model (migration 0018)
`adaptive_playbooks` (scope, playbook_type, market/funnel_type/product_type/payment_method, recommendation, evidence_summary, sample_size, confidence, status) and `playbook_applications` (which playbook informed which object, when, by whom, effect_observed).

### 4. Brains use playbooks
`playbookContext` is threaded into the FunnelArchitect, Offer, Page, WhatsAppSales, and PaymentFlow brain inputs and injected into every prompt ("use cautiously, do not overclaim"). The FunnelArchitect now returns `playbookNotes` (and its deterministic fallback states whether learning was limited). Each brain call site fetches the relevant playbook context first; when learning isn't available yet, it proceeds with defaults — no failure, no fabrication.

### 5. Playbook UI
A new **أدلة الإيراد الذكية** screen (sidebar) lists each playbook with type, market scope, confidence badge, sample/decided counts, success rate, the concrete adjustments, and an honest note — plus a **حدّث من التعلّم** button. A small control screen showing fnnlr is learning, not a benchmark dashboard. The onboarding result now shows a **📚 ملاحظة تعلّم** when the funnel was shaped by (or fell back from) learning.

### 6. Command Bar
New intents — "ليه رتبت القمع كده؟" (explain_funnel_reasoning), "اعرض/استخدم playbook…" (explain_playbook), "إيه اللي اتعلمناه عن الدفع؟" (what_learned_payment) — return the playbook's confidence, sample size, decided count, note, and adjustments. They never claim false certainty.

### 7. Weekly Report
Adds a playbook-insights line: which playbooks are active (have data) and how many types still have insufficient data — alongside the Sprint 18/19 repair + learning rollups. No exaggeration.

## Tests added (13 + 3 command assertions)
Aggregation by mapped type · confidence low <3 decided · medium/high by size · **no high confidence from mostly inconclusive/awaiting** · usable default when insufficient · learned adjustment only with enough decided+success · market scoping · all six types built · context honest about limited data · **FunnelArchitect + PageBrain prompts include playbook context** · fallback states limited learning · playbook routes reject header tenant in production · command classifier routes the three new playbook intents.

## Acceptance — all met
Playbooks module exists ✓ · playbooks generated from learning records ✓ · each has sample size/confidence/evidence ✓ · FunnelArchitect uses playbook context ✓ · PageBrain ✓ · WhatsAppSalesBrain ✓ · PaymentFlowBrain ✓ · UI shows learning notes ✓ · Command Bar explains playbooks ✓ · Weekly Report mentions playbook insights ✓ · **no fake confidence** ✓ · no big benchmark dashboard ✓ · tests green ✓ · RTL premium ✓.

## Strict prohibitions respected
No fake best practices · no high confidence without enough data · no benchmark dashboard · no auto-apply without approval · no auto-send · no payment processing · no docs-instead-of-code · no polish-only · no unrelated integrations.

## Needs credentials only
Postgres for the 2 skipped live-DB tests and real playbook accumulation (outcomes must be measured over time to build the learning the playbooks read) · `ANTHROPIC_API_KEY` optional (brains fall back honestly without it).

## Next: Sprint 21 — cross-funnel playbook application (apply a playbook's structure to an existing funnel with preview + approval), or begin actual pilot onboarding.
