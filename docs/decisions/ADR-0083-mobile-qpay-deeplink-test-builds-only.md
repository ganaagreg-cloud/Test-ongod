---
id: ADR-0083
title: 'QPay (Wire) with a bank-app deeplink in the mobile apps: test builds only, behind a flag'
status: accepted
date: '2026-10-31'
tags: [adr, area/payments, area/mobile, area/store]
---

## Context

[[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]] (#12) and [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]] keep every payment in the web portal. The apps show no price, plan, bank detail or pay button, only the plain activate message.

Owner decision, 2026-10-31: after the first deploy, QPay with a bank-app deeplink goes into the mobile apps, and the owner wants to test it before that. The first deploy and the first store release stay payment-free.

The store rules are not cleared for this. Apple (3.1.1, 3.1.3(a)): outside the US storefront no price, buy button or "pay on the web" wording for unlocking content, so QPay inside the iOS app risks rejection ([[R-apple-no-payment-ui]]). Google Play: not checked ([[R-google-play-payments]], TO-VERIFY). The owner says the in-app payment is allowed in Mongolia; no note supports that yet ([[R-mongolia-store-payment-rules]], TO-VERIFY).

## Decision

1. **Test builds only.** The mobile payment flow sits behind one flag, `EXPO_PUBLIC_MOBILE_PAYMENTS`, **off by default**. It is `1` only in the EAS `preview` profile (internal distribution, never submitted to a store) and pointed at the dev tunnel.
2. **Store builds stay as they are.** The `production` profile and the first deploy have the flag off: no price, plan, pay button or deeplink in the app. [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] #web-only, [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]] #12 and [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]] still hold for them.
3. **Same backend path as the portal.** The app asks the API to start a payment; the API creates the Subscription and Wire intent exactly as in ADR-0041 (amount from `Plan.priceMnt` only, status-precondition transaction, webhook plus status poll). No new way to grant access.
4. **Deeplink.** The app opens the bank/QPay app with the link Wire returns, then polls the member's own subscription until it is ACTIVE or dead.
5. **Server side gate.** The new mobile payment endpoint also refuses unless the API env `MOBILE_PAYMENTS_ENABLED=1`, so a production API cannot be driven by a stray client. Both flags are in `.env.example` as placeholders.
6. **Gate before any store build enables the flag.** A VERIFIED note for Apple and for Google Play (and Mongolia), and a new ADR that turns it on for the store profile. Until then enabling the flag in `production` is forbidden.
7. **Scope of this ADR is the decision.** The code is built after this ADR, in small steps, with tests for the access rules.

## Relation to ADR-0076

[[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]] (owner's decision, 2026-11-02) is the real in-app payment, behind the server switch `inAppPayment`. This ADR is the interim test flow behind the build flag `EXPO_PUBLIC_MOBILE_PAYMENTS` (preview builds only). When ADR-0076 is built, its screens replace `apps/mobile/src/testpay/` and this flag goes away; the switch, not the flag, then decides what the stores see. Until then store builds stay payment-free.

## Alternatives rejected

- **Build it straight into all builds:** risks rejection of the first store submission ([[R-apple-no-payment-ui]]) and breaks the accepted ADRs without a gate.
- **Keep portal-only and refuse the owner's request:** the owner decided otherwise, and a flagged test build costs nothing in the stores.
- **A separate test app/branch:** drifts from the real app; a flag plus the `preview` profile tests the real code.
- **Apple/Google in-app purchase:** not the owner's plan, and it takes a store cut; QPay was paid for by the client ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]).

## Consequences

- SPEC lines "Workflow D (portal only)" and "no price... payment button in the apps" stay true for store builds; a note about the flagged test builds must be added to SPEC (diff awaiting owner approval).
- One more flag on each side (`EXPO_PUBLIC_MOBILE_PAYMENTS`, `MOBILE_PAYMENTS_ENABLED`); tests cover flag off (endpoint refuses, UI hidden) and flag on.
- The preview APK built on 2026-10-31 has no payment; a new preview build is needed once the flow exists.
- The tunnel URL changes on restart, so the Wire webhook endpoint and the APK must be updated each time.

## Evidence

- [[R-apple-no-payment-ui]] (Apple 3.1.1 / 3.1.3(a), read 2026-10-21).
- [[R-google-play-payments]] (TO-VERIFY, not checked).
- [[R-mongolia-store-payment-rules]] (TO-VERIFY: the owner's claim that in-app payment works in Mongolia is an ASSUMPTION).
- [[R-wire-qpay-gateway]] (TO-VERIFY).
