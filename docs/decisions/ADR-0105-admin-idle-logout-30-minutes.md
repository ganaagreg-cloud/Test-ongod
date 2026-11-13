---
id: ADR-0105
title: 'Admin signs out after 30 minutes without activity'
status: accepted
date: '2026-11-14'
tags: [adr, area/admin, area/auth]
---

## Context

The admin stays signed in as long as its refresh cookie lives ([[ADR-0040-admin-password-only-no-totp|ADR-0040]]: password only). An unattended open admin tab is a risk. The owner asked for a forced logout after 30 minutes idle.

## Decision

1. The admin app (`apps/admin`, `AuthProvider`) signs the admin out after 30 minutes with no click, key press, scroll or touch. The sign-out is the normal one: `POST /v1/auth/logout` (revokes the session), then the login page.
2. Client side only, per tab. The API is unchanged.

## Alternatives rejected

- Server-side idle limit (track last activity per admin session): stronger, but needs a schema change and a check on every request. Not needed for the stated risk.

## Consequences

- A tab closed without signing out keeps its refresh cookie until it expires; the idle rule does not apply to it.
- A long upload with no interaction for 30 minutes also signs the admin out and can interrupt it.
- The portal and mobile apps are not affected.
