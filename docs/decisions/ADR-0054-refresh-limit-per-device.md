---
id: ADR-0054
title: Token refresh is rate-limited per device only, with its own cap
status: accepted
date: '2026-10-27'
tags: [adr, area/auth, area/backend]
---

## Context

`POST /v1/auth/refresh` used the same limiter as login: 30 per 15 min per IP, 10 per device and IP, 100 per device ([[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]] item 1). Every page load of the portal or admin and every 15-minute access-token renewal is a refresh. Everyone behind one address (an office Wi-Fi, a mobile carrier NAT: ASSUMPTION, TO-VERIFY how common in Mongolia) shared the 30, and the owner hit the 10 by reloading the admin. Found in [[AUDIT-2026-10-27]] item 3. The refresh token is 256-bit random, so there is nothing to guess.

## Decision

1. Refresh is counted per `deviceId` only, `AUTH_REFRESH_DEVICE_MAX` per window (default 60 per 900 s). No IP bucket.
2. Login, registration and the code endpoints keep the ADR-0045 limits unchanged.
3. Floods (random device ids) stay capped by the global per-IP limit (`RATE_LIMIT_MAX`, 300 per minute) and cost one hash lookup each.

This replaces ADR-0045 item 1 for refresh only; the rest of ADR-0045 stands.

## Alternatives rejected

- Raise the IP bucket for refresh: still shared, still a guess at office sizes.
- Remove the refresh limit altogether: one broken client could loop forever on one device.
- Count per refresh-token family: the family is only known after the database lookup the limit is meant to save.

## Consequences

- A new env value `AUTH_REFRESH_DEVICE_MAX` in `.env.example`, [[SECRETS]], [[DEPLOY]].
- Tests: many refreshes from one IP pass; one device over the cap gets 429 while another device still refreshes.
- The global 300 per minute per IP still applies to all routes; a very large NAT could reach it. Not changed here.

## Evidence

- `apps/api/src/auth/rate-limit.ts` (`checkRefresh`), `apps/api/src/routes/auth.ts`.
- [[ADR-0008-auth-primitives-two-devices|ADR-0008]]: opaque random refresh tokens.
