---
id: ADR-0096
title: 'One admin gift code per request with its use shown in the list; own rate limit for the push-token route; designed "Эрх авах" screen'
status: accepted
date: '2026-11-12'
tags: [adr, area/admin, area/backend, area/mobile]
---

## Context

Ganaa, 2026-11-12, after trying [[ADR-0091-admin-issued-gift-codes|ADR-0091]]: several codes from one request share one note, so the admin cannot tell which code went to whom; one code at a time is enough, and the page must show whether a code was used. Ganaa also asked for the code items of [[AUDIT-2026-11-12]] to be done.

## Decision

1. **One code per request.** `POST /v1/admin/gifts` takes no `count` and answers `{gift}`. The note ("Хэнд зориулсан") is required and is the first line of the code's row. This replaces ADR-0091 item 1's "count 1–50"; everything else in ADR-0091 stands (0 ₮, idempotent `requestId`, audit row, void, expiry).
2. **The Бэлэг list shows every status by default** (`status` is optional in `GET /v1/admin/gifts`; before it defaulted to unredeemed). A used code stays in the list with a green "Ашигласан" badge, the member who used it, their email and the time.
3. **`PUT /v1/me/push-token` has its own limit: 20 a minute per address.** On 2026-11-11 one phone repeated this call about 70,000 times in two hours, used up the shared per-address limit and blocked login ([[2026-11-11]]). The app bug was fixed in `2cf1cb3`; this is the server's own guard, so a future client bug on this route cannot lock anyone out again.
4. **"Эрх авах" in the app** (shown only while the switch is on, [[ADR-0090-gift-codes-and-gift-buying-in-app-behind-switch|ADR-0090]]) is a designed screen: one card per plan with name, days and price, the chosen one marked, one button "QPay-ээр төлөх · price", a waiting state and a done state. Same calls as before.

## Not done, and why

- **Dropping the unused bank-transfer columns and enum values:** it cannot be undone, and no backup of the production database has been restored yet ([[LAUNCH_CHECKLIST]]). After the first proven restore.
- **Owner-only or emailed gift codes:** the owner's staff are the ones who run giveaways; every code is in the audit log with its note. Open in [[AUDIT-2026-11-12]] C2.
- **Guest browsing before login:** changes the access rules in [[SPEC]]; needs the client's answers ([[changes]], 2026-11-11) and its own ADR.

## Consequences

- An admin who needs ten codes makes ten, each with its own note.
- The schema columns of ADR-0091 are unchanged (`issueKey` now marks one row).

## Evidence

- Tests: `gifts.test.ts` (one code, retry, list shows who used it), `account.test.ts` (21st call is 429, other routes still answer).
