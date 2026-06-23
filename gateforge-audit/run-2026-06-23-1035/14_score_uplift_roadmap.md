# Score Uplift Roadmap

Gate decision comes before score. Score ranges below require real evidence, not assertions.

## Current State

- Gate Decision: `CANNOT_APPROVE` for GA; `CONDITIONAL_GO_CANDIDATE` locally after remediation overlay.
- Score: `74/100`
- Evidence Confidence: `MEDIUM`
- Main blockers: staging/live DB evidence, restore drill, monitoring/alerting, legal attestation, AI/admin/webhook runtime proof.

## After Phase 1 — Emergency Gate Rescue

- Target Gate Decision: `CONDITIONAL_GO` for controlled GA/private-public transition.
- Target Score Range: `78-82`
- P0 blockers closed: live DB proof, restore drill, health gate, admin MFA proof, AI cap proof, webhook proof, monitoring proof.
- Evidence required: archived staging command output plus human legal status.
- Remaining risks: enterprise procurement, UX polish, growth maturity.

## After Phase 2 — Public Beta Hardening

- Target Gate Decision: `CONDITIONAL_GO` / `PRIVATE_BETA_ONLY` removed for broader public beta.
- Target Score Range: `82-87`
- P1 risks closed: email, SBOM hosted artifact, export/delete proof, activation telemetry, billing/limits stance, PII logging evidence.
- Evidence required: provider DNS, GitHub artifact, customer telemetry, retention proof.
- Remaining risks: enterprise readiness and global UX depth.

## After Phase 3 — Global SaaS Readiness

- Target Gate Decision: `GO` if Phase 1/2 evidence is strong and legal is approved.
- Target Score Range: `87-92`
- Domains improved: UX/UI, admin/customer portal, enterprise docs, localization, support maturity.
- Evidence required: design QA, portal workflow QA, support SLA proof.
- Remaining risks: SEO/GEO and enterprise procurement depth.

## After Phase 4 — Growth & Enterprise Readiness

- Target Gate Decision: `GO` / enterprise-ready candidate.
- Target Score Range: `92-95+`
- Growth/enterprise improvements: SEO/GEO, trust center, DPA/SLA/procurement, global readiness.
- Evidence required: search artifacts, trust center, procurement pack, legal/security review.
- Remaining risks: do not claim 100 without every applicable critical control strongly evidenced.

| Phase | Current Score | Target Score | Gate Change | Main Fixes | Evidence Needed | Confidence |
|---|---:|---:|---|---|---|---|
| Phase 1 | 74 | 78-82 | CANNOT_APPROVE -> CONDITIONAL_GO | P0 runtime evidence and safety proof | staging DB, restore, monitoring, legal status, AI/admin/webhook proof | Medium |
| Phase 2 | 78-82 | 82-87 | Conditional broader beta | P1 email/SBOM/export/billing/logging | provider/CI/customer lifecycle evidence | Medium |
| Phase 3 | 82-87 | 87-92 | GO candidate | UX/admin/support/docs | QA artifacts and workflow evidence | Medium |
| Phase 4 | 87-92 | 92-95+ | Enterprise-ready candidate | SEO/GEO/trust/procurement | external/legal/security evidence | Low-Medium |
