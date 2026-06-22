# fnnlr — Customer Zero Friction Inventory (Sprint 42)

Documented from the actual outputs of the deployment / operating / execution
scripts before any fix. Each item: location · what's confusing · why it matters ·
impact · proposed small fix · acceptance.

## F1 — launch-check fail messages don't say what to do
- **Location**: `launchCheck` (`modules/execution/src/service.ts`), every `mk('fail', …)`.
- **Confusing**: a fail reads "page published" or "tracked link exists" — the
  same text whether ok or fail; it names the check, not the missing action.
- **Why it matters**: an operator reading BLOCKED can't tell the next step.
- **Impact**: support has to translate each line manually.
- **Fix**: every check carries an explicit message that, when failing, names the
  missing thing AND the route/script to run next.
- **Acceptance**: every failing launch-check item includes a route or script.

## F2 — execution lock nextAction is just the first blocking line
- **Location**: `executionLock` `nextAction` (`modules/execution/src/service.ts`).
- **Confusing**: nextAction echoes a raw blocking message with no "what to run".
- **Impact**: operator doesn't know which script unblocks them.
- **Fix**: BLOCKED nextAction names the missing step + the script to re-run
  (`customer:launch-check` / `customer:execution-lock`).
- **Acceptance**: BLOCKED execution lock nextAction references a script.

## F3 — Revenue Desk activation-mode banner could read as a failure
- **Location**: desk overlay banner (`apps/web/index.html`).
- **Confusing**: an empty-looking desk can feel like an operational failure.
- **Why it matters**: the customer/operator may think something broke.
- **Fix**: the banner already exists; tighten copy so it explicitly says
  "no opportunities before observed data is normal" and shows the next step.
- **Acceptance**: a test asserts the desk activation copy explains this.

## F4 — activation steps: blocked state copy is thin
- **Location**: activation engine step evidence (`modules/activation/src/engine.ts`).
- **Confusing**: a `blocked` step says e.g. "محتاج تعمل صفحة الأول" but the panel
  doesn't consistently surface the route button for blocked steps.
- **Impact**: user doesn't know where to click.
- **Fix**: the UI already routes per step; ensure blocked steps render the route
  button (verified in panel). No engine change needed beyond copy already present.
- **Acceptance**: each non-done step has a nextAction + route (already true; keep).

## F5 — issue log: P0/P1 without an owner is dangerous
- **Location**: `logIssue` (`modules/execution/src/issues.ts`).
- **Confusing**: nothing enforces an owner / next action on a critical issue.
- **Why it matters**: a P0 with no owner is a silently dropped incident.
- **Fix**: `logIssue` throws if a P0/P1 has no owner or no next action.
- **Acceptance**: a test asserts P0/P1 requires owner + nextAction.

## F6 — no single safe support pack
- **Location**: support has to call several endpoints/scripts separately.
- **Confusing**: triage requires stitching activation + lock + daily check + issues.
- **Fix**: add `customer:support-pack` that gathers them in one safe payload
  (no secrets, no stack traces), for the support operator.
- **Acceptance**: support-pack includes issues + daily check and leaks no secrets.

## F7 — runbooks must reference only real commands
- **Location**: docs/CUSTOMER_ZERO_*.md, RUNBOOK.md, RELEASE_NOTES.md.
- **Fix**: a test scans the runbooks for `npm run <script>` and asserts each
  exists in package.json; no "manual DB edit" as a normal path.
- **Acceptance**: runbook-scripts test passes.

## Out of scope (explicitly not changed)
- No new feature, no new intelligence loop, no large UX redesign.
- Core logic untouched except where a friction item is a genuine blocker
  (F1/F2 are output-clarity, F5 is a safety guard, F6 is operating-only).
