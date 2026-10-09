---
id: ADR-0023
title: 'Subscription workflows D, E, F: implementation details'
status: accepted
date: 2026-10-08
tags: [adr, area/payments, area/backend, area/admin]
---

## Context

[[SPEC#Workflows]] D (subscribe), E (admin approval) and F (access ends) fix the behaviour. [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] and [[ADR-0007-access-model-reference-codes|ADR-0007]] fix the model. This ADR records the details the code had to choose. It changes none of them.

## Decision

**Subscribe (portal)**

1. `GET /v1/plans`, `POST /v1/subscriptions`, `GET /v1/subscriptions/current`, `POST /v1/subscriptions/:id/submitted` all need a signed-in user. Nothing about plans, prices or bank details is in `/v1/app-config` or any mobile route.
2. Apply needs a verified email (`EMAIL_NOT_VERIFIED`). "One open request" means PENDING_PAYMENT or PAYMENT_SUBMITTED, enforced inside a transaction that first takes the per-user lock ([[ADR-0018-auth-implementation-details|ADR-0018]] #6), so parallel taps give one request. An ACTIVE period is not "open": members can renew early. A PENDING_PAYMENT older than 7 days counts as expired at once, even before the cron runs.
3. Bank name, account and holder come from env (`BANK_NAME`, `BANK_ACCOUNT`, `BANK_ACCOUNT_HOLDER`, required in production) and are returned only with a PENDING_PAYMENT request.
4. "Төлсөн" accepts `multipart/form-data` (fields `payerNote`, `transferAt`, file `receipt`) or plain JSON without a file. The receipt must be JPEG, PNG or WebP by its first bytes (name and declared type are ignored), at most 5 MB. It is stored under a random UUID name in `RECEIPTS_DIR` on the server's disk, outside every static folder. `Subscription.proofImagePath` holds the key; the API never returns it, only `hasReceipt`. Only `GET /v1/admin/subscriptions/:id/receipt` reads it (admin + TOTP, `no-store`). The submit is a conditional UPDATE, so a double tap stores one file (the loser deletes its own).

**Approval (admin)**

5. Approve, reject, revoke and grant each run in one transaction that starts with the user lock, check `status` in the UPDATE's `where`, and write the `AuditLog` row and the email/push jobs in the same commit. A second approve gets `409 SUBSCRIPTION_STATE`.
6. Period: `startsAt = max(now, latest ACTIVE endsAt of the user)`, `endsAt = startsAt + plan.durationDays` (plain 24 h days; Ulaanbaatar has no daylight saving). `User.accessUntil` is rebuilt as the maximum `endsAt` of the user's ACTIVE subscriptions after every approve, grant and revoke.
7. Approve creates a `BANK_TRANSFER` Payment and queues `paymentApproved` email and a push. Reject needs a reason (max 500) and queues `paymentRejected`. **Manual grant** creates an ACTIVE subscription (amount 0, `MANUAL_GRANT` payment, optional `days` override) and sends **no** email or push, because SPEC E asks for none and demo accounts have fake addresses. **Revoke** works on ACTIVE only, marks payments REFUNDED only when `refund: true`, and keeps the reason in the audit entry.
8. Revoking one period does not shift a later stacked period; the user keeps access to the later `endsAt`. To cut a user off completely, revoke each ACTIVE period.
9. Lists use `page` and `limit` (max 100) with a total; search splits the text into words, every word must match one of reference code, username, email, phone, first or last name (LIKE wildcards escaped). The queue is oldest first.
10. `GET /v1/admin/payments.csv` exports Payment rows (optional inclusive `from`/`to` in Ulaanbaatar days, max 50 000 rows) with a UTF-8 BOM, Mongolian headers, quoting, and a leading `'` on cells that would be formulas. Every export is audited.

**Access ends (cron)**

11. `sendAccessEndingReminders` runs on `/v1/cron/tick`: ACTIVE periods ending within 14 days, flagged by `Subscription.reminderSentAt`, set in the same transaction that queues the email and push, with the flag still empty as the UPDATE precondition. A period already extended by a later ACTIVE one is skipped (the later one gets its own). Existing tasks `expirePendingPayments` and `expireEndedSubscriptions` are unchanged.

**Push**

12. Push is the `push.send` job: all devices of the user with an Expo token, via the Expo Push Service ([[R-expo-push-api]]), 100 per request, dead tokens cleared. Tickets are checked, receipts are not (yet).

Schema additions (migration `20261009090000_admin_payments_totp`): `Subscription.reminderSentAt`, indexes `Subscription(status, endsAt)` and `AuditLog(createdAt)`. **SPEC "Data model" needs `reminderSentAt`; the edit is waiting for approval.**

## Alternatives rejected

- **Receipts in Bunny Storage:** the pull zone is public by URL, and a private zone is more setup; a private folder on the app server is simpler and the files are few and small. Revisit if the host disk is not persistent.
- **Store the receipt as a database BLOB:** bloats backups and the connection; Prisma/MySQL BLOB handling is awkward.
- **Cursor paging for admin lists:** the lists are small and filtered; offset paging is enough and easier for the admin UI.
- **Notify on manual grant:** not in SPEC; fake demo addresses would bounce and retry.
- **Expo `expo-server-sdk` package:** the API is one POST; fewer dependencies.

## Consequences

- `RECEIPTS_DIR` must be on persistent disk and in the backup, or receipts are lost on redeploy. Whether iTools offers that is open ([[R-hosting-limits]] TO-VERIFY, [[open-questions]] #14).
- A 5 MB multipart upload must pass the host's proxy limits (same open question).
- Push to a user with no token is a silent no-op; users who never opened the app get only the email.
- Reminders go out for any ACTIVE period, including short gifts.

## Evidence

- [[R-expo-push-api]] (VERIFIED), [[R-hosting-limits]] (TO-VERIFY)
- Behaviour covered by `apps/api/test/subscriptions.test.ts`, `admin-access.test.ts`, `admin-payments.test.ts`, `reminders.test.ts`, `push.test.ts`, `subscriptions-unit.test.ts`.
