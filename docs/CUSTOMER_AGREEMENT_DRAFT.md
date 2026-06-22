# fnnlr — Customer Agreement (DRAFT)

> **Not legal advice. This is a plain-language draft skeleton and must be reviewed
> by a qualified lawyer before use.** It describes the service honestly and does
> not overclaim.

## 1. Scope of service
fnnlr provides an Arabic-native, WhatsApp-first funnel builder and an
evidence-based Revenue Desk: a hosted offer page, tracked WhatsApp links,
recording of real signals (page views, clicks, leads, manual payment states),
activation and go-live tooling, and human-approved recommendations and repairs.

## 2. Customer responsibilities
The customer provides and maintains: the WhatsApp number and sales motion, the
offer details, the payment instructions, brand basics, the traffic source, and
the people who respond to leads and confirm payments. The customer sends the
WhatsApp messages and confirms payments. (See `SALES_QUALIFICATION.md` and the
responsibilities checklist below.)

## 3. fnnlr responsibilities
fnnlr provides the tooling described in scope, isolates tenant data, surfaces
blockers honestly, and supports the agreed launch window. fnnlr does not operate
the customer's sales motion on their behalf.

## 4. WhatsApp responsibility
fnnlr does **not** auto-send WhatsApp messages. It prepares drafts and links; the
customer (a human) sends them and complies with WhatsApp's own terms and any BSP
requirements. Connecting a BSP webhook is optional and is handled server-side.

## 5. Payment responsibility
fnnlr does **not** process payments and does **not** move money. It records manual
payment state (e.g. InstaPay, Vodafone Cash, bank transfer, Fawry, cash). The
customer collects and confirms payment.

## 6. Data accuracy
The Revenue Desk is only as accurate as the observed data. fnnlr records before it
advises; if the underlying signals are incomplete, recommendations are limited and
say so. fnnlr does not fabricate numbers.

## 7. AI recommendations disclaimer
Recommendations and repair plans are generated from observed evidence and may be
imperfect. They are suggestions, not instructions, and are provided without a
warranty of outcome. The customer decides whether to apply them.

## 8. No guaranteed results
There are **no guaranteed results**. fnnlr does not guarantee revenue, sales, or
ROI. Outcomes depend on the customer's offer, traffic, and response motion.

## 9. Manual approval required
Recommendations and repairs require explicit customer approval. fnnlr performs no
autonomous destructive action; nothing is applied without approval.

## 10. Support boundaries
Support is operator-assisted within the agreed launch window. Support helps with
setup, activation, go-live, and first-week operation. Support does not write the
customer's offer, run their ad spend, or act as their sales team.

## 11. Security & privacy basics
Strict per-tenant isolation; no cross-tenant access. Credentials are encrypted and
fail-closed in production. Secrets are never exposed in customer-facing output.
The customer is responsible for the lawful basis of any personal data they import
and for their own customers' consent.

## 12. Termination / pause / rollback
Either party may end or pause the engagement per the commercial terms. On request,
the customer's funnel can be paused or rolled back; data handling on termination
follows the agreed terms and applicable law.

## 13. Limitation of liability
To the extent permitted by law, fnnlr is not liable for indirect or consequential
losses, lost revenue, or outcomes that depend on the customer's own sales motion.
This section must be finalized by a lawyer.

## 14. Accepted use
The customer will not use fnnlr for unlawful messaging, spam, deceptive offers, or
any use that violates WhatsApp's terms or applicable law.

---

### Customer responsibilities checklist (attach to the agreement)
- [ ] WhatsApp number
- [ ] Public offer details (promise, price, package)
- [ ] Payment instructions (method + account + confirmation steps)
- [ ] Logo / brand basics (if needed)
- [ ] Traffic source
- [ ] Support contact
- [ ] Response owner (who replies to leads)
- [ ] Payment confirmation owner (who confirms transfers)
