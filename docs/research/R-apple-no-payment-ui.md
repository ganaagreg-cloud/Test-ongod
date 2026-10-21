---
topic: iOS app must show no price, buy button or payment instructions for digital content
status: VERIFIED
checked: 2026-10-21
recheck_after: 2027-04-21
source: 'https://developer.apple.com/app-store/review/guidelines/ (3.1.1, 3.1.3, 3.1.3(a), 3.1.3(b), 5.1.1(v)), read 2026-10-21'
tags: [research, area/payments, store/apple]
---

## Fact

**VERIFIED (Apple, primary, 2026-10-21):**

- 3.1.1: unlocking content or features (subscriptions, "access to premium content") inside the app must use in-app purchase.
- 3.1.3(a) "Reader" apps: apps "may allow a user to access previously purchased content or content subscriptions (specifically: magazines, newspapers, books, audio, music, and video)". Reader apps "may offer account creation for free tiers, and account management functionality for existing customers." They may apply for the External Link Account Entitlement (one informational link to the developer's own site to create or manage an account). In the United States storefront, buttons and calls to action are allowed without the entitlement.
- 3.1.3 intro: apps in 3.1.3 "cannot, within the app, encourage users to use a purchasing method other than in-app purchase", except the US storefront and as set out in 3.1.1(a) / 3.1.3(a).
- 3.1.3(b) Multiplatform services needs the items "also available as in-app purchases", so it does not fit Онгод (no IAP). Онгод relies on 3.1.3(a) (audio and video).
- 5.1.1(v): "If your app doesn't include significant account-based features, let people use it without a login."

So, outside the US storefront: no prices, plans, buy buttons, bank details or "pay on the website" wording in the app. Free content (a free tier) is allowed for a reader app.

## How it was checked

WebFetch of Apple's live App Review Guidelines page, 2026-10-21 (first 100,000 characters, which contain sections 3 and 5.1.1).

## Used by

- [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]
