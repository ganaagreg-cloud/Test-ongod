---
id: ADR-0024
title: 'Local preview: one-command dev, dev-only API docs, mobile in the browser'
status: accepted
date: 2026-10-08
tags: [adr, area/tooling, area/backend, area/mobile]
---

## Context

The owner and the developer need to see everything running in a browser: API endpoints, the three front ends, the emails and the tables. None of that may reach production ([[ADR-0003-hosting-itools-node|ADR-0003]]: one process, shared hosting, no dev packages).

## Decision

1. **`pnpm dev`** (`scripts/dev.mjs`) starts docker compose (MySQL + Mailpit), applies migrations, seeds the demo data **only when the database has no users** (so changes made while exploring are kept), starts API, portal and admin with prefixed output, waits until all answer, then prints every URL. Vite ports are `strictPort`, so the printed URLs are always true. Containers keep running on Ctrl+C; `pnpm dev:down` stops them.
2. **API docs at `/docs`** use `@fastify/swagger` and `@fastify/swagger-ui` (devDependencies). The routes validate with zod inside their handlers, so docs are fed from a map of route to shared zod schema (`apps/api/src/dev/doc-schemas.ts`, converted with `z.toJSONSchema`), not from Fastify route schemas; the API's behaviour is unchanged. A test fails when a route has no entry and when an entry has no route. Bearer auth is set once with **Authorize**.
3. **Dev only, by construction.** `server.ts` imports `dev/docs` only when `process.env.NODE_ENV === 'development'`, and `tsup.config.ts` defines that expression as `"production"` at build time, so the bundler removes the import. The built `dist/server.js` contains no swagger code (checked by searching it). `buildApp` takes an optional `registerDocs`, which only the dev entry passes; a normal app has no `/docs` (tested). `scripts/dev.mjs`, `dev-setup.ts` and `dev-totp.ts` refuse to run with `NODE_ENV=production`.
4. **Admin 2FA in the docs without a phone:** `pnpm dev:totp` prints the current code of a local user from the local database. It is a script, not an endpoint, so the API has no bypass.
5. **Mobile in the browser (Expo web, visual preview only).** `react-native-web`, `react-dom`, `@expo/metro-runtime` (installed with `expo install`). Native-only modules are swapped by file extension: `storage/secureStore.ts` (expo-secure-store) vs `secureStore.web.ts` (in memory, never `localStorage`), and `audio/engine.ts` (react-native-track-player) vs `engine.web.ts` (a stub). Screens show `<AudioWebNotice />` ("Аудио зөвхөн утсан дээр тоглоно", in the mobile `mn.ts`) where a player would be. `/dev/ui` (type scale, colors, platform guards) loads through `__DEV__`, so Metro leaves it out of release builds.

## Alternatives rejected

- **Fastify route `schema` + a zod type provider:** would also switch Fastify's own validation on and change error shapes ([[SPEC#Surfaces]] and CLAUDE.md require one error shape); a doc-only map keeps behaviour identical.
- **Swagger always on, protected by a password:** a public docs page in production is an attack map; removing it from the bundle is stronger than hiding it.
- **A dev endpoint that returns TOTP codes:** a bypass that could ship by mistake.
- **`localStorage` as the web fallback for tokens:** web storage is readable by any script; memory is enough for a preview.
- **Seeding on every `pnpm dev`:** the seed overwrites seeded users and would undo exploration.

## Consequences

- A new route needs an entry in `doc-schemas.ts` (the test says so), or `/docs` is incomplete and the test fails.
- Mobile web is not a supported target: no audio, no push, no native screens. It is for looking at layouts.
- Building the API on the host still needs devDependencies installed (build tools), but nothing dev-only runs or is shipped.

## Evidence

- `apps/api/test/docs.test.ts`; production bundle searched for "swagger" with no hits; live run of `pnpm dev`, `/docs`, the admin 2FA flow, Prisma Studio and mobile web `/dev/ui` on 2026-10-08.
- No external facts needing a research note.
