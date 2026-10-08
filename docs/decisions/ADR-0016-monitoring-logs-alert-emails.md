---
id: ADR-0016
title: Monitoring = rotating log file + owner alert emails; Sentry optional
status: accepted
date: 2026-10-08
tags: [adr, area/backend]
---

## Context

[[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]] planned Sentry. The client wants to avoid paid services, and self-hosted Sentry does not fit shared hosting.

## Decision

- **Logs:** JSON logs to stdout, plus an optional daily/size-rotated file (`LOG_FILE`, pino-roll) keeping `LOG_FILE_COUNT` files. Every request line carries a request ID.
- **Alerts:** `ALERT_EMAILS` get a Mongolian email for every 5xx and every permanently failed job, throttled per error key (`ALERT_THROTTLE_MINUTES`), sent through the job queue. Failed alerts never trigger new alerts.
- **Uptime:** an external free checker polls `/health`.
- **Sentry:** stays optional; it activates only when `SENTRY_DSN` is set.

## Alternatives rejected

- **Self-hosted Sentry or GlitchTip:** needs far more RAM and services (PostgreSQL, Redis) than shared hosting offers.
- **Sentry required:** unnecessary cost dependency.

## Consequences

- If the database is down, alerts cannot be queued; the uptime check covers that case.
- Implemented in commit `2a2972b`.

## Evidence

- Behaviour covered by `apps/api/test/alerts.test.ts` and `logger.test.ts`.
