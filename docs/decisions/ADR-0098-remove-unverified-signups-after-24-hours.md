---
id: ADR-0098
title: 'Sign-ups that do not confirm their email within 24 hours are removed'
status: accepted
date: '2026-11-12'
tags: [adr, area/backend, area/privacy]
---

## Context

A sign-up creates the `User` row before the email code is entered. Since [[ADR-0097-email-must-be-verified-to-log-in|ADR-0097]] such a row cannot log in, and a new sign-up with the same email replaces it ([[ADR-0037-unverified-signup-can-be-replaced|ADR-0037]]), so nobody ever sees "already registered" for an unconfirmed email. But a person who never comes back left a name, phone and email in the database for good. Ganaa, 2026-11-12: asked whether the account should only be created after the code; chose the cleanup, after 24 hours.

## Decision

A cron task `purgeUnverifiedSignups` (runs with every tick) deletes `User` rows that are all of: email not confirmed, role USER, status ACTIVE, a password sign-up with no Google/Apple identity, created more than 24 hours ago, and with nothing attached (no session ever, no subscription, no gift bought or redeemed, no comment, no audit row). Their email codes go with them.

A confirmed account is never touched, by this task or by a new sign-up (`EMAIL_TAKEN`).

## Alternatives rejected

- Create the account only after the code (a pending-sign-up table): the same result for the member, but sign-up, the code storage and their tests would be rebuilt.
- Keep the rows: personal data of people who are not members, kept without a reason.
- A longer window (48 hours, 7 days): Ganaa chose 24 hours; the person can sign up again in a minute.

## Consequences

- A code is valid for 10 minutes and a new one can be asked for 24 hours; after that the person signs up again.
- Unconfirmed accounts that were used before ADR-0097 (they have a session row) are left alone.
- The privacy policy can say that unfinished sign-ups are deleted after 24 hours (the owner's text).

## Evidence

- Test: `apps/api/test/cron.test.ts` "removes sign-ups that did not confirm their email within 24 hours, and nothing else". API suite 683/683.
