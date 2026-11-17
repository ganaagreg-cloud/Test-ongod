---
id: ADR-0109
title: 'The store build has no payment code; in-app payments return as a reviewed update'
status: accepted
date: '2026-11-17'
tags: [adr, area/mobile, store/apple]
---

## Context

Apple asked for more information about the app (Guideline 2.1, 2026-11-17). The app held the in-app payment, gift shop and gift-code screens behind the server switch `inAppPayment` ([[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]], [[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]]). A switch Apple cannot see is a change of the reviewed app without review, and the review notes could not truthfully say "no payment feature" ([[R-apple-no-payment-ui]], [[R-apple-unlock-codes-3-1-1]]). Ganaa decided (2026-11-17): payments only on the website first; try in-app QPay after the app has been live 3 to 4 months.

## Decision

1. `apps/mobile/metro.config.js`: unless `EXPO_PUBLIC_PAYMENTS_CODE=true`, every import of `src/inpay` or `src/testpay` from outside those folders resolves to `src/payments-off.js`, a stub that renders nothing and answers "payments off". Default **off**; no EAS profile sets it.
2. In such a build the server switch `inAppPayment` has no effect: no "Эрх авах", no gift shop, no code field, no payment texts and no `/gifts` calls in the bundle (checked on an exported iOS bundle: with the flag the texts and `/gifts` are present, without it they are gone).
3. The code stays in the repository. To bring payments back: ship a **new version** with `EXPO_PUBLIC_PAYMENTS_CODE=true`, say so in its review notes, and decide first between Apple in-app purchase, the External Link Account Entitlement ([[R-apple-external-link-entitlement]]) or accepting the risk.
4. The review notes say "The app contains no payment feature" for this build ([[APPLE_REVIEW_NOTES]]).

## Consequences

- Members pay and redeem gift codes on the website (QPay); gifts and admin-made codes work there as before.
- A new iOS build is needed. Test builds that need the payment screens must set `EXPO_PUBLIC_PAYMENTS_CODE=true`.
- Shared data definitions (subscriptions, `checkoutUrl`) remain in the bundle: they are types and checks, not screens.
