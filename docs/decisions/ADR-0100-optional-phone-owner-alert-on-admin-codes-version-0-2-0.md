---
id: ADR-0100
title: 'Phone number optional; owners are emailed when an admin makes a gift code; app version 0.2.0'
status: accepted
date: '2026-11-12'
tags: [adr, area/backend, area/mobile, area/portal, area/admin]
---

## Context

Items from [[AUDIT-2026-11-12]] that Ganaa asked to do on 2026-11-12, plus a rule she set: an admin creates gift codes with no password step.

## Decision

1. **The phone number is optional** ([[SPEC]] A said "phone (not verified)"; nothing in the apps uses it, only the admin lists). `phoneSchema` accepts an empty string; register and the social profile step default it to `''`; a number that is given must still look like one. The app and portal label it "(заавал биш)". The admin shows "—" when empty. No database change: the column already held `''` for Google and Apple sign-ups.
2. **Every OWNER gets an email when an admin makes a free gift code** (template `giftIssued`: who, for whom, plan, days, valid until; never the code). It is queued in the same transaction as the code, so a retried request does not send a second one. It only informs: the admin does **not** need a password or any approval to create a code (Ganaa, 2026-11-12), and an ADMIN's request is the same as before. No OWNER, no email.
3. **App version 0.2.0** in `app.config.ts`. `runtimeVersion` follows it, so over-the-air updates for 0.2.0 reach only builds that contain the recording guard and the in-app browser (ADR-0093, ADR-0094).

## Not done here

- **Protecting `main`** (merge only when CI is green) is a GitHub repository setting; it cannot be set from the code or with the tools of this session. Steps for the owner are in [[AUDIT-2026-11-12]] reply of 2026-11-12: Settings, Branches, add a rule for `main`, require a pull request and the status checks "Typecheck, lint, format, build, unit tests" and "API tests (MySQL 8.4)".

## Alternatives rejected

- Ask for the admin's password when making a code: Ganaa's decision is that admins create codes freely; the email is the control.
- Put the code in the owner's email: an email is a weaker place for a working access code than the Бэлэг page.
- Drop the phone column: old accounts and the admin search use it.

## Consequences

- New accounts usually have no phone; support cannot call them (it is not used for that).
- The owner's mailbox gets one email per code; a giveaway of many codes means many emails.

## Evidence

- Tests: `auth.test.ts` (register without a phone), `gifts.test.ts` (one email to the owner per code, none on retry, no code in it), `validation.test.ts`.
