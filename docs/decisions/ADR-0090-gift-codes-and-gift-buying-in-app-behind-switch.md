---
id: ADR-0090
title: 'Gift codes and gift buying in the mobile apps, only while the server switch inAppPayment is on'
status: accepted
date: '2026-11-12'
tags: [adr, area/mobile, area/backend, area/payments, store/apple]
---

## Context

Gift access exists on the portal only ([[ADR-0060-gift-access|ADR-0060]] items 2, 4, 9; [[SPEC]] J: "the apps show nothing about gifts"). Ganaa asked on 2026-11-12 for three things in the apps: a place to enter a gift (promo) code, asked "when starting"; buying a gift for someone else; and the admin making codes ([[ADR-0091-admin-issued-gift-codes|ADR-0091]]). Members are not expected to use the portal ([[ADR-0076-in-app-payment-with-bank-deeplinks|ADR-0076]]).

Store rule, read on 2026-11-12 ([[R-apple-unlock-codes-3-1-1]], VERIFIED): Apple 3.1.1 says apps "may not use their own mechanisms to unlock content or functionality, such as license keys", and gift cards or vouchers for digital goods "can only be sold in your app using in-app purchase". So a code field and a gift shop in the iOS app carry the same rejection risk as the "Эрх авах" button of ADR-0076. Google Play is TO-VERIFY ([[R-google-play-payments]]). Ganaa chose on 2026-11-12: build both behind the switch.

The switch `inAppPayment` of ADR-0076 was decided but not built.

## Decision

1. **The switch is built.** API env `IN_APP_PAYMENT` (default `false`) is published as `inAppPayment` in `GET /v1/app-config`. The schema default is `false`, so an older server or a failed config call means off. Off is the store-review setting.
2. **While it is off the apps are unchanged:** no code field, no gift screens, no prices, no plan names. Only the activate text of [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]].
3. **While it is on the apps show:**
   - Профайл rows "Бэлгийн код оруулах" and "Эрх бэлэглэх";
   - on the no-access sheet "Эрх авах" (the existing pay screen of [[ADR-0083-mobile-qpay-deeplink-test-builds-only|ADR-0083]]) and "Бэлгийн код оруулах";
   - once, right after a new sign-up (email code confirmed, or the social profile step finished), an optional step "Бэлгийн код байгаа юу?" with "Алгасах" before Нүүр. A mark in the secure store is set when the account is confirmed and used up at the next start of the signed-in area, whether or not the switch is on.
4. **Redeeming** calls the existing `POST /v1/gifts/redeem` (verified email, one transaction, status precondition, 10 tries per 15 minutes, the same answer for every bad code). No server change.
5. **Buying a gift** uses the existing `POST /v1/gifts` and `GET /v1/gifts`: the member picks a plan (name, days, price from `GET /v1/plans`), "Бэлэг авах" opens the hosted QPay checkout in the phone's browser, and the screen reads the gift list again every 5 s (for at most 10 minutes) until the gift is PAID; then the code shows with a share button (the system share sheet). The app never decides access or issues a code.
6. **Where the code lives.** All texts, calls and screens are in `apps/mobile/src/inpay/` and `app/(app)/gift/`; `src/api/endpoints.ts` stays free of payment calls. `test/no-payment-text.test.ts` allows payment words only there and checks that every route redirects away and every entry outside sits inside a `paymentsOn ? (...)` branch.
7. The test-build flag `EXPO_PUBLIC_MOBILE_PAYMENTS` (ADR-0083) stays and turns the same screens on in preview builds.

This supersedes, for the apps only and only while the switch is on: ADR-0060 item 9 ("Apps: unchanged"), the words "portal only" in ADR-0060 items 2 and 4, and the ASSUMPTION "no redeeming during sign-up" (the step comes right after sign-up, not inside it). The portal flows are unchanged.

## Alternatives rejected

- Always visible, no switch: the reviewer would see a code field and prices; highest rejection risk.
- Portal only: Ganaa decided members will not use the portal.
- The code field inside the register form: an unverified account cannot redeem ([[SPEC]] A), so the field would fail for everyone; a step after the email code does the same job.
- A switch stored in the database with an admin toggle: an admin could turn it on during store review by accident; an env value is changed by the developer only.
- An in-app browser for the checkout: bank apps are opened by link from the phone's browser today (ADR-0083 test flow); not changed without a device test.

## Consequences

- Turning the switch on is one env change and a restart; no app update. **It must stay off while a build is in store review.** The owner carries the store risk as in ADR-0076.
- The API does not refuse payment calls from the apps while the switch is off (the same endpoints serve the portal). Only the screens are gated. The server gate of ADR-0083 item 5 (`MOBILE_PAYMENTS_ENABLED`) was never built; see [[AUDIT-2026-11-12]].
- An open gift screen makes the API ask Wire every 5 s per waiting gift, for at most 10 minutes.
- **SPEC and DESIGN edits wait for Ganaa's approval** (not written): SPEC "Surfaces" (mobile: gift code and gift buying while the switch is on), SPEC J ("portal only" and "the apps show nothing about gifts"), DESIGN "App screens" (the two rows, the step after sign-up, the gift screens) and DESIGN "Do not" (prices in the apps).
- Not run on a phone: the checkout hand-off to a bank app and the return to the app are TO-VERIFY ([[open-questions]] #33).

## Evidence

- [[R-apple-unlock-codes-3-1-1]] (VERIFIED 2026-11-12), [[R-apple-no-payment-ui]] (VERIFIED), [[R-google-play-payments]] (TO-VERIFY).
- Tests: mobile 251/251 (`no-payment-text` covers the gating), API `app.test.ts` (the switch), `gifts.test.ts`.
