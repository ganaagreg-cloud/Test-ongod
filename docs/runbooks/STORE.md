---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, area/mobile, store/apple, store/google]
---

# Store submission

Draft checklist. Account ownership is still open ([[open-questions]] #1).

## Both stores

- No price, plan, bank details or payment links anywhere in the app ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]], [[R-apple-no-payment-ui]], [[R-google-play-payments]]).
- In-app account deletion, plus the portal deletion page ([[R-account-deletion-stores]]).
- Reviewer demo account with access granted manually (seed user `demo`, MANUAL_GRANT). Its password lives only in the store console.
- Privacy policy and terms URLs on the final domain ([[open-questions]] #9).

## Apple

- If Google login is on, Sign in with Apple is on too ([[R-apple-login-services-4-8]]).
- Build route: Mac or EAS ([[open-questions]] #12, [[R-eas-free-tier]]).

## Google Play

- New personal account: closed test with 12 testers for 14 days first ([[R-google-play-closed-test]]). Start early.
