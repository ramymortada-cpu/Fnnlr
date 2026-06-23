# fnnlr — Backup & Restore Runbook

Backups and a verified restore are required before claiming production-ready.
Commands refuse to run without a DB URL and never print the URL or any secret.

## Backup
```
npm run db:backup -- "$CONTROL_PLANE_DATABASE_URL" control_backup.sql
npm run db:backup -- "$ONE_TENANT_DATABASE_URL"   tenant_backup.sql
```

## Restore into a TEST database (never production)
```
npm run db:restore-test -- "$TEST_DATABASE_URL" control_backup.sql
```

## Verify the restore
```
npm run db:verify-restore -- "$TEST_DATABASE_URL" control
npm run db:verify-restore -- "$TEST_TENANT_DATABASE_URL" tenant
```
Verification checks that the critical tables exist (control: tenants, users,
workspaces, workspace_members; tenant: businesses, journeys, offers, pages,
tracked_links, leads, payment_states, audit_events). It prints **no data and no
secrets** — only PASS/FAIL and any missing tables.

## Rules
- Restore only into a test DB during drills. Never restore over production except
  on confirmed data corruption with explicit approval (see ROLLBACK_RUNBOOK).
- A backup command with a missing/invalid URL refuses and exits non-zero.
