---
topic: 'Whether Apple and Google Play allow QPay / external payment for digital content inside an app on the Mongolian storefront'
status: TO-VERIFY
checked: '2026-10-31'
recheck_after: '2026-11-30'
source: 'owner statement 2026-10-31 (no document); Apple guidelines read 2026-10-21 in [[R-apple-no-payment-ui]] list a US storefront exception and no Mongolia exception'
tags: [research, area/payments, store/apple, store/google]
---

## Fact

**ASSUMPTION (owner, 2026-10-31):** in-app payment with QPay and a bank-app deeplink works in Mongolia.

**Not supported by any source yet.** The only checked source ([[R-apple-no-payment-ui]]) says unlocking content in an iOS app needs in-app purchase, with exceptions for reader apps (access to content bought elsewhere) and the US storefront. Mongolia is not listed there. Google Play: nothing checked ([[R-google-play-payments]]).

## How it was checked

Not checked. To do: read Apple's current guidelines and storefront/entitlement pages for Mongolia, and Google Play's Payments policy and any country-specific alternative billing list for Mongolia. Save the quoted lines and the date. Also look at how local apps with paid content handle it (evidence only, not proof).

## Used by

- [[ADR-0083-mobile-qpay-deeplink-test-builds-only|ADR-0083]]
