#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';

type Priority = 'P0' | 'P1' | 'P2' | 'P3';
type Status = 'BLOCKED_EXTERNAL' | 'READY_NOW' | 'NEXT' | 'LATER';

type Action = {
  id: string;
  phase: string;
  priority: Priority;
  status: Status;
  owner: string;
  action: string;
  moat: string;
  evidence: string;
  command?: string;
};

const outMd = 'docs/SAAS_MOAT_ACTION_PLAN.md';
const outCsv = 'docs/SAAS_MOAT_ACTION_PLAN.csv';
const statusMd = 'docs/SAAS_MOAT_EXECUTION_STATUS.md';
const statusJson = 'docs/SAAS_MOAT_EXECUTION_STATUS.json';
const checkOnly = process.argv.includes('--check');
const statusOnly = process.argv.includes('--status');
const requiredEvidenceFiles = [
  'docs/TRUST_CENTER_INDEX.md',
  'docs/LEGAL_APPROVAL_TRACKER.md',
  'docs/SUBPROCESSORS.md',
  'docs/SECURITY_CONTACT_AND_DISCLOSURE.md',
  'docs/INCIDENT_RESPONSE_EXERCISE.md',
  'docs/AUDIT_LOG_VIEWER_BACKLOG.md',
  'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md',
  'docs/PRICING_AND_LIMITS_MATRIX.md',
  'docs/USAGE_LIMIT_ENFORCEMENT_MAP.md',
  'docs/ACTIVATION_METRICS_SPEC.md',
  'docs/ACTIVATION_COHORT_REVIEW.md',
  'docs/ONBOARDING_RECOVERY_SEQUENCE.md',
  'docs/WORKFLOW_INTELLIGENCE_SPEC.md',
  'docs/ADMIN_ONBOARDING_CHECKLIST.md',
  'docs/ENTERPRISE_READINESS_BACKLOG.md',
  'docs/PROCUREMENT_CHECKLIST.md',
  'docs/SSO_OIDC_READINESS.md',
  'docs/SOC2_READINESS_OUTLINE.md',
  'docs/DATA_RESIDENCY_POSITION.md',
  'docs/WEEKLY_MOAT_REVIEW_TEMPLATE.md',
  'docs/CUSTOMER_HEALTH_SCORE_SPEC.md',
  'docs/SUPPORT_TRIAGE_TAXONOMY.md',
  'docs/AI_SPEND_REVIEW_TEMPLATE.md',
  'docs/TEMPLATE_PERFORMANCE_REVIEW.md',
  'docs/FOUNDER_LED_DEMO_SCRIPT.md',
  'docs/OBJECTION_HANDLING_LIBRARY.md',
  'docs/PARTNER_AGENCY_PROGRAM.md',
  'docs/CASE_STUDY_TEMPLATE.md',
  'docs/ICP_OUTREACH_SEQUENCE.md',
  'docs/industry-templates/real-estate.md',
  'docs/industry-templates/clinics.md',
  'docs/industry-templates/education.md',
  'docs/industry-templates/agencies.md',
  'docs/industry-templates/ecommerce.md',
];
const evidenceFilesByActionId: Record<string, string[]> = {
  'TR-001': ['docs/LEGAL_APPROVAL_TRACKER.md'],
  'TR-002': ['docs/LEGAL_APPROVAL_TRACKER.md'],
  'TR-003': ['docs/LEGAL_APPROVAL_TRACKER.md'],
  'TR-004': ['docs/SUBPROCESSORS.md'],
  'TR-005': ['docs/DATA_LIFECYCLE.md', 'docs/DATA_EXPORT_DELETE_UI_BACKLOG.md'],
  'TR-006': ['docs/SECURITY_CONTACT_AND_DISCLOSURE.md'],
  'TR-007': ['docs/TRUST_CENTER_INDEX.md'],
  'TR-008': ['docs/BACKUP_RESTORE_RUNBOOK.md'],
  'TR-009': ['docs/AUDIT_LOG_VIEWER_BACKLOG.md', 'modules/enterprise/src/audit-log-readiness.ts', 'tests/audit-log-readiness.test.ts'],
  'TR-010': ['docs/DATA_EXPORT_DELETE_UI_BACKLOG.md', 'modules/data-lifecycle/src/readiness.ts', 'tests/data-lifecycle-readiness.test.ts'],
  'TR-011': ['docs/DATA_EXPORT_DELETE_UI_BACKLOG.md', 'modules/data-lifecycle/src/readiness.ts', 'tests/data-lifecycle-readiness.test.ts'],
  'TR-012': ['docs/INCIDENT_RESPONSE_EXERCISE.md', 'modules/operating-room/src/incident-readiness.ts', 'tests/incident-readiness.test.ts'],
  'PK-001': ['docs/COMPETITIVE_POSITIONING.md'],
  'PK-002': ['docs/PRICING_AND_LIMITS_MATRIX.md'],
  'PK-003': ['docs/PRICING_AND_LIMITS_MATRIX.md'],
  'PK-004': ['docs/PRICING_AND_LIMITS_MATRIX.md'],
  'PK-005': ['docs/PRICING_AND_LIMITS_MATRIX.md'],
  'PK-006': ['docs/USAGE_LIMIT_ENFORCEMENT_MAP.md', 'modules/commercial/src/limits.ts', 'modules/commercial/src/enforcement-readiness.ts', 'tests/commercial-enforcement-readiness.test.ts'],
  'PK-007': ['docs/USAGE_LIMIT_ENFORCEMENT_MAP.md', 'tests/commercial-limits.test.ts', 'modules/commercial/src/enforcement-readiness.ts', 'tests/commercial-enforcement-readiness.test.ts'],
  'PK-008': ['docs/CUSTOMER_PROOF_PACK.md'],
  'PK-009': ['docs/COMMERCIAL_PACKAGING.md', 'docs/PRICING_AND_LIMITS_MATRIX.md'],
  'PK-010': ['docs/SUPPORT_WORKFLOW.md', 'docs/PRICING_AND_LIMITS_MATRIX.md'],
  'WI-001': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'packages/db/tenant/migrations/0031_ai_workflow_intelligence.sql'],
  'WI-002': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'packages/ai-core/src/gateway.ts'],
  'WI-003': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'modules/ai-ops/src/workflow-intelligence.ts', 'tests/workflow-intelligence.test.ts'],
  'WI-004': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'modules/ai-ops/src/workflow-intelligence.ts', 'tests/workflow-intelligence.test.ts'],
  'WI-005': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'modules/ai-ops/src/workflow-intelligence.ts', 'tests/workflow-intelligence.test.ts'],
  'WI-006': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'modules/ai-ops/src/workflow-intelligence.ts', 'tests/workflow-intelligence.test.ts'],
  'WI-007': ['docs/AI_SPEND_REVIEW_TEMPLATE.md', 'modules/ai-ops/src/dashboard-readiness.ts', 'tests/workflow-intelligence.test.ts'],
  'WI-008': ['docs/WORKFLOW_INTELLIGENCE_SPEC.md', 'modules/ai-ops/src/dashboard-readiness.ts', 'tests/workflow-intelligence.test.ts'],
  'AC-001': ['docs/ONBOARDING_PROMISE.md', 'docs/ACTIVATION_METRICS_SPEC.md'],
  'AC-002': ['docs/ACTIVATION_METRICS_SPEC.md', 'apps/web/onboarding.html', 'modules/activation/src/metrics.ts', 'modules/activation/src/onboarding-readiness.ts', 'tests/onboarding-readiness.test.ts'],
  'AC-003': ['docs/ACTIVATION_METRICS_SPEC.md', 'apps/web/onboarding.html', 'modules/activation/src/metrics.ts', 'modules/activation/src/onboarding-readiness.ts', 'tests/onboarding-readiness.test.ts'],
  'AC-004': ['docs/ACTIVATION_METRICS_SPEC.md', 'modules/activation/src/metrics.ts', 'tests/activation-metrics.test.ts'],
  'AC-005': ['docs/ACTIVATION_METRICS_SPEC.md', 'modules/activation/src/metrics.ts', 'tests/activation-metrics.test.ts'],
  'AC-006': ['docs/ACTIVATION_METRICS_SPEC.md', 'docs/ACTIVATION_COHORT_REVIEW.md', 'modules/activation/src/metrics.ts', 'modules/activation/src/cohort-review.ts', 'tests/activation-metrics.test.ts'],
  'AC-007': ['docs/ONBOARDING_RECOVERY_SEQUENCE.md'],
  'AC-008': ['docs/ADMIN_ONBOARDING_CHECKLIST.md'],
  'DT-001': ['docs/SAAS_MOAT_ACTION_PLAN.md'],
  'DT-002': ['docs/industry-templates/real-estate.md'],
  'DT-003': ['docs/industry-templates/clinics.md'],
  'DT-004': ['docs/industry-templates/education.md'],
  'DT-005': ['docs/industry-templates/agencies.md'],
  'DT-006': ['docs/industry-templates/ecommerce.md'],
  'DT-007': ['docs/FOUNDER_LED_DEMO_SCRIPT.md'],
  'DT-008': ['docs/OBJECTION_HANDLING_LIBRARY.md'],
  'DT-009': ['docs/PARTNER_AGENCY_PROGRAM.md'],
  'DT-010': ['docs/CASE_STUDY_TEMPLATE.md'],
  'EN-001': ['docs/ENTERPRISE_READINESS_BACKLOG.md', 'modules/enterprise/src/readiness.ts', 'modules/enterprise/src/governance-readiness.ts', 'tests/enterprise-readiness.test.ts', 'tests/enterprise-governance-readiness.test.ts'],
  'EN-002': ['docs/ENTERPRISE_READINESS_BACKLOG.md', 'modules/enterprise/src/readiness.ts', 'modules/enterprise/src/governance-readiness.ts', 'tests/enterprise-readiness.test.ts', 'tests/enterprise-governance-readiness.test.ts'],
  'EN-003': ['docs/ENTERPRISE_READINESS_BACKLOG.md', 'docs/AUDIT_LOG_VIEWER_BACKLOG.md', 'modules/enterprise/src/readiness.ts', 'modules/enterprise/src/audit-log-readiness.ts', 'tests/enterprise-readiness.test.ts', 'tests/audit-log-readiness.test.ts'],
  'EN-004': ['docs/SSO_OIDC_READINESS.md', 'modules/enterprise/src/identity-readiness.ts', 'tests/enterprise-identity-readiness.test.ts'],
  'EN-005': ['docs/SSO_OIDC_READINESS.md', 'modules/enterprise/src/identity-readiness.ts', 'tests/enterprise-identity-readiness.test.ts'],
  'EN-006': ['docs/DATA_RESIDENCY_POSITION.md', 'modules/enterprise/src/procurement-readiness.ts', 'tests/procurement-readiness.test.ts'],
  'EN-007': ['docs/PROCUREMENT_CHECKLIST.md', 'modules/enterprise/src/procurement-readiness.ts', 'tests/procurement-readiness.test.ts'],
  'EN-008': ['docs/SOC2_READINESS_OUTLINE.md', 'modules/enterprise/src/soc2-readiness.ts', 'tests/soc2-readiness.test.ts'],
  'OP-001': ['gateforge-audit/run-2026-06-23-1035/47_ga_unblock_status.md'],
  'OP-002': ['docs/SAAS_MOAT_ACTION_PLAN.md'],
  'OP-003': ['docs/WEEKLY_MOAT_REVIEW_TEMPLATE.md'],
  'OP-004': ['docs/CUSTOMER_HEALTH_SCORE_SPEC.md', 'modules/operating-room/src/health-score.ts', 'tests/customer-health-score.test.ts'],
  'OP-005': ['docs/SUPPORT_TRIAGE_TAXONOMY.md', 'modules/sales-ops/src/support-workflow.ts', 'tests/sales-ops.test.ts'],
  'OP-006': ['docs/ACTIVATION_COHORT_REVIEW.md', 'modules/activation/src/cohort-review.ts', 'tests/activation-metrics.test.ts'],
  'OP-007': ['docs/AI_SPEND_REVIEW_TEMPLATE.md', 'modules/ai-ops/src/spend-review.ts', 'tests/workflow-intelligence.test.ts'],
  'OP-008': ['docs/TEMPLATE_PERFORMANCE_REVIEW.md', 'modules/activation/src/template-performance.ts', 'tests/template-performance.test.ts'],
};

const actions: Action[] = [
  ...gateforgeUnblock(),
  ...trustMoat(),
  ...packagingMoat(),
  ...workflowIntelligenceMoat(),
  ...activationMoat(),
  ...distributionMoat(),
  ...enterpriseMoat(),
  ...operatingCadence(),
  ...full165ExecutionExpansion(),
];

function gateforgeUnblock(): Action[] {
  return [
    a('GF-001', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Provision hosted staging control-plane Postgres.', 'Trust moat: proves fnnlr can run outside local/dev state.', 'Provider database URL and successful hosted health gate.'),
    a('GF-002', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Provision tenant database admin access for staging.', 'Isolation moat: DB-per-tenant cannot be claimed without live tenant DB proof.', 'TENANT_DB_ADMIN_URL validated by live tenant provision/delete test.'),
    a('GF-003', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set CONTROL_PLANE_DATABASE_URL in the local secret pack and GitHub Actions.', 'Trust moat: separates product maturity from local-only evidence.', 'npm run gateforge:local-secret-files-check and GitHub secrets audit PASS.'),
    a('GF-004', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set TENANT_DB_ADMIN_URL in the local secret pack and GitHub Actions.', 'Isolation moat: proves live tenant database creation and restore paths.', 'Hosted strict live DB tests PASS.'),
    a('GF-005', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set TENANT_DB_HOST in the local secret pack and GitHub Actions.', 'Operational moat: makes tenant DB routing inspectable without exposing credentials.', 'Local secret files check reports READY.'),
    a('GF-006', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Create staging Sentry or equivalent error-monitoring project.', 'Trust moat: enterprise buyers expect runtime failure visibility.', 'SENTRY_DSN present and alert proof attached.'),
    a('GF-007', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set SENTRY_DSN for staging.', 'Trust moat: converts observability from document claim to runtime signal.', 'Hosted strict monitoring item PASS.'),
    a('GF-008', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Create uptime monitor for /health.', 'Reliability moat: public availability proof beats feature demos.', 'UPTIME_HEALTHCHECK_URL and screenshot/log reference in attestation.'),
    a('GF-009', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set UPTIME_HEALTHCHECK_URL.', 'Reliability moat: supports repeatable launch gates.', 'GateForge secret check READY and hosted attestation item PASS.'),
    a('GF-010', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set ALERT_EMAIL_TO for staging operations.', 'Trust moat: makes incident ownership explicit.', 'Alert delivery proof in hosted evidence packet.'),
    a('GF-011', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set ALERT_WEBHOOK_URL for staging alerts.', 'Trust moat: routes operational failures to a real response channel.', 'Cron/webhook failure alert proof.'),
    a('GF-012', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Create Resend staging key or approved transactional email provider key.', 'Distribution moat: email deliverability is part of activation, not a side quest.', 'Provider test send and DNS posture evidence.'),
    a('GF-013', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set RESEND_API_KEY.', 'Activation moat: account and admin alerts must work in staging.', 'Hosted strict email readiness evidence.'),
    a('GF-014', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Verify sender domain and set EMAIL_FROM.', 'Trust moat: customers should receive branded transactional messages.', 'SPF/DKIM/DMARC evidence and provider verified sender.'),
    a('GF-015', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Set EMAIL_REPLY_TO.', 'Support moat: every outbound message has a human response path.', 'Transactional provider config proof.'),
    a('GF-016', 'GateForge GA unblock', 'P0', 'BLOCKED_EXTERNAL', 'Operator', 'Create capped Anthropic staging key.', 'AI safety moat: AI capability cannot outrun spend controls.', 'ANTHROPIC_API_KEY present with provider-side cap proof.'),
    a('GF-017', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Run local secret replacement packet after operator values exist.', 'Trust moat: no fake values enter launch evidence.', 'npm run gateforge:secret-replacement-packet PASS.', 'npm run gateforge:secret-replacement-packet'),
    a('GF-018', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Generate hosted staging attestation packet from real evidence only.', 'Evidence moat: GateForge approval becomes reproducible.', 'hosted-staging-attestation.json validates with external-check.', 'npm run gateforge:external-check -- gateforge-audit/external-attestations/hosted-staging-attestation.json'),
    a('GF-019', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Encode validated attestation as the preferred B64 secret.', 'Trust moat: avoids leaking packet contents while preserving machine validation.', 'npm run gateforge:attestation-secret-pack -- --write-b64 PASS.', 'npm run gateforge:attestation-secret-pack -- --write-b64'),
    a('GF-020', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Run hosted readiness doctor.', 'Gate moat: one decision file says what to do next.', '44_hosted_readiness_doctor.md says UPLOAD_GITHUB_SECRETS or later.', 'npm run gateforge:hosted-readiness-doctor'),
    a('GF-021', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Upload local secret pack to GitHub Actions after validation.', 'Trust moat: hosted CI becomes the source of launch proof.', 'GitHub secrets audit READY.', 'npm run gateforge:hosted-unblock -- --apply --prepare-attestation'),
    a('GF-022', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Trigger GateForge Hosted Staging Strict.', 'Evidence moat: moves from local claims to hosted proof.', 'Hosted strict workflow success URL.'),
    a('GF-023', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Run final gate and final report.', 'Gate moat: launch decision follows evidence, not optimism.', 'final-gate CONDITIONAL_GO or precise blockers.', 'npm run gateforge:final-gate && npm run gateforge:final-report'),
    a('GF-024', 'GateForge GA unblock', 'P0', 'READY_NOW', 'Engineering', 'Refresh GA unblock status dashboard.', 'Operating moat: every stakeholder sees one current status.', '47_ga_unblock_status.md/json updated.', 'npm run gateforge:ga-unblock-status'),
  ];
}

function trustMoat(): Action[] {
  return [
    a('TR-001', 'Trust moat', 'P0', 'READY_NOW', 'Founder/legal', 'Mark Terms as FINAL_APPROVED or HUMAN_ATTESTATION_REQUIRED.', 'Trust moat: paid SaaS needs commercial clarity.', 'LEGAL_READINESS_STATUS updated with owner and date.'),
    a('TR-002', 'Trust moat', 'P0', 'READY_NOW', 'Founder/legal', 'Mark Privacy Policy as FINAL_APPROVED or HUMAN_ATTESTATION_REQUIRED.', 'Trust moat: PII handling must be explicit.', 'Privacy status and approval reference.'),
    a('TR-003', 'Trust moat', 'P0', 'READY_NOW', 'Founder/legal', 'Finalize DPA position.', 'Enterprise moat: procurement requires a data processing answer.', 'DPA doc or HUMAN_ATTESTATION_REQUIRED row.'),
    a('TR-004', 'Trust moat', 'P0', 'READY_NOW', 'Founder/legal', 'Publish subprocessor list.', 'Trust moat: integration and AI vendors become inspectable.', 'Subprocessor list with provider, purpose, data category.'),
    a('TR-005', 'Trust moat', 'P0', 'READY_NOW', 'Engineering', 'Publish retention and deletion policy.', 'Trust moat: customers know data lifecycle guarantees.', 'DATA_LIFECYCLE references export/delete commands.'),
    a('TR-006', 'Trust moat', 'P1', 'READY_NOW', 'Engineering', 'Add security contact and vulnerability disclosure path.', 'Trust moat: serious buyers need responsible disclosure.', 'SECURITY_TRUST_PROOF updated.'),
    a('TR-007', 'Trust moat', 'P1', 'READY_NOW', 'Engineering', 'Create trust center index linking security, privacy, DPA, retention, backup, incident response.', 'Trust moat: reduces sales friction with one proof packet.', 'docs/TRUST_CENTER_INDEX.md.'),
    a('TR-008', 'Trust moat', 'P1', 'READY_NOW', 'Engineering', 'Create public-safe backup and restore posture.', 'Reliability moat: proof of recoverability beats uptime claims.', 'BACKUP_RESTORE_RUNBOOK linked to hosted restore evidence.'),
    a('TR-009', 'Trust moat', 'P1', 'NEXT', 'Engineering', 'Add audit log viewer backlog with acceptance criteria.', 'Trust moat: enterprise admins buy control and traceability.', 'Issue/backlog item with API, UI, export acceptance.'),
    a('TR-010', 'Trust moat', 'P1', 'NEXT', 'Engineering', 'Add data export UI readiness contract with acceptance criteria.', 'Trust moat: data portability reduces buyer risk.', 'Backlog item and readiness tests linked to export-tenant command.'),
    a('TR-011', 'Trust moat', 'P1', 'NEXT', 'Engineering', 'Add deletion request workflow readiness contract.', 'Trust moat: legal readiness becomes an operator workflow.', 'Backlog item and readiness tests linked to delete-tenant proof.'),
    a('TR-012', 'Trust moat', 'P1', 'NEXT', 'Engineering', 'Create incident response exercise readiness contract.', 'Trust moat: incident readiness becomes repeatable.', 'Incident drill template, readiness tests, owner, and hosted proof gap.'),
  ];
}

function packagingMoat(): Action[] {
  return [
    a('PK-001', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Product', 'Freeze positioning as Arabic-first AI Revenue Operations OS.', 'Category moat: avoids being boxed as a generic funnel builder.', 'COMPETITIVE_POSITIONING updated with category statement.'),
    a('PK-002', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Product', 'Define Starter plan limits.', 'Business moat: plan limits protect margin and simplify sales.', 'Pricing/limits matrix.'),
    a('PK-003', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Product', 'Define Growth plan limits.', 'Business moat: expansion path is explicit.', 'Pricing/limits matrix.'),
    a('PK-004', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Product', 'Define Scale plan limits.', 'Business moat: larger customers have a reason to upgrade.', 'Pricing/limits matrix.'),
    a('PK-005', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Product', 'Define Enterprise custom limits and proof requirements.', 'Enterprise moat: procurement path is separated from self-serve.', 'Enterprise row in pricing/limits matrix.'),
    a('PK-006', 'SaaS packaging moat', 'P1', 'NEXT', 'Engineering', 'Map pricing limits to enforcement readiness contract.', 'Margin moat: plans are real only when enforced.', 'Limit-to-code map plus readiness tests for seats, workflows, AI spend, contacts, integrations.'),
    a('PK-007', 'SaaS packaging moat', 'P1', 'NEXT', 'Engineering', 'Add usage-limit acceptance readiness gate.', 'Margin moat: accidental overuse is caught before launch.', 'Commercial limit tests plus route-level proof gap tracking.'),
    a('PK-008', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Sales', 'Create one-page sales proof pack.', 'Distribution moat: sales can repeat without founder improvisation.', 'CUSTOMER_PROOF_PACK linked from sales docs.'),
    a('PK-009', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Sales', 'Create ROI calculator assumptions.', 'Distribution moat: buyers see payback, not feature count.', 'ROI assumptions in COMMERCIAL_PACKAGING.'),
    a('PK-010', 'SaaS packaging moat', 'P1', 'READY_NOW', 'Support', 'Map support SLA tiers to plans.', 'Trust moat: support promise matches revenue model.', 'SUPPORT_WORKFLOW and commercial packaging updated.'),
  ];
}

function workflowIntelligenceMoat(): Action[] {
  return [
    a('WI-001', 'Workflow intelligence moat', 'P1', 'NEXT', 'Engineering', 'Link ai_usage_events to workflow id where available.', 'Data moat: AI spend becomes workflow intelligence.', 'Schema/API design note and tests.'),
    a('WI-002', 'Workflow intelligence moat', 'P1', 'NEXT', 'Engineering', 'Link ai_usage_events to business outcome where available.', 'Data moat: recommendations improve from outcomes, not prompts alone.', 'Outcome linkage test/backlog.'),
    a('WI-003', 'Workflow intelligence moat', 'P1', 'NEXT', 'Engineering', 'Compute cost per successful workflow action.', 'Margin moat: fnnlr can optimize AI cost by outcome.', 'Metric definition and dashboard backlog.'),
    a('WI-004', 'Workflow intelligence moat', 'P1', 'NEXT', 'Product', 'Define next-best-action v1 rules.', 'Workflow moat: recommendations become productized operating guidance.', 'Rules document with evidence inputs.'),
    a('WI-005', 'Workflow intelligence moat', 'P1', 'NEXT', 'Product', 'Define follow-up quality score.', 'Arabic-first moat: sales language can be scored by local norms.', 'Scoring rubric in docs.'),
    a('WI-006', 'Workflow intelligence moat', 'P2', 'NEXT', 'Product', 'Create lead qualification confidence rubric.', 'Workflow moat: CRM work becomes guided and measurable.', 'Rubric and test fixtures.'),
    a('WI-007', 'Workflow intelligence moat', 'P2', 'NEXT', 'Engineering', 'Create AI cost dashboard backlog.', 'Margin moat: operators can see and cap AI spend.', 'Dashboard acceptance criteria.'),
    a('WI-008', 'Workflow intelligence moat', 'P2', 'NEXT', 'Engineering', 'Create tenant AI cap UI backlog.', 'Trust moat: customers get predictable AI behavior.', 'UI acceptance criteria linked to existing env caps.'),
  ];
}

function activationMoat(): Action[] {
  return [
    a('AC-001', 'Activation moat', 'P1', 'READY_NOW', 'Product', 'Define onboarding wizard steps.', 'Activation moat: time-to-first-value becomes engineered.', 'ONBOARDING_PROMISE updated with steps.'),
    a('AC-002', 'Activation moat', 'P1', 'NEXT', 'Engineering', 'Add industry selection readiness contract and event evidence.', 'Distribution moat: each segment gets a tailored path.', 'Readiness module, metrics evidence, and hosted proof gap.'),
    a('AC-003', 'Activation moat', 'P1', 'NEXT', 'Engineering', 'Add goal selection readiness contract and event evidence.', 'Activation moat: workflows map to customer outcomes.', 'Readiness module, metrics evidence, and goal mapping gap.'),
    a('AC-004', 'Activation moat', 'P1', 'NEXT', 'Product', 'Define time-to-first-workflow metric.', 'Activation moat: onboarding quality becomes measurable.', 'Metric definition with event names.'),
    a('AC-005', 'Activation moat', 'P1', 'NEXT', 'Product', 'Define time-to-first-lead-action metric.', 'Revenue moat: activation is tied to customer work, not login.', 'Metric definition with event names.'),
    a('AC-006', 'Activation moat', 'P1', 'NEXT', 'Engineering', 'Aggregate onboarding abandonment reasons into cohort review actions.', 'Activation moat: every failed setup trains the system.', 'Cohort review exposes top abandonment step/reason with owner action.'),
    a('AC-007', 'Activation moat', 'P2', 'NEXT', 'Product', 'Create onboarding recovery email sequence.', 'Distribution moat: reduces trial drop-off.', 'Email copy and trigger conditions.'),
    a('AC-008', 'Activation moat', 'P2', 'NEXT', 'Support', 'Create admin onboarding checklist.', 'Support moat: handoff becomes repeatable.', 'Checklist linked to SALES_TO_ACTIVATION_HANDOFF.'),
  ];
}

function distributionMoat(): Action[] {
  return [
    a('DT-001', 'Distribution moat', 'P1', 'READY_NOW', 'Product', 'Select first ICP for launch wedge.', 'Distribution moat: focus beats broad generic positioning.', 'ICP chosen in SAAS_MOAT_ACTION_PLAN.'),
    a('DT-002', 'Distribution moat', 'P1', 'READY_NOW', 'Marketing', 'Create real-estate template brief.', 'MENA moat: high-fit Arabic follow-up workflows.', 'Industry template brief with funnel, WhatsApp, qualification, handoff.'),
    a('DT-003', 'Distribution moat', 'P1', 'READY_NOW', 'Marketing', 'Create clinic template brief.', 'MENA moat: appointment and follow-up workflows localize well.', 'Industry template brief.'),
    a('DT-004', 'Distribution moat', 'P1', 'READY_NOW', 'Marketing', 'Create education template brief.', 'MENA moat: admissions follow-up is repeatable.', 'Industry template brief.'),
    a('DT-005', 'Distribution moat', 'P1', 'READY_NOW', 'Marketing', 'Create agency template brief.', 'Distribution moat: agencies can resell repeatable workflows.', 'Industry template brief.'),
    a('DT-006', 'Distribution moat', 'P1', 'READY_NOW', 'Marketing', 'Create ecommerce template brief.', 'Distribution moat: abandoned lead/order workflows are measurable.', 'Industry template brief.'),
    a('DT-007', 'Distribution moat', 'P1', 'NEXT', 'Sales', 'Create founder-led demo script.', 'Distribution moat: demos become consistent and measurable.', 'PILOT_DEMO updated.'),
    a('DT-008', 'Distribution moat', 'P1', 'NEXT', 'Sales', 'Create objection handling library.', 'Distribution moat: Arabic buyer objections become reusable data.', 'INTERNAL_SALES_SCRIPT updated.'),
    a('DT-009', 'Distribution moat', 'P2', 'NEXT', 'Sales', 'Create partner agency program brief.', 'Channel moat: agencies multiply distribution.', 'Partner brief and qualification criteria.'),
    a('DT-010', 'Distribution moat', 'P2', 'NEXT', 'Marketing', 'Create first case-study template.', 'Proof moat: customer evidence becomes repeatable.', 'CUSTOMER_PROOF_PACK updated.'),
  ];
}

function enterpriseMoat(): Action[] {
  return [
    a('EN-001', 'Enterprise moat', 'P2', 'NEXT', 'Engineering', 'Create RBAC expansion readiness contract.', 'Enterprise moat: admins need granular control.', 'Role matrix, governance readiness tests, and route policy gaps.'),
    a('EN-002', 'Enterprise moat', 'P2', 'NEXT', 'Engineering', 'Create workspace policy readiness contract.', 'Enterprise moat: workspace governance supports larger accounts.', 'Policy acceptance criteria, governance readiness tests, and admin UI gap.'),
    a('EN-003', 'Enterprise moat', 'P2', 'NEXT', 'Engineering', 'Create audit export backlog.', 'Trust moat: enterprise security teams need exportable logs.', 'Export format and permissions spec.'),
    a('EN-004', 'Enterprise moat', 'P2', 'LATER', 'Engineering', 'Create SSO/OIDC readiness plan.', 'Enterprise moat: procurement path for larger buyers.', 'SSO readiness doc.'),
    a('EN-005', 'Enterprise moat', 'P2', 'LATER', 'Engineering', 'Create SAML backlog.', 'Enterprise moat: supports traditional enterprise identity.', 'SAML acceptance criteria.'),
    a('EN-006', 'Enterprise moat', 'P2', 'READY_NOW', 'Product', 'Define data residency position.', 'Enterprise moat: MENA/global readiness needs a clear answer.', 'Security/trust docs updated.'),
    a('EN-007', 'Enterprise moat', 'P2', 'READY_NOW', 'Sales', 'Create procurement checklist.', 'Enterprise moat: sales can answer security reviews faster.', 'Enterprise procurement packet.'),
    a('EN-008', 'Enterprise moat', 'P3', 'LATER', 'Engineering', 'Create SOC2 readiness roadmap.', 'Trust moat: long-term enterprise credibility.', 'SOC2 roadmap with controls and evidence owners.'),
  ];
}

function operatingCadence(): Action[] {
  return [
    a('OP-001', 'Operating cadence', 'P0', 'READY_NOW', 'Engineering', 'Run GateForge status after every evidence-changing change.', 'Operating moat: the launch gate stays current.', '47_ga_unblock_status updated.', 'npm run gateforge:ga-unblock-status'),
    a('OP-002', 'Operating cadence', 'P1', 'READY_NOW', 'Engineering', 'Run moat action plan check in CI.', 'Execution moat: roadmap quality is enforced.', 'npm run moat:check PASS.', 'npm run moat:check'),
    a('OP-003', 'Operating cadence', 'P1', 'READY_NOW', 'Leadership', 'Review P0/P1 moat board weekly.', 'Operating moat: leadership attention follows blockers, not noise.', 'Meeting note with changed statuses.'),
    a('OP-004', 'Operating cadence', 'P1', 'NEXT', 'Support', 'Create customer health score definition.', 'Retention moat: support sees risk early.', 'Health score doc and event inputs.'),
    a('OP-005', 'Operating cadence', 'P1', 'NEXT', 'Support', 'Create support triage board categories.', 'Support moat: support issues become product intelligence.', 'SUPPORT_WORKFLOW updated.'),
    a('OP-006', 'Operating cadence', 'P1', 'NEXT', 'Product', 'Create activation cohort review template.', 'Activation moat: cohorts reveal what is repeatable.', 'Template linked from operating docs.'),
    a('OP-007', 'Operating cadence', 'P2', 'NEXT', 'Finance/ops', 'Create monthly AI spend review.', 'Margin moat: AI cost is managed like COGS.', 'Monthly report template.'),
    a('OP-008', 'Operating cadence', 'P2', 'NEXT', 'Product', 'Create template performance review.', 'Workflow moat: templates improve from observed outcomes.', 'Review template and metrics.'),
  ];
}

function full165ExecutionExpansion(): Action[] {
  const items: Array<Omit<Action, 'id'>> = [
    x('Trust center execution', 'P1', 'READY_NOW', 'Engineering', 'Create trust center landing index with security, legal, data lifecycle, support, and incident links.', 'Trust moat: proof becomes self-serve for buyers.', 'docs/TRUST_CENTER_INDEX.md exists and links proof docs.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Engineering', 'Add security overview summary for sales use.', 'Trust moat: security answers stop being improvised.', 'Security overview section linked from trust center.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Founder/legal', 'Add legal approval tracker row for Terms.', 'Trust moat: legal status is explicit, not assumed.', 'Legal tracker shows owner, state, and evidence.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Founder/legal', 'Add legal approval tracker row for Privacy.', 'Trust moat: privacy status is inspectable.', 'Legal tracker shows owner, state, and evidence.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Founder/legal', 'Add legal approval tracker row for DPA.', 'Enterprise moat: DPA readiness is visible early.', 'Legal tracker shows owner, state, and evidence.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Founder/legal', 'Add legal approval tracker row for subprocessors.', 'Trust moat: vendors and data purposes are visible.', 'Subprocessor row exists with evidence owner.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Engineering', 'Add retention and deletion summary to trust center.', 'Trust moat: customer data promises are easy to verify.', 'Trust center links DATA_LIFECYCLE.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Engineering', 'Add backup and restore summary to trust center.', 'Reliability moat: recoverability becomes part of sales proof.', 'Trust center links BACKUP_RESTORE_RUNBOOK.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Engineering', 'Add incident response summary to trust center.', 'Trust moat: buyers can see escalation posture.', 'Trust center links incident/observability docs.'),
    x('Trust center execution', 'P1', 'READY_NOW', 'Support', 'Add support workflow summary to trust center.', 'Support moat: operations maturity becomes visible.', 'Trust center links SUPPORT_WORKFLOW.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Create pricing and limits matrix document.', 'Business moat: packaging becomes enforceable and sellable.', 'docs/PRICING_AND_LIMITS_MATRIX.md.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Starter seats limit.', 'Margin moat: support and usage exposure are controlled.', 'Starter plan row has seats limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Starter workflows limit.', 'Margin moat: workflow volume maps to plan value.', 'Starter plan row has workflow limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Starter contacts limit.', 'Margin moat: database/storage cost is bounded.', 'Starter plan row has contacts limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Starter AI budget limit.', 'AI moat: value is delivered without uncontrolled COGS.', 'Starter plan row has AI cap.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Growth seats limit.', 'Business moat: upgrade path is clear.', 'Growth plan row has seats limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Growth workflows limit.', 'Business moat: growing usage expands revenue.', 'Growth plan row has workflow limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Growth contacts limit.', 'Business moat: customer scale maps to price.', 'Growth plan row has contacts limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Growth AI budget limit.', 'AI moat: higher value plans get higher controlled capacity.', 'Growth plan row has AI cap.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Scale seats limit.', 'Enterprise moat: larger teams have a packaged path before custom.', 'Scale plan row has seats limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Scale workflows limit.', 'Business moat: workflow scale becomes paid expansion.', 'Scale plan row has workflow limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Scale contacts limit.', 'Business moat: large databases are monetized.', 'Scale plan row has contacts limit.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Product', 'Define Scale AI budget limit.', 'AI moat: scale value stays margin-aware.', 'Scale plan row has AI cap.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Sales', 'Define Enterprise proof requirements.', 'Enterprise moat: custom buyers get a trust-led process.', 'Enterprise row lists security, legal, SLA, and procurement proof.'),
    x('Commercial moat execution', 'P1', 'READY_NOW', 'Sales', 'Define paid onboarding package.', 'Distribution moat: activation services become repeatable revenue.', 'Pricing matrix includes onboarding package.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create real-estate template brief.', 'Arabic-first moat: local property follow-up becomes a product asset.', 'docs/industry-templates/real-estate.md.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create real-estate WhatsApp sequence.', 'Workflow moat: segment-specific follow-up is reusable.', 'Template includes WhatsApp sequence.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create real-estate qualification rules.', 'Workflow moat: lead triage becomes local and repeatable.', 'Template includes qualification rules.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create clinic template brief.', 'Arabic-first moat: appointment workflows localize strongly.', 'docs/industry-templates/clinics.md.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create clinic WhatsApp sequence.', 'Workflow moat: appointment reminders become repeatable.', 'Template includes WhatsApp sequence.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create clinic qualification rules.', 'Workflow moat: inquiry quality becomes measurable.', 'Template includes qualification rules.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create education template brief.', 'Arabic-first moat: admissions workflows become a reusable wedge.', 'docs/industry-templates/education.md.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create education WhatsApp sequence.', 'Workflow moat: admissions follow-up becomes structured.', 'Template includes WhatsApp sequence.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create education qualification rules.', 'Workflow moat: student intent becomes measurable.', 'Template includes qualification rules.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create agency template brief.', 'Distribution moat: agencies can resell standardized workflows.', 'docs/industry-templates/agencies.md.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create agency WhatsApp sequence.', 'Distribution moat: agency follow-up becomes productized.', 'Template includes WhatsApp sequence.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create agency qualification rules.', 'Distribution moat: agency pipeline hygiene becomes repeatable.', 'Template includes qualification rules.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create ecommerce template brief.', 'Workflow moat: abandoned cart/order workflows become repeatable.', 'docs/industry-templates/ecommerce.md.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create ecommerce WhatsApp sequence.', 'Workflow moat: commerce follow-up can be tuned by outcome.', 'Template includes WhatsApp sequence.'),
    x('Industry template execution', 'P1', 'READY_NOW', 'Product', 'Create ecommerce qualification rules.', 'Workflow moat: buyer intent is scored consistently.', 'Template includes qualification rules.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Create activation metrics spec.', 'Activation moat: onboarding quality becomes measurable.', 'docs/ACTIVATION_METRICS_SPEC.md.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Define time_to_first_workflow event.', 'Activation moat: first value has a measurable timestamp.', 'Metric spec includes event definition.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Define time_to_first_lead_action event.', 'Revenue moat: activation ties to real customer work.', 'Metric spec includes event definition.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Define onboarding_abandoned event.', 'Activation moat: failures create learning data.', 'Metric spec includes event definition.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Define template_selected event.', 'Workflow moat: template adoption becomes measurable.', 'Metric spec includes event definition.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Product', 'Define first_publish event.', 'Activation moat: launch readiness becomes measurable.', 'Metric spec includes event definition.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Support', 'Create admin onboarding checklist.', 'Support moat: onboarding becomes repeatable between customers.', 'docs/ADMIN_ONBOARDING_CHECKLIST.md.'),
    x('Activation execution', 'P1', 'READY_NOW', 'Support', 'Create onboarding failure recovery checklist.', 'Activation moat: failed setup has a recovery path.', 'Checklist includes owners and triggers.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Create workflow intelligence spec.', 'Data moat: AI usage is converted into product learning.', 'docs/WORKFLOW_INTELLIGENCE_SPEC.md.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define cost_per_workflow metric.', 'Margin moat: AI spend is evaluated by outcome.', 'Workflow intelligence spec includes metric formula.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define cost_per_successful_action metric.', 'Margin moat: recommendations can optimize cost and impact.', 'Workflow intelligence spec includes metric formula.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define degraded_fallback_rate metric.', 'Trust moat: AI degradation is visible and auditable.', 'Workflow intelligence spec includes metric formula.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define next_best_action v1 rules.', 'Workflow moat: recommendations become structured operating advice.', 'Workflow intelligence spec includes rule table.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define follow_up_quality_score rubric.', 'Arabic-first moat: sales language can be scored locally.', 'Workflow intelligence spec includes rubric.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Product', 'Define lead_qualification_confidence rubric.', 'Workflow moat: qualification becomes consistent.', 'Workflow intelligence spec includes rubric.'),
    x('AI intelligence execution', 'P1', 'READY_NOW', 'Engineering', 'Create implementation backlog for workflow id on AI usage events.', 'Data moat: model usage links to business workflows.', 'Spec includes engineering backlog row.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Sales', 'Create founder-led SaaS demo script.', 'Distribution moat: demos become repeatable.', 'docs/FOUNDER_LED_DEMO_SCRIPT.md.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Sales', 'Create Arabic objection handling library.', 'Distribution moat: local buyer objections become reusable playbooks.', 'docs/OBJECTION_HANDLING_LIBRARY.md.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Sales', 'Create pilot offer brief.', 'Distribution moat: first customers get a repeatable entry offer.', 'Pilot offer section in sales docs.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Sales', 'Create partner agency brief.', 'Channel moat: agencies can multiply distribution.', 'docs/PARTNER_AGENCY_PROGRAM.md.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Marketing', 'Create first case-study template.', 'Proof moat: customer evidence becomes structured.', 'docs/CASE_STUDY_TEMPLATE.md.'),
    x('Sales execution', 'P1', 'READY_NOW', 'Marketing', 'Create outreach sequence for first ICP.', 'Distribution moat: GTM becomes testable.', 'docs/ICP_OUTREACH_SEQUENCE.md.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Create enterprise readiness backlog.', 'Enterprise moat: long-term procurement work is mapped.', 'docs/ENTERPRISE_READINESS_BACKLOG.md.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Define RBAC expansion requirements.', 'Enterprise moat: authorization scales beyond simple roles.', 'Enterprise backlog includes RBAC row.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Define workspace policy requirements.', 'Enterprise moat: customer admins gain governance.', 'Enterprise backlog includes workspace policy row.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Define audit export requirements.', 'Trust moat: enterprise customers can review activity.', 'Enterprise backlog includes audit export row.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Define SSO/OIDC requirements.', 'Enterprise moat: identity readiness is planned.', 'Enterprise backlog includes SSO row.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Define data residency position.', 'Enterprise moat: global SaaS buyers get a clear answer.', 'Enterprise backlog includes data residency row.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Sales', 'Create procurement checklist.', 'Enterprise moat: sales can handle security reviews faster.', 'docs/PROCUREMENT_CHECKLIST.md.'),
    x('Enterprise execution', 'P2', 'READY_NOW', 'Engineering', 'Create SOC2 readiness outline.', 'Trust moat: long-term compliance path is visible.', 'docs/SOC2_READINESS_OUTLINE.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Leadership', 'Create weekly moat review template.', 'Operating moat: execution is reviewed by blockers and evidence.', 'docs/WEEKLY_MOAT_REVIEW_TEMPLATE.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Support', 'Create customer health score spec.', 'Retention moat: risk signals become operational.', 'docs/CUSTOMER_HEALTH_SCORE_SPEC.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Support', 'Create support triage board taxonomy.', 'Support moat: support issues become product signals.', 'docs/SUPPORT_TRIAGE_TAXONOMY.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Product', 'Create activation cohort review template.', 'Activation moat: repeatability is measured weekly.', 'docs/ACTIVATION_COHORT_REVIEW.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Finance/ops', 'Create AI spend review template.', 'Margin moat: AI COGS are managed continuously.', 'docs/AI_SPEND_REVIEW_TEMPLATE.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Product', 'Create template performance review template.', 'Workflow moat: templates improve from outcomes.', 'docs/TEMPLATE_PERFORMANCE_REVIEW.md.'),
    x('Operating execution', 'P1', 'READY_NOW', 'Engineering', 'Link the 165-point moat board from the evidence index.', 'Operating moat: the roadmap is discoverable from the proof system.', 'docs/EVIDENCE_INDEX.md links SAAS_MOAT_ACTION_PLAN.'),
  ];
  return items.map((item, index) => ({ id: `EX-${String(index + 1).padStart(3, '0')}`, ...item }));
}

function x(
  phase: string,
  priority: Priority,
  status: Status,
  owner: string,
  action: string,
  moat: string,
  evidence: string,
  command?: string,
): Omit<Action, 'id'> {
  return { phase, priority, status, owner, action, moat, evidence, command };
}

function a(
  id: string,
  phase: string,
  priority: Priority,
  status: Status,
  owner: string,
  action: string,
  moat: string,
  evidence: string,
  command?: string,
): Action {
  return { id, phase, priority, status, owner, action, moat, evidence, command };
}

function validate(items: Action[]) {
  const ids = new Set<string>();
  const errors: string[] = [];
  for (const item of items) {
    if (ids.has(item.id)) errors.push(`duplicate id ${item.id}`);
    ids.add(item.id);
    for (const key of ['phase', 'priority', 'status', 'owner', 'action', 'moat', 'evidence'] as const) {
      if (!item[key].trim()) errors.push(`${item.id} missing ${key}`);
    }
    if (!item.moat.toLowerCase().includes('moat')) errors.push(`${item.id} moat field must explain the moat`);
    if (item.priority === 'P0' && item.status === 'LATER') errors.push(`${item.id} P0 cannot be LATER`);
  }
  if (errors.length) {
    console.error('SaaS moat action plan: FAIL');
    errors.forEach((error) => console.error(`  - ${error}`));
    process.exit(1);
  }
  if (items.length !== 165) {
    console.error(`SaaS moat action plan: FAIL - expected 165 actions, found ${items.length}`);
    process.exit(1);
  }
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function markdownEscape(value: string) {
  return value.replace(/\|/g, '\\|');
}

function renderMarkdown(items: Action[]) {
  const generatedAt = new Date().toISOString();
  const phaseOrder = [...new Set(items.map((item) => item.phase))];
  const summaryRows = phaseOrder
    .map((phase) => {
      const inPhase = items.filter((item) => item.phase === phase);
      const p0 = inPhase.filter((item) => item.priority === 'P0').length;
      const p1 = inPhase.filter((item) => item.priority === 'P1').length;
      const blocked = inPhase.filter((item) => item.status === 'BLOCKED_EXTERNAL').length;
      return `| ${phase} | ${inPhase.length} | ${p0} | ${p1} | ${blocked} |`;
    })
    .join('\n');
  const sections = phaseOrder
    .map((phase) => {
      const rows = items
        .filter((item) => item.phase === phase)
        .map(
          (item) =>
            `| \`${item.id}\` | \`${item.priority}\` | \`${item.status}\` | ${markdownEscape(item.owner)} | ${markdownEscape(item.action)} | ${markdownEscape(item.moat)} | ${markdownEscape(item.evidence)} | ${item.command ? `\`${markdownEscape(item.command)}\`` : ''} |`,
        )
        .join('\n');
      return `## ${phase}\n\n| ID | Priority | Status | Owner | Action | Moat rationale | Evidence required | Command |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows}`;
    })
    .join('\n\n');
  return `# SaaS Moat Action Plan\n\nGenerated: \`${generatedAt}\`\n\nThis is the execution board for turning fnnlr from a GateForge-blocked release candidate into a global SaaS with a defensible moat. It intentionally separates code-ready work from external hosted evidence so the team does not confuse local progress with GA approval.\n\n## Current Launch Truth\n\n- GateForge state: \`CANNOT_APPROVE_LOCAL_EVIDENCE\` until hosted staging secrets and attestation are real.\n- Current defensible score band: \`65-70/100\`.\n- Next strategic target: \`CONDITIONAL_GO\` through hosted staging proof.\n- Category target: Arabic-first AI Revenue Operations OS, not a generic funnel builder.\n\n## Moat Thesis\n\nfnnlr's moat is the combination of DB-per-tenant trust, Arabic-first revenue workflows, workflow outcome intelligence, repeatable activation, and sales/support proof. The roadmap below prioritizes work that strengthens at least one of those defenses.\n\n## Phase Summary\n\n| Phase | Actions | P0 | P1 | Externally blocked |\n| --- | ---: | ---: | ---: | ---: |\n${summaryRows}\n\n${sections}\n`;
}

function renderCsv(items: Action[]) {
  const header = ['id', 'phase', 'priority', 'status', 'owner', 'action', 'moat', 'evidence', 'command'];
  const rows = items.map((item) =>
    [
      item.id,
      item.phase,
      item.priority,
      item.status,
      item.owner,
      item.action,
      item.moat,
      item.evidence,
      item.command ?? '',
    ]
      .map(csvEscape)
      .join(','),
  );
  return `${header.join(',')}\n${rows.join('\n')}\n`;
}

function referencedDocs(item: Action): string[] {
  return `${item.evidence} ${item.command ?? ''}`.match(/docs\/[A-Za-z0-9_./-]+\.md/g) ?? [];
}

function actionExecutionState(item: Action) {
  if (item.status === 'BLOCKED_EXTERNAL') return 'BLOCKED_EXTERNAL';
  const mappedDocs = evidenceFilesByActionId[item.id] ?? [];
  if (mappedDocs.length && mappedDocs.every((file) => fs.existsSync(file))) return 'EVIDENCE_FILE_PRESENT';
  const docs = referencedDocs(item);
  if (docs.length && docs.every((file) => fs.existsSync(file))) return 'EVIDENCE_FILE_PRESENT';
  if (item.command) return 'COMMAND_READY';
  if (item.status === 'READY_NOW') return 'OWNER_OR_DOC_ACTION_READY';
  return item.status;
}

function renderStatus(items: Action[]) {
  const generatedAt = new Date().toISOString();
  const rows = items.map((item) => ({ ...item, executionState: actionExecutionState(item) }));
  const states = [...new Set(rows.map((item) => item.executionState))].sort();
  const stateSummary = states
    .map((state) => `| \`${state}\` | ${rows.filter((item) => item.executionState === state).length} |`)
    .join('\n');
  const phaseSummary = [...new Set(rows.map((item) => item.phase))]
    .map((phase) => {
      const inPhase = rows.filter((item) => item.phase === phase);
      const done = inPhase.filter((item) => item.executionState === 'EVIDENCE_FILE_PRESENT').length;
      const blocked = inPhase.filter((item) => item.executionState === 'BLOCKED_EXTERNAL').length;
      return `| ${phase} | ${inPhase.length} | ${done} | ${blocked} |`;
    })
    .join('\n');
  const openP0 = rows
    .filter((item) => item.priority === 'P0' && item.executionState !== 'EVIDENCE_FILE_PRESENT')
    .map((item) => `| \`${item.id}\` | \`${item.executionState}\` | ${markdownEscape(item.action)} | ${markdownEscape(item.evidence)} |`)
    .join('\n');
  const body = `# SaaS Moat Execution Status

Generated: \`${generatedAt}\`

This status is derived from the 165-point board. It treats hosted/operator-only work as blocked until real external evidence exists.

## Summary By State

| State | Count |
| --- | ---: |
${stateSummary}

## Summary By Phase

| Phase | Actions | Evidence-file present | Externally blocked |
| --- | ---: | ---: | ---: |
${phaseSummary}

## Open P0 Items

| ID | State | Action | Evidence required |
| --- | --- | --- | --- |
${openP0 || '| None | None | None | None |'}
`;
  return {
    body,
    json: {
      generatedAt,
      total: rows.length,
      byState: Object.fromEntries(states.map((state) => [state, rows.filter((item) => item.executionState === state).length])),
      openP0: rows
        .filter((item) => item.priority === 'P0' && item.executionState !== 'EVIDENCE_FILE_PRESENT')
        .map((item) => ({ id: item.id, state: item.executionState, action: item.action, evidence: item.evidence })),
    },
  };
}

validate(actions);

if (statusOnly) {
  const rendered = renderStatus(actions);
  fs.writeFileSync(statusMd, rendered.body);
  fs.writeFileSync(statusJson, `${JSON.stringify(rendered.json, null, 2)}\n`);
  console.log(`SaaS moat execution status: wrote ${statusMd}`);
  console.log(`SaaS moat execution status: wrote ${statusJson}`);
  process.exit(0);
}

if (checkOnly) {
  const expectedMd = renderMarkdown(actions);
  const expectedCsv = renderCsv(actions);
  const currentMd = fs.existsSync(outMd) ? fs.readFileSync(outMd, 'utf8') : '';
  const currentCsv = fs.existsSync(outCsv) ? fs.readFileSync(outCsv, 'utf8') : '';
  if (!currentMd || !currentCsv) {
    console.error('SaaS moat action plan: FAIL - generated docs are missing');
    process.exit(1);
  }
  const normalizeGeneratedAt = (value: string) => value.replace(/Generated: `[^`]+`/, 'Generated: `<timestamp>`');
  if (normalizeGeneratedAt(currentMd) !== normalizeGeneratedAt(expectedMd) || currentCsv !== expectedCsv) {
    console.error('SaaS moat action plan: FAIL - generated docs are stale');
    console.error(`  run: npm run moat:plan`);
    process.exit(1);
  }
  const missingEvidenceFiles = requiredEvidenceFiles.filter((file) => !fs.existsSync(file));
  if (missingEvidenceFiles.length) {
    console.error('SaaS moat action plan: FAIL - required execution evidence files are missing');
    missingEvidenceFiles.forEach((file) => console.error(`  - ${file}`));
    process.exit(1);
  }
  console.log(`SaaS moat action plan: PASS (${actions.length} actions)`);
  process.exit(0);
}

fs.mkdirSync(path.dirname(outMd), { recursive: true });
fs.writeFileSync(outMd, renderMarkdown(actions));
fs.writeFileSync(outCsv, renderCsv(actions));
console.log(`SaaS moat action plan: wrote ${outMd}`);
console.log(`SaaS moat action plan: wrote ${outCsv}`);
console.log(`SaaS moat action plan: ${actions.length} actions`);
