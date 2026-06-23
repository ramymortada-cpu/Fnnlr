# Phase 1 War Board Update

| Finding ID | Before | After | War Board Status | Next Action |
|---|---|---|---|---|
| P0-001 | Missing live DB evidence | Local suite ready; no DB env | `BLOCKED_BY_ENVIRONMENT` | Provide staging Postgres env and rerun `test:pg` + `ci:live`. |
| P0-002/P0-003 | Health/restore evidence missing | Smoke passes; health/restore need env | `BLOCKED_BY_ENVIRONMENT` | Configure staging env and run health gate + backup/restore drill. |
| P0-007 | Admin MFA missing | Code/tests/migration implemented | `PARTIAL` | Run migration and MFA setup/verify on staging. |
| P0-008 | AI cost caps missing | Guard/tests/usage table implemented | `PARTIAL` | Configure caps and archive allowed/blocked usage rows. |
| P0-009 | Webhook replay evidence partial | Replay freshness tests pass | `PARTIAL` | Run provider-signed webhook duplicate/stale tests in staging. |

P0 items remain first priority. SEO/GEO, UI polish, and enterprise docs remain out of Phase 1.
