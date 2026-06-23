# System Architecture

Claim: Architecture uses a control plane plus per-tenant database model
Evidence: packages/db/src/router.ts; packages/db/control-plane/migrations; packages/db/tenant/migrations
Analysis: Control data handles tenants/auth/routes while tenant DBs hold business/funnel/lead data.
Risk: Operational complexity and live DB testing are higher than single-schema SaaS.
Recommendation: Keep live isolation tests mandatory.
Confidence: High

Diagrams: SYSTEM_CONTEXT, REQUEST_LIFECYCLE, DATA_FLOW, DATABASE_ERD, DEPLOYMENT_ARCHITECTURE.
