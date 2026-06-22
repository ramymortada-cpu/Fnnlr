# fnnlr — Rollback Runbook

Rollback is **non-destructive by default**. No database is dropped. A restore from
backup is only ever done on confirmed data corruption, with explicit approval.

```
npm run deploy:rollback-plan            # the safe, non-destructive plan
npm run deploy:rollback-plan -- --confirm   # includes restore-from-backup (corruption only)
```

## Default (non-destructive) sequence
1. Stop jobs — `FNNLR_DISABLE_JOBS=true` (cron endpoints return 503).
2. Disable outbound retries (do not delete deliveries).
3. Pause integrations (inbound rejected safely, not lost).
4. Roll back the app to the previous known-good version. **DB is preserved.**
5. Preserve the DB — never drop or truncate any database.
6. Record the rollback in audit/ops (reason + who approved).

## Destructive (explicit approval only)
- Restore from a **verified** backup — only on confirmed data corruption.
- There is **no** "drop tenant DB" step. The plan never drops a tenant database.

## Rules
- No destructive rollback by default.
- Never hide a degraded/blocked health state during or after rollback.
