# Data Residency Position

Status: `DRAFT_READY_HUMAN_APPROVAL_REQUIRED`

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
