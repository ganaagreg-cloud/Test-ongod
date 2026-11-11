---
id: ADR-0089
title: Content Security Policy allows the Bunny hosts and blob previews
status: accepted
date: '2026-11-11'
tags: [adr, area/backend, area/security]
---

## Context

`app.register(helmet)` used helmet's default policy, `img-src 'self' data:` (no `media-src`, so media fell back to `default-src 'self'`). On the live admin the browser blocked every Bunny cover image (`https://<pull zone>/covers/...`) and the `blob:` previews in the new-episode form.

## Decision

- `apps/api/src/csp.ts` builds the policy: helmet defaults plus `img-src 'self' data: blob:` and `media-src 'self' blob:`, each with `https://` + `BUNNY_PULL_ZONE_HOST` and `BUNNY_STREAM_CDN_HOSTNAME` when set. Hosts come from env only (CLAUDE.md: the Bunny account is swapped by env).
- No wildcards. Scripts, styles, frames and forms stay as helmet's defaults. `connect-src` is unchanged (`'self'`).

## Alternatives rejected

- Disable the policy: loses the protection for the admin and portal.
- Allow `https:` for all images: wider than needed.

## Consequences

- Takes effect only after the API is deployed. The mobile app is unaffected (native, no CSP).
- If the admin later needs to fetch from Bunny with JavaScript (an HLS player), `connect-src` needs the hosts too.
- Unit test `apps/api/test/csp.test.ts` (not run locally: vitest needs MySQL); the header was checked with `tsx` and `inject`.
