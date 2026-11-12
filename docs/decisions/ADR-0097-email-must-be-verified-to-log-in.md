---
id: ADR-0097
title: 'No login before the email is confirmed'
status: accepted
date: '2026-11-12'
tags: [adr, area/backend, area/mobile, area/portal]
---

## Context

[[SPEC]] A said "Unverified users can log in but cannot apply for a subscription". A new member who left the code screen could log in later and use the app with an email nobody had confirmed. Ganaa, 2026-11-12: "only verified emails can sign up; if it is not verified it cannot go next".

## Decision

1. `POST /v1/auth/login` answers **403 `EMAIL_NOT_VERIFIED`** for an account whose email is not confirmed, with `details.email`. It is said only after the right password (a wrong password is still `INVALID_CREDENTIALS`), and no session is created.
2. The app and the portal login screens then ask for a new code (`resend-code`; if the 60 s wait refuses it, the earlier code still works) and go to the email-code step. In the app the right code signs the member in ([[ADR-0092-register-in-steps-without-username|ADR-0092]]).
3. Unchanged: Google and Apple sign-ups (their email is already confirmed, SPEC C); a new sign-up replacing an unconfirmed account ([[ADR-0037-unverified-signup-can-be-replaced|ADR-0037]]); the `EMAIL_NOT_VERIFIED` checks on paying, gifts and redeeming stay as a second guard.
4. SPEC A's sentence is replaced (Ganaa's decision).

## Alternatives rejected

- Only the app sends unverified members to the code screen: the API would still hand out sessions.
- Create no account until the code is right: a bigger change to sign-up and to ADR-0037 for the same result.

## Consequences

- Sessions that unconfirmed accounts already hold keep working until they end; a refresh is not refused. On the VPS there were three users on 2026-11-11.
- Changing the email of a confirmed account (SPEC H) is not affected.
- A member whose email never arrives cannot get in: `SUPPORT_EMAIL` and working mail delivery matter more now.

## Evidence

- Tests: `auth.test.ts` "refuses an unverified user after the right password" (403 with the email, no session, wrong password 401, works after the code). API suite passes.
