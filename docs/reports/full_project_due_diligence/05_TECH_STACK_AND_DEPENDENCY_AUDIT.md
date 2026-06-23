# Tech Stack and Dependency Audit

Claim: The runtime stack is small and TypeScript/Node/PostgreSQL centered
Evidence: package.json; tsconfig.json; package-lock.json; apps/api/src/server.ts; packages/db
Analysis: Only pg is a runtime dependency; tsx/typescript are dev tooling. Static HTML powers frontend.
Risk: Minimal dependencies reduce supply-chain surface but increase custom maintenance.
Recommendation: Add dependency/license/audit jobs.
Confidence: High

See DEPENDENCY_INVENTORY.csv and TECH_STACK_LAYERS.mmd.
