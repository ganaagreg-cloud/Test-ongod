---
id: ADR-0037
title: A new sign-up replaces an unverified account with the same email
status: accepted
date: 2026-10-18
tags: [adr, auth, area/api]
---

## Context

SPEC A creates the user at register and verifies the email afterwards. Someone who failed the code step could not register again: `EMAIL_TAKEN`. Found on the phone in Expo Go on 2026-10-18. Ganaa chose option A.

## Decision

1. `POST /v1/auth/register`: if the email (or an email-shaped username) belongs to an account that is **unverified**, role USER, with **no subscription**, that account is deleted and the new one is created, in one transaction. The delete has the precondition (`emailVerifiedAt` null, role USER, no subscriptions); if it does not match, `EMAIL_TAKEN`.
2. Verified accounts, admins/owners and accounts with a subscription are never replaced: `EMAIL_TAKEN` as before.
3. A clash on the username alone (a different account) stays `USERNAME_TAKEN`.
4. Login of unverified users is unchanged (SPEC A): they can log in, but cannot apply for a subscription.

## Alternatives rejected

- **Block login until verified:** changes SPEC A and needs a pending-record table.
- **Keep EMAIL_TAKEN:** a typo or a missed code locks the email.

## Consequences

- Sessions, devices and codes of the replaced account are removed (cascade), so the old password and old codes stop working.
- Risk accepted: someone who knows an email can replace that person's unverified sign-up. Nothing of value exists on an unverified account (no access, no payments), and the rate limit on register still applies.
- Tests: `apps/api/test/auth.test.ts` (replace, and never replace verified / admin).
