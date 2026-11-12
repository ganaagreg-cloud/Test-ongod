---
id: ADR-0092
title: 'Mobile sign-up in three steps, no username field, signed in right after the email code'
status: accepted
date: '2026-11-12'
tags: [adr, area/mobile, area/portal]
---

## Context

The app's register screen was one long page with six fields, among them an optional username nobody needs ([[SPEC]] A: "username optional; default = email"). After the email code the new member was sent to the login screen to type the same password again. Ganaa, 2026-11-12: the registration "is only one page so it feels cheap" and asks for a username that is not needed.

## Decision

1. **App:** register is three steps on one screen: name (last name, first name), contact (email, phone), password (password, repeat). A step line "Алхам n/3" with dots, a back arrow that goes one step back (also Android's back button), "Үргэлжлүүлэх" then "Бүртгүүлэх". Each step checks only its own fields. A taken email returns to the contact step with the text under the field. Google/Apple buttons and "Бүртгэлтэй юу?" stay on step 1.
2. **No username is asked** in the app's register screen, the app's social "complete profile" step (it sends the email as the username, as it was prefilled before) or the portal's register page. The API is unchanged: an empty username becomes the email (SPEC A), login accepts username or email (SPEC B), old usernames keep working.
3. Where a username equal to the email was shown as "@name" (Профайл in the app, Миний бүртгэл on the portal) the email is shown instead.
4. **After the right email code the app signs the new member in** with the email and password of the sign-up that just happened on this phone. They are held in memory only (never stored), taken once, and gone after a restart; then, or if the login fails, the old path (login screen with the email filled in) is used.

## Alternatives rejected

- Three separate routes: the back gesture and the kept values need shared state; one screen with a step number is simpler and tested.
- Remove the repeat-password field: with no username and no second look at the password, a typo would lock the member out until a reset.
- Make the API return a session from `verify-email`: a new way to get tokens; the normal login call does the same job with the existing device rules.
- Drop the username from the data model: logins, the admin search and old accounts use it.

## Consequences

- SPEC A still holds (the username is optional). DESIGN "Auth" should say "Register (3 steps)"; the edit waits for Ganaa's approval.
- New accounts have username = email; the admin lists show the email twice for them.
- E2E specs updated (`apps/mobile/e2e/auth.spec.ts`, `apps/portal/e2e/payment-flow.spec.ts`); **not run in this session** (they need Metro, the API and Mailpit).

## Evidence

- Mobile unit tests 251/251, `tsc --noEmit` clean. Not run on a device.
