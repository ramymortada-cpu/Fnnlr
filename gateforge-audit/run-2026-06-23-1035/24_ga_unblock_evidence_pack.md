# GA Unblock Evidence Pack

Generated: `2026-06-23T08:56:17.678Z`

Gate decision: `CANNOT_APPROVE`

Score movement: `78-84/100 pending legal/provider attestation`

Evidence context: `DISPOSABLE_LOCAL_STAGING_POSTGRES`

Set `GATEFORGE_EVIDENCE_CONTEXT` to describe the run environment, for example `DISPOSABLE_LOCAL_STAGING_POSTGRES`, `HOSTED_STAGING`, or `PRODUCTION_READ_ONLY`.

## Environment Inputs

Present env count: `17/17`

Missing env names, values redacted/not printed:

- None

## Command Evidence

| Command | Class | Result | Exit | Notes |
| --- | --- | --- | --- | --- |
| `npm run typecheck` | LOCAL | PASS | 0 | Static TypeScript verification. |
| `npx tsx --test tests/auth.test.ts tests/brains.test.ts tests/integrations.test.ts tests/route-matrix.test.ts tests/gateforge-controls.test.ts tests/data-lifecycle.test.ts` | LOCAL | PASS | 0 | Focused GateForge Phase 1 controls. |
| `npm test` | LOCAL | PASS | 0 | Full local test suite. |
| `npm run ci` | LOCAL | PASS | 0 | Local aggregate release safety. |
| `npm run audit:high` | LOCAL | PASS | 0 | High/critical dependency audit. |
| `npm run sbom:generate` | LOCAL | PASS | 0 | SBOM evidence generation. |
| `npm run proof:check -- docs` | LOCAL | PASS | 0 | Proof pack consistency. |
| `npm run commercial:check -- docs` | LOCAL | PASS | 0 | Commercial packaging consistency. |
| `npm run deploy:smoke` | LOCAL | PASS | 0 | Local deployment smoke. |
| `npm run test:pg` | STAGING_LIVE | PASS | 0 | Live Postgres tenant isolation proof. |
| `npm run ci:live` | STAGING_LIVE | PASS | 0 | Hosted/staging CI proof. |
| `npm run deploy:health-gate` | STAGING_LIVE | PASS | 0 | Runtime production health gate. |
| `npm run deploy:verify-restore -- control gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/control-restore-manifest.json` | STAGING_LIVE | PASS | 0 | Restore verification probe; requires restored DB/schema evidence to PASS. |

## Evidence Logs

Sanitized logs are under `gateforge-audit/run-2026-06-23-1035/ga-unblock-evidence/`.
