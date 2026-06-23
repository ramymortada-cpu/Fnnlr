# Developer Onboarding Guide

Prerequisites: Node.js, npm, PostgreSQL for live DB tests, TypeScript runtime via tsx.

Setup: clone; run `npm install`; fill environment from `.env.production.example`; for live DB set `CONTROL_PLANE_DATABASE_URL` and `TENANT_DB_ADMIN_URL`.

Commands: `npm run typecheck`, `npm test`, `npm run ci`, `npm run test:pg`, `npm run api`.

Troubleshooting: skipped live tests mean DB env is missing; release checker failures map to `modules/release/src/env-spec.ts`; missing `ANTHROPIC_API_KEY` causes degraded AI fallback, not crash.

Conventions: domain modules under `modules/*/src`; migrations under `packages/db/*/migrations`; scripts under `scripts`; tests under `tests`.
