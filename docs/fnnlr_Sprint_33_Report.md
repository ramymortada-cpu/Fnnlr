# fnnlr — Sprint 33 Report (Revenue Desk / UX Coherence)

The Sprint 30 audit's other major gap wasn't depth — fnnlr has plenty — it was **coherence**. Operating signals were scattered across Action Center, Opportunities, Recommendations, Repairs, Leaks, Reports, Rhythm and the Command Bar, and inside the action builder twelve genuinely different concepts were all flattened to one type (`resolve_leak`). A business owner couldn't tell a diagnosis from an opportunity from a repair. Sprint 33 fixes that with **one surface: the Revenue Desk** — "this is the most important thing now, this is why, this is the action." No new intelligence, no new integrations, no auto-anything.

**Result: 344 tests. On real Postgres all 344 pass, 0 skipped. Without a DB, 334 pass and 10 skip with an explicit reason. Typecheck clean. RTL premium.**

## 1. Operating-object taxonomy (`modules/revenue-desk/src/taxonomy.ts`)

A single source of truth for **what an item is**. 26 real types across 7 domains (diagnosis, opportunity, recommendation, repair, playbook, task, system) — replacing the catch-all `resolve_leak`. Every type carries an Arabic label, an icon, a severity, a primary-action verb, a target route, and the desk section it belongs to. `legacyCodeToType()` maps any old `resolve_leak` item to its real type by code prefix, so existing data migrates safely instead of being lost.

The five concepts the audit flagged as collapsed are now provably distinct: `leak_detected`, `repair_plan_pending_approval`, `revenue_opportunity`, `best_next_action`, `playbook_application_pending` are five different types, not one.

## 2. Aggregator with real deduplication (`aggregator.ts`, pure)

`buildDesk(src)` takes every signal and produces one deduped, prioritized, sectioned desk. The dedupe rules the audit asked for:
- **Opportunity + its recommendation → ONE item.** The recommended action is folded into the opportunity title ("فرصة دفع منتظرة — أفضل إجراء: ابعت تذكير") and the recommendation is exposed as a secondary, never shown as a separate card.
- **Leak + repair plan → the repair**, not the raw leak (the leak is suppressed).
- **Repair outcome due → one measurement item**, not both a repair card and an outcome card.
- **Task for a lead already surfaced as an opportunity → suppressed** (the opportunity already covers that lead).

Dedupe keys are domain + source id (`opportunity:`, `recommendation:`, `repair:`, `leak:`, `task:`, …).

## 3. Explained priority (no black box)

Each item gets a `priorityScore` (urgency bonus + known value + recommendation-backing) and a plain-Arabic `whyRankedHere` ("فرصة عالية، قيمة معروفة، فيه توصية مدعومة بالتعلّم"). Items are ordered by severity then score. The top item is the single "most important thing now."

## 4. Service + API (`service.ts`)

`getRevenueDesk(tenantId, funnelId)` gathers all sources in **one tenant scope** (opportunities with a lateral join to their live recommendation, recommendations, pending/measurable repairs, open leaks, playbook applications, overdue tasks, scheduled failures, weekly-report-ready) and runs the pure aggregator. `revenueDeskSummary` powers the dashboard + command bar. New routes: `GET /revenue-desk?funnelId=` and `GET /revenue-desk/summary?funnelId=` (422 without a funnel id, 401 on header-only tenant in production).

## 5. UI — the Revenue Desk is now the primary surface

- A **desk overlay** with the top item highlighted, then the 7 sections (اعمل دلوقتي · تنتظر موافقتك · فرص الإيراد · محتاجة قياس · التشخيص · التقارير · انتباه النظام), each item showing icon, title, type label, evidence, why-ranked, value if known, and a primary-action button that routes to the right place.
- A **dashboard strip** at the very top — "أهم حاجة دلوقتي" with counts (total / waiting approval / needs measurement) and a one-tap open. This is the new first thing a user sees.
- A **nav item** at the top of the sidebar, query-param auto-open (`?desk=1`), and a `funnel.html` redirect so deep links land correctly.

Action Center logic is preserved as a data source (no actions lost), but the Revenue Desk is now the mental model.

## 6. Command Bar (`intents.ts` + `executor.ts`)

Five new intents wired to the aggregator: `open_revenue_desk` ("افتح مكتب الإيراد"), `top_five_things` ("هات أهم ٥ حاجات"), `whats_waiting_approval` ("إيه محتاج موافقة؟"), `whats_needs_measurement`, `whats_blocked` ("فيه حاجة واقفة؟"). Each answers from the live desk.

**Collision fix:** the initial routing was too greedy — "افتح مكتب الإيراد" matched on "الإيراد" alone and swallowed "اتعلمنا إيه من فرص الإيراد؟", and "محتاج قياس" collided with the Sprint-24 "إيه اللي محتاج قياس؟". Tightened so `open_revenue_desk` requires the explicit word "مكتب" (or "desk"), and the measurement phrase stays with the established Sprint-24 intent. Verified: the two older intents still route correctly, and the desk intents work.

## 7. Weekly report integration

The weekly business report now carries a `revenueDesk` snapshot (top item + counts for the primary funnel), so the team summary reflects the same operating surface.

## 8. Action builder refactor (`modules/actions/src/builder.ts`)

`ActionItem` gained `deskType`, `domain`, `sourceType`, `sourceId`. Every item is stamped with its real type via `legacyCodeToType` before return — so the catch-all `resolve_leak` no longer hides distinct concepts, while backward compatibility (the old `type` field) is preserved.

## Tests (`tests/revenue-desk.test.ts`, 10, all green)
Taxonomy completeness · legacy codes map to five distinct types · opportunity+recommendation dedupe into one · leak+repair shows the repair · repair-outcome-due appears once · task deduped against opportunity lead · priority explained + severity-ordered · sections ordered + counts · command routing · API rejects header-only tenant. Plus the full suite stays green and **passes 344/344 on real Postgres**.

## Acceptance — all met
Taxonomy clear ✓ · `resolve_leak` no longer covers different concepts ✓ · aggregator exists ✓ · dedupe works ✓ · Revenue Desk UI ✓ · dashboard built around it ✓ · command bar uses it ✓ · weekly report uses the summary ✓ · a user can tell opportunity/recommendation/repair/task apart ✓ · tests green ✓ · RTL premium ✓ · no new features beyond coherence ✓.

## Remaining risks (honest)
- The Action Center old UI still exists as a data source per spec; the desk is the primary surface, but a follow-up could retire the old Action Center screen entirely once usage confirms no one relies on it.
- The phrase "إيه اللي محتاج قياس؟" intentionally routes to the Sprint-24 `what_needs_measuring` intent (not the desk's `whats_needs_measurement`); the desk's measurement view is still reachable via the UI and the other phrasings. Acceptable, but worth unifying the two measurement concepts in a later pass.
- Priority weights are heuristic and explained, not learned. That's deliberate for coherence work; learning-tuned ranking would be a separate, instrumented change.

## Next (audit sequence): Sprint 34 — Security Hardening (rate limiting on /auth + capture, session rotation, webhook fail-closed defaults), or Sprint 35 — Scheduler/Ingestion Scaling.
