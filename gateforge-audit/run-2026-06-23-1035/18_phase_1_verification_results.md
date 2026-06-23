# Phase 1 Verification Results

Last execution timestamp: `2026-06-23 11:26:25 EEST`

| Command | Purpose | Result | Failures | Related To Phase 1 |
|---|---|---|---|---|
| `npm run typecheck` | Static TypeScript verification | PASS | None | Yes |
| `npx tsx --test tests/auth.test.ts tests/brains.test.ts tests/integrations.test.ts tests/route-matrix.test.ts tests/gateforge-controls.test.ts tests/data-lifecycle.test.ts` | Focused Phase 1 security/AI/webhook/data lifecycle tests | PASS: 31 tests | None | Yes |
| `npm test` | Full local unit/security suite | PASS: 483 tests, 455 pass, 28 skipped, 0 fail | Live DB tests skipped by design | Yes |
| `npm run ci` | Local release CI aggregate | PASS / SAFE TO RELEASE | Live DB skipped because no --live/env | Yes |
| `npm run audit:high` | Dependency high/critical vulnerability evidence | PASS: found 0 vulnerabilities | None | Yes |
| `npm run sbom:generate` | SBOM evidence generation | PASS: `16aaffd212b8fa111c2449ffc28f62c7f72bcb8cc847e3a228a1a0756f6e6059` | None | Yes |
| `npm run proof:check -- docs` | Commercial/support proof docs checker | PASS | None | Yes |
| `npm run commercial:check -- docs` | Commercial packaging checker | PASS | None | Yes |
| `npm run deploy:smoke` | Local deployment smoke safety | PASS | None | Yes |
| `npm run test:pg` | Live Postgres isolation/runtime suite | SKIPPED | No `CONTROL_PLANE_DATABASE_URL` + `TENANT_DB_ADMIN_URL` | Yes; BLOCKED_BY_ENVIRONMENT |
| `npm run ci:live` | Hosted/staging-like CI with live DB | FAIL/BLOCKED_BY_ENVIRONMENT | `live_db_tests — no live DB configured` | Yes; BLOCKED_BY_ENVIRONMENT |
| `npm run deploy:health-gate` | Deployment health gate | FAIL/BLOCKED_BY_ENVIRONMENT | `CONTROL_PLANE_DATABASE_URL` missing; jobs/integrations/LLM/AI budget/email/observability degraded | Yes; BLOCKED_BY_ENVIRONMENT |
| `npm run deploy:verify-restore -- control <sample-manifest>` | Restore verification gate using local sample manifest | FAIL/BLOCKED_BY_ENVIRONMENT | No live restore DB/schema; missing `tenants`, `users`, `workspaces`, `workspace_members` | Yes; BLOCKED_BY_ENVIRONMENT |

No production deploy, destructive DB command, live payment API, live LLM call, or real email send was executed.
