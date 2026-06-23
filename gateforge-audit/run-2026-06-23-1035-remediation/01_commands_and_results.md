# Commands And Results

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | TypeScript clean after code changes. |
| `npx tsx --test tests/auth.test.ts tests/brains.test.ts tests/integrations.test.ts tests/route-matrix.test.ts tests/gateforge-controls.test.ts tests/data-lifecycle.test.ts` | PASS | 31 focused tests pass. |
| `npm test` | PASS | 483 tests, 455 pass, 28 skipped, 0 fail. |
| `npm run ci` | PASS | SAFE TO RELEASE locally; live DB skipped. |
| `npm run audit:high` | PASS | found 0 vulnerabilities. |
| `npm run sbom:generate` | PASS | `gateforge-audit/evidence/sbom.json`, sha256 `233ecbf450571b864dcc255f1575028707580f1dda440b57b54865826360b0e6`. |
| `npm run deploy:smoke` | PASS | server starts, health ok, unsigned cron rejected, unknown webhook rejected, bad public route safe. |
| `npm run deploy:verify-restore -- control <sample-tables>` | PASS | Pure restore verifier passed for critical control tables. |
| `npm run deploy:verify-restore -- tenant <sample-tables>` | PASS | Pure restore verifier passed for critical tenant tables. |
| `npm run test:pg` | SKIPPED | 28 live DB tests skipped; no `CONTROL_PLANE_DATABASE_URL` + `TENANT_DB_ADMIN_URL` in this shell. |
| `npm run ci:live` | BLOCKED_BY_ENV | Fails honestly: no live DB configured. |
| `npm run deploy:health-gate` | BLOCKED_BY_ENV | No control DB/env/secrets/monitor/email config in this shell. |

No secrets were printed. Live DB and deployment evidence must be rerun in staging.
