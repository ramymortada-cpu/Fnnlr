## fnnlr — Sprint 42 Report (Customer Zero Friction Fix Pack)

This sprint turns the first-72h operating experience into concrete clarity fixes — no new features, no new intelligence loop, no large redesign. Every change is tied to a documented friction item: outputs that named a check but not the next action, a critical issue with no enforced owner, support having to stitch several surfaces together, and runbooks that needed verification against real commands. Core logic was left untouched except where a friction item was a genuine output-clarity or safety gap.

**Result: 427 tests. Without a DB, 400 pass and 27 skip with an explicit reason. On real Postgres, the friction support-pack smoke passes, alongside go-live, execution-lock, and operating-room (all green). Typecheck clean. Web balanced, no `x-tenant-id` trust.**

### Friction inventory (documented first — `docs/CUSTOMER_ZERO_FRICTION_INVENTORY.md`)
Seven items, each with location, what's confusing, why it matters, impact, the proposed small fix, and acceptance. Nothing was fixed before the inventory was written, per the sprint rule.

### F1 — launch-check messages are now actionable
Every failing `launchCheck` item names the missing thing **and** the route/script to run next. Before: "page published" (same text whether ok or fail). After: "page not published → publish in Funnel → Page, then re-run customer:launch-check". The same applies to funnel (offer/page/link/payment), environment (DB/encryption/cron), and signals (page event/lead). Verified live: every failing launch-check item includes a route or action.

### F2 — execution lock nextAction tells you what to run
BLOCKED now reads "BLOCKED: <missing step>. Fix it, then re-run customer:launch-check and customer:execution-lock." WARN explains the owner/expectation and that you may proceed if it's expected (e.g. no traffic yet). READY states exactly what was verified (release checker, manifest, activation, page/link/payment, operating room, support snapshot).

### F3 — Revenue Desk activation-mode copy reads as normal, not failure
The desk banner now says explicitly that having no opportunities before observed data is normal — not an operational failure — and that it switches to live mode automatically once a real signal arrives, with a "كمّل التفعيل" route. A test asserts the reassuring copy is present.

### F5 — issue log guards critical incidents
`logIssue` now throws if a P0/P1 issue has no owner or no next action — a critical incident can no longer be logged in a droppable state. Tested both ways.

### F6 — one safe support pack (`customer:support-pack`, admin-only)
`supportPack` gathers, in one payload for the support operator: activation, daily check, 72h monitor, issues, latest audit events, latest integration failures, latest scheduled runs — composing existing surfaces, no parallel truth, no secrets, no raw credentials, no stack traces. Verified live: the pack includes issues + daily check + activation and leaks nothing.

### F7 — runbooks verified against real commands
A test scans every runbook for `npm run <script>` and asserts each exists in `package.json`, and that no operational runbook prescribes a manual DB edit as a normal path. Manually re-verified across RUNBOOK, RELEASE_NOTES, CUSTOMER_ZERO_RUNBOOK, LAUNCH_DAY, and 72H_REPORT — every referenced command exists.

### Command pack + admin API
New: `customer:support-pack` (CLI) and `/admin/support-pack` (admin-only). All friction fixes are output-only or safety guards; no new product surface.

### Tests
- `tests/friction.test.ts` (5): P0 without owner rejected; P1 without next action rejected; runbooks reference only existing scripts and never promote manual DB edits as normal; support-pack endpoint admin-only; desk activation copy reassures.
- Live: the **friction support-pack smoke** — launch-check failing items name a route, support pack is safe and includes issues + daily check + activation. Green on real Postgres, alongside go-live, execution-lock, and operating-room.
- All prior suites remain green.

### Acceptance — all met
Friction inventory written ✓ · script outputs clearer ✓ · activation blockers clearer (route per non-done step, kept) ✓ · Revenue Desk setup mode clearer ✓ · execution lock messages clearer ✓ · 72h update customer-safe (unchanged, already safe; re-verified) ✓ · issue log usable + guarded ✓ · support pack present ✓ · runbooks verified ✓ · tests green ✓ · live DB smoke green ✓ · no new feature ✓ · no fake data ✓ · no fake revenue ✓.

### Remaining risks (honest)
- The in-session embedded Postgres is slow to cold-start and the sandbox reaps background processes between shells; the friction smoke + go-live + execution-lock + operating-room live tests were confirmed green on a real Postgres instance this sprint. Production CI must run `npm run test:pg` on every deploy.
- The runbook-scripts test scans `npm run` references; commands invoked another way (bare `tsx`, curl examples) aren't covered by that scan — they were checked manually this sprint.
- F4 (activation blocked-state route buttons) needed no code change: the panel already renders a route button for each non-done step. It is listed in the inventory as verified-present rather than newly fixed, to avoid a redesign the sprint prohibits.
- Clarity fixes are copy/message-level; they don't change what is true, only how clearly it is stated. The underlying checks and decisions are unchanged.

### Status
Operating the first real customer no longer needs a developer narrating each step. Every blocker names its missing piece and the script to run, every WARN carries an owner/expectation, every READY says what was verified, the Revenue Desk's pre-signal state reads as normal, critical issues can't be logged without an owner, support has a single safe pack, and the runbooks are verified to reference only real commands — with nothing fabricated and nothing hidden.
