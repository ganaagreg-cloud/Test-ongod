---
id: ADR-0104
title: 'No server-side gate for mobile payment: the switch only controls what the apps show'
status: accepted
date: '2026-11-12'
tags: [adr, area/payments, area/mobile, area/store]
---

## Context

[[ADR-0083-mobile-qpay-deeplink-test-builds-only|ADR-0083]] item 5 promised a server gate: the mobile payment endpoint refuses unless the API env `MOBILE_PAYMENTS_ENABLED=1`. It was never built ([[AUDIT-2026-11-12]] C1, [[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]] Consequences). Since then [[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]] and ADR-0090 added the server switch `IN_APP_PAYMENT`, which only changes what `GET /v1/app-config` returns as `inAppPayment`. The ADR and the code disagree.

## Decision

1. **Item 5 of ADR-0083 is dropped on purpose.** `MOBILE_PAYMENTS_ENABLED` is not built and not added to `.env.example`. Items 1–4 and 6–7 of ADR-0083 are unchanged.
2. **`IN_APP_PAYMENT` controls what the apps show, nothing more.** Off (the default): no price, plan, payment button, gift screen or code field, and the routes redirect away. A failed config fetch counts as off.
3. **The payment endpoints are not gated by the switch.** The portal and the apps share them. Money and access stay protected as before: Wire does the payment, the price comes from `Plan.priceMnt`, and access is granted only by the status-precondition transaction.
4. No code change.

## Alternatives rejected

- **Gate with an app header:** the server would have to trust a header the app sends. It is trivial to fake, so it adds no real security, and it is one more thing that can break the portal's payments (same endpoints).
- **Separate mobile-only endpoints:** a second payment path to build and test, for a risk that is not real (below).
- **Leave ADR-0083 item 5 as it is:** keeps a promise the code does not keep.

## Consequences

- A hand-made call, or an old internal test build that had the flow on, can still start a payment while the switch is off. It cannot hurt: Wire still takes the money, the price is the plan's, access comes only from the checked step.
- Store review is not affected: reviewers can only tap screens, and with the switch off no screen leads to payment. This depends on the apps staying fail-closed (switch off when the config is missing).
- [[AUDIT-2026-11-12]] item C1 is closed by this ADR.
- ADR-0083 status is amended to point here. SPEC.md and DESIGN.md need no change.

## Evidence

- [[R-apple-no-payment-ui]] (Apple 3.1.1 / 3.1.3(a), read 2026-10-21): what reviewers see is the app's screens.
- [[R-wire-qpay-gateway]] (TO-VERIFY): a real QPay payment from a phone is still untried; this ADR does not change that.
