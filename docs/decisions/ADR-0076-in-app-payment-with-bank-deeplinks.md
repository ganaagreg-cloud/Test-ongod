---
id: ADR-0076
title: In-app "Эрх авах" opens bank apps by deeplink; a server switch keeps it off for store review
status: accepted
date: '2026-11-02'
supersedes:
  [
    ADR-0044 (only the rule that the apps show no payment UI; the activate message stays as the fallback),
    ADR-0006 (only "payment happens only in the web portal"),
    the CLAUDE.md rule "mobile apps never show prices,
    bank details,
    plan names,
    links to pay or payment buttons",
  ]
tags: [adr, area/mobile, area/payments]
---

## Context

Ganaa decided on 2026-11-02 ([[changes]], [[open-questions]] #33): members will not use the web portal. Other Mongolian apps open the member's bank app by deeplink for payment, and Онгод will do the same through an "Эрх авах" (get access) button in the app. Ganaa accepts the store-policy risk and does not want it reopened. The risk, for the record: Apple 3.1.1 / 3.1.3 (VERIFIED in [[R-apple-no-payment-ui]]) and Google Play payments ([[R-google-play-payments]], TO-VERIFY) restrict selling digital content outside their own purchase systems; a store may reject or remove the app. The owner carries it.

## Decision

1. A member without access sees an "Эрх авах" button. It leads to choosing a plan, then a list of bank apps; tapping one opens that bank app with the payment ready, by deeplink.
2. **Server switch `inAppPayment`, off by default.** While it is off (the store-review build and deploy) the apps show only the plain activate message of [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]], no button, no price, no plan. Turning it on needs no app update. The review notes describe what the reviewer's account sees.
3. Payment still goes through the existing checkout and webhooks ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]], [[ADR-0047-wire-payment-sync-window|ADR-0047]]): the server creates the request, the payment provider confirms, access is granted by the same transactional code. The app never decides access.
4. The portal stays built: it hosts the privacy, terms and account-deletion pages the stores need, and sign-up and email links. Members are not expected to use it.
5. Prices and plan names may now appear in the apps, only inside the payment screens that exist while the switch is on. `test/no-payment-text.test.ts` is changed to allow payment words in that one module only, and to check that nothing shows while the switch is off.

## Open (blocks building)

- **Where the bank deeplinks come from.** The payment provider must return a list of bank app links for an invoice (QPay invoices normally do). What Wire returns is not documented to us ([[R-wire-qpay-gateway]], TO-VERIFY): its checkout is a hosted page URL. Needs the provider's API or the owner's working code, then a sandbox test.
- iOS needs the bank URL schemes in the app config to open them (`LSApplicationQueriesSchemes`); Android needs package queries. The list of banks to support is not decided.
- How the app learns that the payment succeeded (poll the subscription, as the portal status page does) and what it shows after.

## Consequences

- CLAUDE.md rule line updated to match. [[STORE]] payment phases still hold: review runs with the switch off.
- Everything in the payment flow already tested on the web is reused; the new work is the mobile screens, one API endpoint for the checkout with bank links, the switch, and tests.
