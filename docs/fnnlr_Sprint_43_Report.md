## fnnlr — Sprint 43 Report (Commercial Packaging + Customer Agreement)

This sprint turns fnnlr from an operable Release Candidate into a **sellable offer with honest limits** — no new feature, no billing system, no pricing fantasy. Every commercial claim matches the product state proven in Sprints 31–42: no auto-send WhatsApp, no payment processing, no guaranteed revenue, manual approval, evidence-based. A consistency checker enforces this automatically.

**Result: 433 tests, 406 pass, 0 fail, 27 skip without a DB. Typecheck clean. Web balanced, no `x-tenant-id` trust. All 8 commercial docs pass the consistency checker (0 forbidden claims, 0 missing honesty markers).**

### Consistency checker (built first — `modules/commercial/src/consistency.ts`)
A pure scanner that every commercial doc must pass. `FORBIDDEN_CLAIMS` is a regex list of over-promises the product does not deliver (guaranteed revenue/ROI, auto-send WhatsApp, automatic payment processing, fully autonomous sales, hands-free revenue, replaces-all-CRM, no-human-needed, AI-fixes-everything). `REQUIRED_MARKERS` are the honesty concepts that must appear across the set (no auto-send, no payment processing, manual approval, evidence-based, no guaranteed revenue, customer responsibilities — English + Arabic). The scanner collapses markdown soft-wraps into logical sentences and skips questions, headings, and negated statements (English and Arabic, with correct handling of Arabic's lack of word boundaries), so it passes honest copy and fails real over-claims. Verified both ways: the real docs pass; a planted "guaranteed revenue / auto-send" doc fails.

### The 8 commercial docs (all pass the checker)
- **COMMERCIAL_PACKAGING.md** — positioning (one-line / short / long pitch), is / is-not, what it replaces / connects to / leaves manual, and three tiers (Starter Activation, Growth Ops, Managed Launch) with includes + explicit limits. Packaging artifacts only — no billing.
- **CUSTOMER_AGREEMENT_DRAFT.md** — scope, customer vs fnnlr responsibilities, WhatsApp + payment responsibility, data accuracy, AI disclaimer, no-guaranteed-results, manual-approval, support boundaries, security/privacy, termination/rollback, limitation of liability, accepted use, plus a responsibilities checklist. Marked "not legal advice / needs lawyer review."
- **ONBOARDING_PROMISE.md** — Day 0 / 1 / 2–3 / 7 mapped to the real scripts (`customer:create` → `customer:execution-lock` / `first-signal` → `72h-monitor` → `week1-review`), with the day-7 decision being whatever the gate returns.
- **SALES_QUALIFICATION.md** — qualify-in list, disqualify / reset-expectations list, the expectation-setting script, and a decision.
- **CUSTOMER_SUCCESS_CRITERIA.md** — activation / operational / revenue success, with revenue reported only when real payment states exist (no fake ROI).
- **COMMERCIAL_FAQ.md** — the ten honest answers (auto-send? payments? guarantees? no traffic? team? Arabic? EG+Gulf? BSP? AI? thin data?).
- **SALES_PAGE_COPY.md** — AR + EN copy with headline / subhead / problem / how-it-works / what-you-get / what-it-does-not-do / who-for / who-not-for / CTA / trust notes.
- **INTERNAL_SALES_SCRIPT.md** — discovery, qualification, explanation, expectation-setting, objection handling, close, and what to collect before setup (maps to the execution manifest).

### Command + test
- `commercial:check` (`scripts/commercial-check.ts`) — scans a docs dir, prints violations + missing markers, exits non-zero on failure.
- `tests/commercial.test.ts` (6): `isCommercialDoc` matches the right files; the checker fails on affirmative forbidden claims; passes honest negated copy (English + Arabic); ignores questions/headings; reports missing markers; and — when the bundle docs are mounted — asserts the real 8-doc set is clean and complete.

### Acceptance — all met
Commercial package ✓ · pricing tiers + limits ✓ · customer agreement draft ✓ · onboarding promise ✓ · sales qualification ✓ · success criteria ✓ · FAQ ✓ · sales page copy ✓ · internal sales script ✓ · consistency checker ✓ · no forbidden claims ✓ · no fake promises ✓ · tests green ✓ · report + bundle present ✓.

### Remaining risks (honest)
- The customer agreement is a plain-language draft and is explicitly marked as needing lawyer review; it must not be used as-is.
- The consistency checker is heuristic: it catches the listed over-claims and honesty-marker gaps, not every possible misleading phrasing. New marketing copy should still be read by a human, and new forbidden patterns added to the list as they come up.
- The tiers are packaging artifacts with no billing system behind them; pricing numbers are deliberately omitted (a commercial decision, not a code one).
- The Arabic negation handling covers the common negators (مش, مفيش, بدون, لا, ليس, لن); unusual phrasings could in principle slip past, which is why the human-review note stands.

### Status
fnnlr is now not only operable but sellable — with a clear offer, honest tiers and limits, a lawyer-ready agreement draft, an onboarding promise tied to real scripts, qualification and success criteria that refuse fake ROI, AR/EN sales copy that states what the product does not do, and a consistency checker that fails the build if any forbidden claim ever creeps into the commercial docs. Nothing here promises what the code does not do.
