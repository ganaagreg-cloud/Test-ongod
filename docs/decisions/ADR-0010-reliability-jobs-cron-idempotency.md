---
id: ADR-0010
title: 'Reliability: DB job queue, idempotent cron, transactional approve, tus uploads, TOTP'
status: 'accepted (the 15-minute job lock rule superseded in part by [[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]]; "Admin requires TOTP 2FA" superseded by [[ADR-0040-admin-password-only-no-totp|ADR-0040]]; "not available on shared hosting" no longer applies, we host on our own VPS, [[ADR-0075-hosting-own-vps|ADR-0075]], and the decision stands)'
date: 2026-10-08
tags: [adr, area/backend]
---

## Context

One process on shared hosting ([[ADR-0003-hosting-itools-node|ADR-0003]]). Slow work must not run inside requests; access changes must never apply twice.

## Decision

- Job table queue, claimed with `SELECT ... FOR UPDATE SKIP LOCKED` (the only raw SQL allowed).
- Scheduled tasks run via `POST /v1/cron/tick` (header `X-Cron-Secret`). Every task is idempotent.
- Approval runs in a transaction with a status precondition, so double approval is impossible.
- Media uploads use tus (resumable).
- Error tracking with Sentry.
- Admin requires TOTP 2FA.

## Alternatives rejected

- **Redis/BullMQ:** not available on shared hosting.

## Consequences

- Job handlers must be idempotent: a job can run again if the process dies after the work but before it is marked done.
- Error tracking in practice: Sentry is optional; the default is a rotating log file plus owner alert emails ([[ADR-0016-monitoring-logs-alert-emails|ADR-0016]]).
- Claim query design and deadlock lessons: [[R-mysql-skip-locked-claim]].

## Evidence

- [[R-mysql-skip-locked-claim]]
