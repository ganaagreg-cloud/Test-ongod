---
topic: Prisma 7 refuses destructive migrate commands run by an AI agent
status: VERIFIED
checked: 2026-10-08
recheck_after: 2026-12-07
source: 'computed locally: prisma migrate reset --force (Prisma 7.10.0) run from Claude Code'
tags: [research, tooling, area/backend]
---

## Fact

Prisma 7.10 detects when `prisma migrate reset` is run by an AI agent (Claude Code) and refuses. It proceeds only with the user's explicit consent, passed via `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`. The agent must ask the user first and never fill this in itself. Prisma 7 `migrate reset` also no longer runs the seed automatically.

## How it was checked

Observed while building the API test setup. Tests now use the non-destructive `prisma migrate deploy` and wipe rows per test instead.

## Used by

- [[ADR-0017-toolchain-version-pins|ADR-0017]]
