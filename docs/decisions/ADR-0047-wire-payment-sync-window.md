---
id: ADR-0047
title: 'Wire payment sync from cron: window, order and time budget'
status: accepted
date: '2026-10-24'
tags: [adr, area/payments, area/backend]
---

## Context

[[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]] item 3 says the cron task syncs Wire requests created in the last 3 days that are PENDING_PAYMENT, EXPIRED or CANCELLED. Reading the code while implementing it showed that text is inconsistent: a request becomes EXPIRED only after 7 days, so a 3-day window never reaches an EXPIRED one, and a request is CANCELLED only when Wire itself says the intent was cancelled, so asking Wire again changes nothing. The review of the implementation also found two risks: oldest-first with a cap of 50 can starve new requests, and a hung Wire (50 calls x 3 tries x 15 s) could hold one cron tick for about 40 minutes, behind which the job drain, the reminders and the expiry would wait.

## Decision

- The task `syncWaitingPayments` asks Wire about requests with `paymentProvider = WIRE` and a payment intent, in status PENDING_PAYMENT or EXPIRED, created in the last 10 days (the 7-day expiry plus 3 days). CANCELLED is not polled.
- Newest first, at most 50 per tick.
- A time budget per tick: no new Wire call starts after `WIRE_SYNC_BUDGET_MS` (default 20000), and a single call that takes longer than 10 s is abandoned for that tick, so the task takes about 30 s at the worst.
- It still runs first in the tick, before `expirePendingPayments`.
- `payments.sync` accepts PENDING_PAYMENT and EXPIRED. An access grant still needs a verified succeeded intent with the exact amount and, in production, live mode ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]).

## Alternatives rejected

- Keep the ADR-0045 text (3 days, CANCELLED): it cannot reach EXPIRED requests and polls CANCELLED for nothing.
- Oldest first: abandoned checkouts fill the cap and block recent payers.
- A `wireSyncedAt` column to rotate through requests: a migration for a case that needs more than 50 waiting requests at once.
- No time budget: a Wire outage can stall the whole cron tick.

## Consequences

- ADR-0045 item 3 is superseded by this ADR; the other items stand.
- The new env value `WIRE_SYNC_BUDGET_MS` goes into `.env.example` and [[SECRETS]].
- With more than 50 waiting requests, the oldest wait for the member's own status poll or the webhook.

## Evidence

- Audit and review of 2026-10-24 (jobs and payments review, Important 1 and 2).
