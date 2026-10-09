---
id: ADR-0026
title: 'Web portal: refresh token in an httpOnly cookie, access token in memory; build and delivery rules'
status: accepted
date: 2026-10-08
tags: [adr, area/auth, area/web, area/backend]
---

## Context

[[SPEC#Surfaces]] and [[ADR-0008-auth-primitives-two-devices|ADR-0008]] fix the auth primitives: JWT access tokens (15 min) and opaque, rotating refresh tokens stored as SHA-256 hashes with reuse detection. The API returned the refresh token in the JSON body, which suits the native apps (secure storage) but would leave it readable by any script on a web page. The portal ([[DESIGN#Portal screens]]) is a web app that handles a payment flow.

## Decision

1. **Web = cookie, native = body.** A login with `platform: "web"` puts the refresh token in the cookie `ongod_rt` and **not** in the response body (`refreshToken` is optional in `tokenPairSchema`). `POST /v1/auth/refresh` and `/auth/logout` take the token from the body when it is there (native, unchanged) and from the cookie when it is not (web). Rotation, reuse detection and the token family work exactly as before ([[ADR-0018-auth-implementation-details|ADR-0018]]).
2. **The cookie:** `HttpOnly`, `SameSite=Strict`, `Path=/v1/auth`, `Max-Age` = `REFRESH_TOKEN_TTL_DAYS`, `Secure` whenever `PUBLIC_BASE_URL` is https. The portal and the API share one origin (one process in production, a Vite proxy in development), so Strict does not get in the way. On a dead or reused token the API clears the cookie.
3. **Origin check (defence in depth):** a request that relies on the cookie and names an `Origin` outside `PUBLIC_BASE_URL` and `CORS_ORIGINS` gets `403` and does not use up the token. It sits on top of SameSite=Strict and JSON-only bodies.
4. **The access token lives only in JavaScript memory.** The portal keeps two things in `localStorage`: a random device id and a flag that a session may exist (so anonymous visitors do not call `/auth/refresh`). A page load restores the session through the cookie (`/auth/refresh`, then `/me`). One refresh at a time is in flight; a 401 triggers one refresh and one retry.
5. **Web browsers count as devices** (max 2, [[SPEC#Workflows]] B). The portal handles `DEVICE_LIMIT` by listing the devices and offering "remove and log in". Whether browser logins should count at all is [[open-questions]] #15.
6. **`GET /v1/plans` is public** (the landing page shows the price). Everything else under `/v1/subscriptions` stays behind login. Prices still never appear in `/v1/app-config` or any mobile route ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]). Bank details come with the subscription (`POST /v1/subscriptions`, `GET /v1/subscriptions/current`) and only while payment is due.
7. **Portal delivery.** `pnpm build` writes a brotli and a gzip copy of every text file; the API serves them (`@fastify/static` `preCompressed`), so compression costs no CPU per request. The Vite config refuses to run a build in development mode, and reads only `VITE_PUBLIC_URL` from the root `.env` (reading the whole file also loaded its `NODE_ENV=development`, which silently turned a production build into a development build with the component gallery inside). The dev-only gallery sits behind `import.meta.env.DEV`; a test checks the built files of portal and admin.
8. **SEO.** Static meta in `index.html` (title, description, canonical, Open Graph, Twitter, theme color from the tokens, `og.png` drawn from the tokens by `pnpm --filter @ongod/portal assets`), per-page title, description and robots from `usePage`, `robots.txt` and `sitemap.xml` generated at build with `VITE_PUBLIC_URL`. Pages behind the login are `noindex`.
9. **Text.** All portal text is in `apps/portal/src/i18n/mn.ts`. Legal pages and some landing copy are placeholders marked `TODO(owner)`; the privacy, terms and "Бүртгэл устгах" pages are public.

## Alternatives rejected

- **Refresh token in `localStorage` or `sessionStorage`:** readable by any injected script.
- **Both tokens in cookies:** needs CSRF tokens on every API call; the in-memory access token needs none.
- **SameSite=Lax:** the portal never needs a cross-site navigation to carry the session; Strict is stricter at no cost.
- **A separate web-only auth endpoint:** duplicates the rotation and reuse logic that exists and is tested.
- **Compressing responses on every request (`@fastify/compress`):** CPU on shared hosting for files that never change between releases.
- **Server-side rendering or static prerendering of the landing page:** not needed to reach the Lighthouse targets; revisit if search traffic matters.

## Consequences

- Native and web share one rotation logic; only the transport differs.
- The portal build needs `VITE_PUBLIC_URL` (the real https address) for correct og:url, canonical and sitemap; a wrong value breaks link previews.
- A browser that blocks `localStorage` still works, but forgets the device id on reload and uses a device slot each time (the user can remove one at login).
- The logged-in pages cannot be audited from a cold start (no stored access token); Lighthouse covers the seven public pages.
- Existing refresh tokens issued to `platform: "web"` before this change (none in production) would have been in the body.

## Evidence

- `apps/api/test/web-session.test.ts` (11 tests: cookie flags, no token in the body, rotation, reuse, foreign Origin, logout, native unchanged, 3rd device); the cookie tests fail when the Origin check or `httpOnly` is removed (checked).
- `apps/portal/e2e/payment-flow.spec.ts` (real API and mail: no token in web storage, session survives a reload, logout clears the cookie).
- `docs/reports/lighthouse-portal.md`.
- No external facts needing a research note; Lighthouse version recorded in the report.
