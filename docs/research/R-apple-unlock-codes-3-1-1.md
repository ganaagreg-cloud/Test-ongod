---
topic: Apple 3.1.1 forbids unlocking content with the app's own codes, and selling gift vouchers outside in-app purchase
status: VERIFIED
checked: '2026-11-12'
recheck_after: '2027-02-10'
source: 'https://developer.apple.com/app-store/review/guidelines/ (3.1.1, 3.1.3(a)), read 2026-11-12'
tags: [research, area/payments, store/apple]
---

## Fact

**VERIFIED (Apple, primary, 2026-11-12), guideline 3.1.1:** "Apps may not use their own mechanisms to unlock content or functionality, such as license keys, augmented reality markers, QR codes, cryptocurrencies and cryptocurrency wallets, etc." and "Digital gift cards, certificates, vouchers, and coupons which can be redeemed for digital goods or services can only be sold in your app using in-app purchase." 3.1.3(a) (reader apps) allows access to "previously purchased content or content subscriptions" and free account creation, and says nothing that permits a code field.

So a gift-code field and a gift shop inside the iOS app can be rejected under 3.1.1. Whether Apple treats a code for access bought on the web as a "license key" in a reader app is not stated: ASSUMPTION that it does (the safe reading). Google Play: not covered here ([[R-google-play-payments]], TO-VERIFY).

## How it was checked

WebFetch of Apple's live App Review Guidelines page on 2026-11-12 (first 100,000 characters, which contain section 3.1). The last 14,000 characters were not read.

## Used by

- [[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]]
