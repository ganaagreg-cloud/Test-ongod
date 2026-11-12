---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, area/mobile, store/apple, store/google]
---

# Store submission

Draft checklist. Account ownership is still open ([[open-questions]] #1).

## Payment phases (no code is commented out)

Payments are switched by configuration, never by removing or commenting out code ([[ADR-0072-payments-off-until-launch|ADR-0072]]). The mobile apps contain no payment screen at all, so a store reviewer who reads the app sees nothing to remove.

1. **Test phase (payments on, not production):** run the API in development mode (`NODE_ENV=development`, locally or on a separate test server) with the mock checkout, or with a Wire `sk_test` key and operator `sandbox`. Production never grants access for a test payment ([[ADR-0047-wire-payment-sync-window|ADR-0047]], the `livemode` check), so end-to-end payment testing cannot happen on the production server.
2. **Store review (production, payments off):** production has no `WIRE_API_KEY`, and `ALLOW_MOCK_PAYMENTS` is unset (the API refuses to start with it). The portal shows plans with "Удахгүй нээгдэнэ" and no buy buttons; the reviewer's `demo` account gets access by a manual grant. Describe this in the review notes: purchases happen on the website and are not open yet, so the app and the website behave the same for reviewer and customer.
3. **Go live:** add the live Wire keys to the production env file and restart; add the webhook in the Wire dashboard; make one small real payment and check the exact amount ([[DEPLOY]], [[LAUNCH_CHECKLIST]]). No app update is needed, because the apps do not change.

### The in-app switch (added 2026-11-12)

`IN_APP_PAYMENT` in the API env file is the switch of [[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]] and [[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]]. `false` (the default): the apps show no price, plan, gift code field or payment button. `true`: "Эрх авах", "Бэлгийн код оруулах" and "Эрх бэлэглэх" appear in the apps without an app update.

- **Keep it `false` from the moment a build is sent to review until the review has passed**, and check `GET /v1/app-config` answers `"inAppPayment": false` before submitting. The reviewer's account must see no code field and no price ([[R-apple-unlock-codes-3-1-1]], [[R-apple-no-payment-ui]]).
- Turning it on later is the owner's decision and risk (ADR-0076): a store can still remove the app.

## Both stores

- Name and ids ([[ADR-0080-app-name-zuvuutavuu|ADR-0080]]): store title and icon label "Зөв үү Тав уу" without question marks ([[ADR-0081-store-name-without-question-marks-domain|ADR-0081]]); app id `mn.zuvuutavuu.app` on both stores; link scheme `zuvuutavuu`. Create the EAS project, Firebase and Google/Apple sign-in entries with this id, not `mn.ongod.app`.

- No price, plan, bank details or payment links anywhere in the app (payment is QPay in the portal only, [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]], [[ADR-0046-remove-bank-transfer-path|ADR-0046]], [[R-apple-no-payment-ui]], [[R-google-play-payments]]).
- In-app account deletion, plus the portal deletion page ([[R-account-deletion-stores]]).
- Reviewer demo account with access granted manually (seed user `demo`, MANUAL_GRANT). Its password lives only in the store console.
- Privacy policy and terms URLs on the final domain ([[open-questions]] #9).

## Apple

- If Google login is on, Sign in with Apple is on too ([[R-apple-login-services-4-8]]).
- Build route: Mac or EAS ([[open-questions]] #12, [[R-eas-free-tier]]).

## Google Play

- New personal account: closed test with 12 testers for 14 days first ([[R-google-play-closed-test]]). Start early.
