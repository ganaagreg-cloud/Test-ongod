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
- Reviewer demo account. The dev seed never runs in production ([[ADR-0035-audit-2026-10-09-fixes|ADR-0035]]). Steps:
  1. Register the account normally (portal or app) with a mailbox the owner controls; verify the email code.
  2. Admin → Users → the account → grant access (for example 365 days). A grant sends no email or push.
  3. The password goes only into the store console's review notes, never into git or docs.
  4. Write in the review notes that an account can be signed in on 2 devices at most, and how to free a slot (sign out on one device).
  5. Check it: sign in on a clean phone, play an episode, and check the account has no payment screen.
- The apps link only to the `/app/terms`, `/app/privacy` and `/app/support` pages of the portal (no navigation, no payment wording). Put the same addresses into the store listings, or `/terms`, `/privacy` and `/support` for the web.
- Android: the three unused permissions `SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE` and `WRITE_EXTERNAL_STORAGE` are blocked in `app.config.ts`. `FOREGROUND_SERVICE_MEDIA_PLAYBACK` may need a foreground-service declaration in Play Console (ASSUMPTION, write a research note before submission).
- Privacy policy and terms URLs on the final domain ([[open-questions]] #9).

## Apple

- If Google login is on, Sign in with Apple is on too ([[R-apple-login-services-4-8]]).
- Build route: Mac or EAS ([[open-questions]] #12, [[R-eas-free-tier]]).

## Google Play

- New personal account: closed test with 12 testers for 14 days first ([[R-google-play-closed-test]]). Start early.
