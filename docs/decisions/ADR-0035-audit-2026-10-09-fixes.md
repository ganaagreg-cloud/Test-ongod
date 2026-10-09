---
id: ADR-0035
title: 'Audit fixes: app-only legal pages, rate-limit keys, push registration and new-episode push, production bootstrap'
status: accepted
date: 2026-10-09
tags: [adr, area/backend, area/web, area/mobile, area/ops]
---

## Context

The hard audit of 2026-10-09 ([[AUDIT-2026-10-09]]) found several gaps that need a decision, not only a code change. This ADR records those decisions. It changes none of [[SPEC]] or [[DESIGN]], and no accepted ADR.

## Decision

1. **App-only legal pages (D-01).** The portal serves `/app/terms`, `/app/privacy` and `/app/support` in a bare layout: a brand mark, the page, no navigation, no link to plans or the account ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]). The terms there leave out the payment section. The apps link only to `/app/*`. The normal `/terms`, `/privacy` and a new public `/support` stay in the full layout for the web and the store listings. The `/app/*` pages are `noindex` and not in the sitemap.
2. **Rate limits (C-01, C-02).**
   - Refresh is limited per device only. The refresh token is unguessable, and many phones share one carrier IP.
   - The global per-IP limit counts only `/v1` calls; static files and `/health` are exempt.
   - `AUTH_RATE_LIMIT_IP_MAX` defaults to 100 (was 30). Login and code routes keep their per-identifier limits.
   - `TRUST_PROXY=true` now means `trustProxy: 1` (one hop), not "trust every hop", so a client cannot choose its own IP with `X-Forwarded-For`. If the host has more than one proxy in front, this number must be raised ([[open-questions]] #5).
3. **Production env checks (C-08, F-08).** In production the API refuses the `.env.example` placeholder secrets and relative `RECEIPTS_DIR` / `UPLOADS_DIR`.
4. **Push registration (B-01).** `PUT /v1/me/devices/current/push-token` stores an Expo push token (or `null`) on the calling session's device. A token belongs to one device: setting it clears the same token on any other device row.
5. **New-episode push (B-02, SPEC G).** Publishing (admin "publish" and the scheduled-publish cron) queues one `push.new-episode` job in the same transaction as the status change (`status` is the precondition, so once). The job pages through devices of ACTIVE users with `accessUntil > now` and sends in batches of 100. It is at-least-once: a crash repeats the pages already sent ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]).
6. **Production bootstrap (A-01).** `pnpm --filter @ongod/api ops:bootstrap` creates, only if missing, the OWNER, one active Plan and the minimum app versions. It never overwrites. The dev seed refuses to run in production or against a non-local database host. The store reviewer's demo account is a normal registration plus an admin "grant" ([[STORE]]).
7. **Registration deadlock (C-05).** `issueCode` no longer runs the "invalidate old codes" update when the user has no earlier code, which removes the gap lock behind the deadlock.
8. **Refresh keeps the device platform (C-06).** A refresh no longer overwrites `Device.platform` with "unknown".

## Alternatives rejected

- **Hide the plans link on `/terms` with a query flag:** one forgotten link still leads to a purchase; a separate layout cannot.
- **Keep the 30 per IP refresh limit and raise the number:** any number is a guess about carrier NAT; the token needs no IP limit.
- **Send the new-episode push from the request:** slow work goes through the Job table.
- **One push job per user for the broadcast:** thousands of jobs per episode; paging inside one job is simpler and the repeat risk is the same.

## Consequences

- The privacy text still mentions payment records in two sentences; the owner supplies the final text ([[AUDIT-2026-10-09]] D-02). The app privacy page is not filtered.
- Pushes reach phones only after the mobile app registers a token (`expo-notifications`, phase 3).
- A bigger `AUTH_RATE_LIMIT_IP_MAX` allows more password guesses per IP; the per-identifier limit (10) is unchanged ([[ADR-0018-auth-implementation-details|ADR-0018]] #8).

## Evidence

- `apps/api/test/audit-fixes.test.ts`, `push-token-and-publish.test.ts`, `admin-access.test.ts` (content routes), `apps/portal/test/app-pages.test.ts`.
