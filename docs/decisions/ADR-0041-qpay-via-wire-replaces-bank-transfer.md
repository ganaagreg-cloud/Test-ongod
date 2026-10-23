---
id: ADR-0041
title: 'QPay through Wire replaces manual bank transfer (web portal only)'
status: 'accepted (the handling of old bank requests superseded by [[ADR-0046-remove-bank-transfer-path|ADR-0046]])'
date: '2026-10-19'
tags: [adr, area/payments, area/api, area/portal]
---

## Context

[[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] chose manual bank transfer approved in the admin and deferred QPay as a paid add-on. The client has now paid for QPay ([[changes]], 2026-10-19) and wants it to replace bank transfer. The owner already runs QPay through Wire (wire.mn) in production on dearlove.mn, so the working pattern exists ([[R-wire-qpay-gateway]], TO-VERIFY).

Store rules are unchanged: the iOS and Android apps show no price, plan or payment button, and the first store release has no payment of any kind ([[R-apple-no-payment-ui]], [[R-google-play-payments]]). Payment stays in the web portal.

## Decision

1. **Provider.** Members pay in the portal with QPay through Wire's hosted checkout. Bank transfer, the bank-details screen and the "Төлсөн" form leave the portal.
2. **The Subscription is the order.** Choosing a plan creates the `PENDING_PAYMENT` Subscription as today (one open request per user, 7-day expiry) and then a Wire payment intent and checkout session. The Subscription stores `wirePaymentIntentId` (unique), `checkoutUrl` and `paymentProvider` (`WIRE` or `MOCK`). Idempotency keys `pi-<subscriptionId>` and `cs-<subscriptionId>` mean a retry never creates a second invoice.
3. **Money amount comes only from the server** (`Plan.priceMnt`). Nothing in a request body can set it.
4. **Grant access** in one function used by the webhook, the status poll and the mock: a transaction that locks the user first ([[ADR-0018-auth-implementation-details|ADR-0018]] #6), updates `PENDING_PAYMENT` to `ACTIVE` with the status precondition (the same period maths as the admin approve), creates `Payment(method QPAY, providerRef = intent id)`, refreshes `User.accessUntil`, writes an audit entry and queues the approval email and push. Running it twice grants once.
5. **Never trust the webhook body.** The handler verifies the signature on the raw body (SDK `Webhooks.verify`, no home-made crypto), de-duplicates by event id in a new `WebhookEvent` table, then re-reads the intent from Wire and grants only if `status = succeeded`, the amount equals `toMinor(amountMnt)` and, in production, `livemode = true`. On `canceled` or `payment_failed` a still-pending Subscription becomes `CANCELLED`. A failure deletes the event row and returns 500 so Wire retries. Without `WIRE_WEBHOOK_SECRET` the route answers 503.
6. **Status poll.** `GET` of the member's own subscription re-reads a pending intent from Wire with the same rule, so payments unlock even before the webhook is set up. The portal pay page polls it.
7. **Amount units.** One function `toMinor` converts ₮ for both creating the intent and checking it. It sends whole ₮ (no x100) because of the live behaviour in [[R-wire-qpay-gateway]]; a comment says why. **Launch gate:** one small real payment and a check of the charged amount.
8. **Mock mode** when `WIRE_API_KEY` is unset: provider `MOCK`, checkout at a portal page with "Simulate success" and "Cancel". It is refused unless `NODE_ENV !== 'production'` or `ALLOW_MOCK_PAYMENTS=1`, and the route refuses any subscription whose provider is not `MOCK`.
9. **Exception to "slow work goes through the Job table":** creating the checkout runs inside the request, because the member is waiting for the redirect URL and a failure must be shown at once. It has a 15 s timeout, 2 retries and an idempotency key. Everything that follows payment (email, push) still goes through jobs.
10. **Admin.** The payments queue and approve/reject stay for old `PAYMENT_SUBMITTED` rows and for manual grants; no new bank-transfer requests are created. Removing that code is a later cleanup.
11. **Dependency.** `@buildry-wire/wire` (TO-VERIFY version and licence). Env: `WIRE_API_KEY`, `WIRE_WEBHOOK_SECRET`, `WIRE_ALLOWED_OPERATORS` (`sandbox` for test keys, `qpay` live), `ALLOW_MOCK_PAYMENTS`, all in `.env.example` as placeholders. Bank details env values stay until the cleanup.
12. **Mobile.** No change. No endpoint the apps use returns a price, plan or checkout URL.

## Alternatives rejected

- **Call QPay directly (developer.qpay.mn):** needs its own merchant contract and token handling, and the owner's working integration is already Wire.
- **Keep bank transfer beside QPay:** the client asked for replacement; two flows double the screens and tests.
- **Create the checkout in a job and poll:** adds a state and a delay for no gain.
- **Hand-written webhook signature check:** breaks the "no custom crypto" rule.

## Consequences

- **SPEC changes** (approved by the owner on 2026-10-19, applied): Surfaces portal line, Workflow D, the out-of-scope line, Subscription and a new WebhookEvent in the data model.
- **Migration:** three Subscription columns, one enum, one table. Existing rows are untouched.
- **Cost:** Wire's fee (about 1% or more, ASSUMPTION) comes out of each yearly payment.
- **Owner risk, accepted:** turning payment on inside a mobile app in a later update would break store rules (guideline 3.1.1); it needs its own ADR if ever built.
- Needs a Wire merchant account with QPay enabled; until then everything runs in mock mode.

## Evidence

- [[R-wire-qpay-gateway]] (TO-VERIFY)
- [[R-apple-no-payment-ui]], [[R-google-play-payments]]
- Reference code: ganaagreg-cloud/dear-love-app, `src/lib/wire.ts`, `src/lib/orders.ts`, `src/app/api/webhooks/wire/route.ts`
