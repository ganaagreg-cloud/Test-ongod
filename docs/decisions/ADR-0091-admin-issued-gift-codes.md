---
id: ADR-0091
title: 'An admin can make free one-time gift codes in batches (Бэлэг page)'
status: accepted
date: '2026-11-12'
tags: [adr, area/backend, area/admin]
---

## Context

The admin Бэлэг page lists gifts members bought and can void them ([[ADR-0060-gift-access|ADR-0060]] item 7), but an admin cannot make a code. Ganaa asked on 2026-11-12 for "gift creation which creates the promo code", and chose one-time codes made in batches over one shared multi-use code.

## Decision

1. `POST /v1/admin/gifts {planId, count 1–50, note, days?, validDays?, requestId}` (any ADMIN or OWNER, like a manual grant) creates `count` rows in the existing `Gift` table that start life `PAID` with a code `XXXX-XXXX-XXXX`, `amountMnt` 0, no payment provider, `adminIssued = true`, the admin as `buyerId`, the admin's `note`, and `expiresAt` = now + `validDays` (default 365, as a bought gift). `days` overrides the plan's days, as in a manual grant. The plan may be switched off.
2. One transaction per request (all codes or none), the admin's row locked first; one audit row `gift.issue` with the ids, plan, days and note. `requestId` (a UUID) is stored as `issueKey`: a retried or doubled request returns the first batch.
3. Redeeming is unchanged ([[SPEC]] J: one transaction, status precondition, a code works once), except that an admin-issued gift records `Payment(MANUAL_GRANT, 0)` instead of `Payment(QPAY)`, so it never counts as income on the dashboard ([[ADR-0056-admin-dashboard-overview|ADR-0056]]).
4. No email is sent when codes are made. The admin copies them from the dialog ("Бүгдийг хуулах") or from the list later. They do not appear under the admin's own "Миний бэлгүүд".
5. An issued code can be voided like a bought one; unredeemed ones expire by the existing cron.
6. Schema: `Gift.adminIssued` (boolean, default false), `Gift.note` (200), `Gift.issueKey` (indexed). Migration `20261112100000_gift_admin_issued`.

## Alternatives rejected

- One shared promo code many people can use: needs a new table and use limits, and leaks easily (Ganaa chose one-time codes).
- A nullable `buyerId`: every reader of a gift would have to handle "no buyer"; the admin who made the code is a truthful value.
- `Payment(QPAY, 0)` on redeem: it would show as a QPay payment in the lists.
- OWNER only: a manual grant, which gives the same access, is open to any admin.

## Consequences

- An admin can hand out free access without a named user; every batch is in the audit log with its note. The 50-per-request cap bounds a mistake, not a determined admin.
- The Бэлэг page shows an "Админ" badge and the note in the buyer column; "Ашиглагдаагүй бэлгийн дүн" is unchanged (issued codes are 0 ₮).
- The recipient redeems on the portal today, and in the app while the switch is on ([[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]]).
- SPEC J and the data model line for `Gift` need a sentence each (edit waits for Ganaa's approval).

## Evidence

- Tests (`apps/api/test/gifts.test.ts`): validation, 401/403, the batch, idempotent retry also in parallel, redeem as a 0 ₮ manual grant once, void.
