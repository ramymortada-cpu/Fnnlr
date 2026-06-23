# Data Lifecycle

Status: IMPLEMENTED_COMMANDS_AND_STAGING_EVIDENCE_REQUIRED

fnnlr uses DB-per-tenant isolation. Data lifecycle evidence should avoid raw
customer data in reports.

Export evidence:

- Command: `npm run export-tenant -- --id=<tenantId> --out=<evidenceDir>`
- Output: sanitized table counts plus SHA-256 evidence hash.
- No PII or raw tenant records are printed.

Deletion evidence:

- Command: `npm run delete-tenant -- --id=<tenantId>`
- Expected result: tenant pool closed, dedicated tenant DB dropped, control-plane
  route removed or marked deleted by the provisioning module.

GateForge rule: deletion/export code is not enough; staging command output must
be archived for GA.
