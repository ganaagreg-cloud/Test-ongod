---
id: ADR-0057
title: The global request limit counts API requests only, not the portal and admin files
status: accepted
date: '2026-10-28'
tags: [adr, area/backend]
---

## Context

One process serves the API, the portal and the admin ([[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]]). The global limit (`RATE_LIMIT_MAX`, default 300 per minute per IP) counted every request, including the JS, CSS and HTML files of the portal and admin. In a failing admin e2e run, 92 of the 316 requests in one minute were such files. Once over the limit, the next page load could not renew the session (`/auth/refresh` got 429) and the admin showed the login screen. A busy admin, or many people behind one address loading the portal, hit the same wall. Found 2026-10-28 ([[2026-10-28]]).

## Decision

1. The global limit applies to `/v1` and `/health` only (`isApiPath`), through the plugin's `allowList`.
2. The default (300 per minute per IP) and the auth limits ([[ADR-0045-audit-hardening-limits-refresh-jobs-payments|ADR-0045]], [[ADR-0054-refresh-limit-per-device|ADR-0054]]) are unchanged.

## Alternatives rejected

- Raise `RATE_LIMIT_MAX`: still spent on files, and a higher cap weakens the limit on the API, which is the part that costs database work.
- Serve the files from the host's web server: not possible on the shared host with one Node process.

## Consequences

- Static files have no request limit in the app. They are read from disk with long cache headers for hashed assets; the host's own protection is the layer for floods. ASSUMPTION: the host offers basic flood protection (TO-VERIFY with [[R-hosting-limits]]).
- A test checks that files do not count and the API still gets 429 at the limit.
