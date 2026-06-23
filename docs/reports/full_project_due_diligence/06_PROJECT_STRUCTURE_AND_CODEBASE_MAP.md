# Project Structure and Codebase Map

Repository: /Users/ramymortada/Documents/New project/fnnlr
Branch/commit: main / e421701
Audit date: 2026-06-22
Evidence counts: 37 modules, 53 test files, 33 SQL migrations, 56 package scripts.
Verification: npm run typecheck clean; npm test 473 tests, 445 pass, 0 fail, 28 skipped; npm run ci SAFE TO RELEASE.

Folder map: apps for UI/API, modules for business domains, packages for shared db/AI, scripts for operations, tests for automation, docs for proof/runbooks. Coupling risk: central apps/api/src/server.ts is large. Recommendation: split route handlers by domain.
