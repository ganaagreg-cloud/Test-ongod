---
id: ADR-0060
title: Gift access: a member buys a plan for someone else, the recipient redeems a code in the portal
status: accepted
date: '2026-10-28'
tags: [adr, area/backend, area/portal, area/admin]
---

## Context

Gift access ("Эрх бэлэглэх") was accepted as a paid add-on on 2026-10-28 ([[changes]], [[SPEC]] J). [[SPEC]] D covers a member paying for their own access only, with one open request per user. [[open-questions]] #29 (does the recipient need an account first, how long a code lasts, refunds and re-sends) is still open, so this ADR picks defaults marked ASSUMPTION; each is a small change if the client answers differently.

## Decision

1. **A new `Gift` table**, separate from `Subscription`. A gift is money received before anyone has access, and the "one open request per user" rule must not block a member from buying a gift while renewing. Status: `PENDING_PAYMENT` → `PAID` → `REDEEMED`; also `CANCELLED` (checkout cancelled), `EXPIRED` (unpaid for 7 days, or paid but not redeemed in time) and `VOID` (an admin cancels a paid, unredeemed gift, for a refund).
2. **Buying (portal only, verified email, like D):** `POST /v1/gifts {planId}` creates a `PENDING_PAYMENT` gift with the price and the plan's days copied onto it, and a QPay checkout through Wire (the mock without keys), exactly as in [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]. Asking again for the same plan while one is unpaid returns the same gift. A buyer may have several gifts; at most 5 unpaid at a time.
3. **Payment turns the gift `PAID` and issues the code** (the webhook, the status poll, the cron sync and the mock all end in one function, in one transaction with a status precondition, so it runs once). The code is `XXXX-XXXX-XXXX` from the same 31-character alphabet as reference codes (31^12 values), unique. The buyer gets an email with the code and sees it in the portal under "Миний бэлгүүд", so it can be re-read or re-sent by hand at any time (ASSUMPTION for #29: no "send to the recipient" email; the buyer passes it on). The code is stored as is, not hashed, because the buyer must be able to see it again; it grants one plan period once, is long and random, and redeeming is rate limited. The apps never show it.
4. **Redeeming (portal only, signed in):** `POST /v1/gifts/redeem {code}`. The recipient needs an Онгод account and a verified email (ASSUMPTION: no redeeming during sign-up). In one transaction with the user row locked: the gift must be `PAID` and not past `expiresAt`; the update `PAID → REDEEMED` with that precondition decides a race, so a code works once. It creates an `ACTIVE` subscription (provider `NONE`, the gift's amount and days, the period as in [[SPEC]] E: starts at the later of now and the current access end), a `Payment(QPAY)` with the gift's provider reference, refreshes `accessUntil`, writes the audit row, and queues the "access active" email and push as in D. A wrong, used or expired code gives the same `GIFT_NOT_REDEEMABLE` answer, so codes cannot be probed. 10 tries per 15 minutes per address.
5. **Validity (ASSUMPTION): 365 days from payment**, because the period starts at redeeming. After that the gift becomes `EXPIRED` (cron) and nothing is refunded automatically.
6. **Refund (ASSUMPTION):** an admin can void a `PAID`, unredeemed gift with a reason (`PAID → VOID`, audited). The money is returned outside the app, as for a revoke. A redeemed gift is a normal subscription: the existing revoke applies.
7. **Admin:** page "Бэлэг" (list with status filter, search by code, buyer or recipient; Void). Seen by any admin or owner.
8. **Plans:** the gift keeps its own copy of the days and the price, so editing or switching off the plan later does not change a gift ([[ADR-0059-admin-plan-editor|ADR-0059]]). Gifts can only be bought for an active plan.
9. **Apps:** unchanged. They show nothing about gifts; a redeemed gift is simply access ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]]).
10. **Portal:** "Эрх бэлэглэх" (choose a plan, pay), "Бэлгийн код ашиглах" (enter or open a `?code=` link), "Миний бэлгүүд" (status and code), linked from the plans page and Миний бүртгэл.

## Alternatives rejected

- A `Subscription` with a gift flag: it would break the one-open-request rule and put "access" rows on someone who has none.
- Redeeming during sign-up: more flows (Google/Apple, replace-unverified, [[SPEC]] A, C) to keep consistent; a code entered after sign-in does the same job.
- Hash the code: the buyer could not read it again, and a re-send would then need a new code.
- Count gift money in the dashboard income when bought: left out for now (below).

## Consequences

- The dashboard's income counts payments, which for a gift are created when it is redeemed, not when it is bought. The Бэлэг page shows the paid amounts and dates. If the owner wants gift money counted at purchase, that is a small later change.
- Unredeemed paid gifts are money held for a service not yet given; the owner should know the number (Бэлэг page shows it).
- A new cron task syncs waiting gift payments and expires old gifts ([[ADR-0047-wire-payment-sync-window|ADR-0047]] style).
- Tests: access rules (admin only, buyer only sees their own), concurrency (two redeems, one wins), idempotent payment, expiry, void, code probing, the buyer's period adds to remaining access.
