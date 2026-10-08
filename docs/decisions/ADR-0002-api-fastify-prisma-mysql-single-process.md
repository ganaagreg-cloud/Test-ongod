---
id: ADR-0002
title: API = Node 20 + Fastify + Prisma + MySQL 8, one process serves everything
status: accepted
date: 2026-10-08
tags: [adr, area/backend, area/hosting]
---

## Context

Shared Node.js hosting runs a single app process ([[ADR-0003-hosting-itools-node|ADR-0003]]). The API, member portal and admin must all be reachable.

## Decision

Node 20 + TypeScript, Fastify, Prisma, MySQL 8. One Node process serves the API at `/v1`, the portal build at `/` and the admin build at `/admin` (SPA fallbacks). Database code stays portable: no raw SQL except the job-claim query, no engine-specific types.

## Alternatives rejected

- **Separate processes or hosts per app:** not possible within shared hosting limits.

## Consequences

- Static hosting lives in `apps/api/src/static.ts` (`SERVE_STATIC=true`).
- If iTools only offers PostgreSQL, the portable Prisma code should migrate with a provider change ([[R-hosting-limits]]).

## Evidence

- [[R-hosting-limits]] (TO-VERIFY): engine, process and upload limits on the host.
