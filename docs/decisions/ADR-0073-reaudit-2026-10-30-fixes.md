---
id: ADR-0073
title: Re-audit fixes — cancelled payments are synced, refused pushes retried, grant key required, row locks for reports and plans
status: accepted
date: '2026-10-30'
supersedes:
  [
    ADR-0045 (only which requests the payment sync asks Wire about),
    ADR-0071 (only the optional grant key),
  ]
tags: [adr, area/api, area/admin, area/mobile, area/payments]
---

## Context

The re-audit of `main` at 3c7cdfc ([[AUDIT-2026-10-30]]) reported five findings and two concurrency risks. Each was checked in the code and reproduced with a test before it was fixed (the two races on real MySQL).

## Decision

1. **Upload recovery** pages through every stale `UPLOADING` row (by id, 50 at a time) instead of re-reading the first 50. Unfinished rows no longer hide a finished file behind them.
2. **Push**: a ticket that Expo refuses for any reason other than `DeviceNotRegistered` is retried for only that device, in a new job 1, 2 and 4 minutes later (3 rounds), then logged. The devices that got the message are not sent it again.
3. **Payment sync** (status page and cron) also asks Wire about `CANCELLED` requests and gifts within the sync window. A cancel can race a payment that went through, and the webhook can be lost. Granting is unchanged: one transaction with a status precondition, so it happens once.
4. **Manual grant**: `requestId` is required. A request without it gets 400 `VALIDATION_ERROR`.
5. **Comment report** and **switching a plan off** lock their rows first, before any read: the comment row, or all active plans. Parallel reports then count one after another. Two admins switching off the last two plans get one 200 and one 409 `LAST_ACTIVE_PLAN`. This uses the same no-op update lock as `lockUser`.
6. **Player**: when renewing the play URL before a play or seek is refused (`NO_ACCESS`, `NOT_FOUND`, `UNAUTHORIZED`), the engine is paused, so buffered audio or video does not play on. A network error does not pause.
7. **Олон файл**: leaving the page aborts the file being sent and starts no further files, as the leave warning says. The draft stays; picking the same file on it resumes.

## Consequences

- Expo error codes other than `DeviceNotRegistered` are not verified ([[R-expo-push-api]]). Retrying every other refusal is safe without knowing them: at most 3 extra sends per device.
- Cancelled requests are polled for the same window as expired ones (`SYNC_WINDOW_DAYS`).
- Each fix has a test. The two races and the recovery stall were shown to fail without the fix.
