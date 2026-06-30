# Data Residency Position

Status: `CONTRACT_READY_HUMAN_APPROVAL_REQUIRED`

Code evidence:

- `modules/enterprise/src/procurement-readiness.ts` marks data residency as guarded, buyer-safe, and human-attestation-required.
- `tests/procurement-readiness.test.ts` rejects unconditional regional residency claims.

## Current Position

fnnlr is designed for DB-per-tenant isolation. Data residency is determined by the selected hosting and managed Postgres providers for the customer environment.

## GA v1 Statement

- No unconditional regional data-residency guarantee is made.
- Customer-specific residency commitments require enterprise review.
- Provider region must be documented in the hosted staging/production evidence packet.

## Enterprise Roadmap

- Region selection per enterprise deployment.
- Data processing addendum alignment.
- Subprocessor region disclosure.
- Restore/backup region disclosure.

## Claim Rule

Do not claim unconditional regional residency in GA v1.

Customer-specific residency commitments require:

- provider region evidence
- backup/restore region evidence
- subprocessor region disclosure
- founder/legal approval or customer-specific contract language
