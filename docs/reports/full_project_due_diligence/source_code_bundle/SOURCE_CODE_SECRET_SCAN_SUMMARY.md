# Source Code Secret Scan Summary

Method: local tracked-file scan before archive creation. Binary-like and excluded files were not content-scanned. Values are not printed.

Patterns checked: private key blocks, OpenAI/Anthropic-looking keys, GitHub tokens, Slack tokens, AWS access keys, JWT-like tokens, PostgreSQL URLs with non-placeholder credentials.

High-confidence findings count: 0.
No high-confidence secret values found.

Low-confidence placeholder/test fixture mentions: 32. These include CHANGE_ME placeholders, USER/PASSWORD examples, test secrets, demo password fixtures, placeholder database URLs, or intentionally truncated examples. They are documented but not archive blockers.

Decision: archive safe.

Recommendations: keep real .env files untracked, add pre-commit secret scanning, and replace root binary wheel artifacts with documented dependency installation.
