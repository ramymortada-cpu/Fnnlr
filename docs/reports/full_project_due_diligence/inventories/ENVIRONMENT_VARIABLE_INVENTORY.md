# Environment Variable Inventory

Source: modules/release/src/env-spec.ts, .env.production.example, and env usage search. Values are not printed.

| Variable | Source file | Purpose | Required/optional | Client/server exposure risk | Secret/non-secret | Example present | Recommendation |
|---|---|---|---|---|---|---|---|
| NODE_ENV | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| CONTROL_PLANE_DATABASE_URL | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| TENANT_DB_ADMIN_URL | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| TENANT_DB_HOST | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| TENANT_DB_PORT | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| TENANT_DB_PREFIX | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| TENANT_CREDENTIAL_ENCRYPTION_KEY | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| INTEGRATION_ENCRYPTION_KEY | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| FNNLR_CRON_SECRET | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Required/production-sensitive | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| ANTHROPIC_API_KEY | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| API_PORT | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| SCHEDULER_INTERVAL_MS | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| FNNLR_DISABLE_JOBS | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| FNNLR_DEV_MODE | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Non-secret | Yes | Keep out of client bundles and validate in CI |
| APP_BASE_URL | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
| API_BASE_URL | modules/release/src/env-spec.ts or deployment template | See ENV_SPEC / deployment template | Optional or deployment-level | Server-side expected | Secret or sensitive | Yes | Keep out of client bundles and validate in CI |
