---
id: ADR-0029
title: 'Admin app: TanStack Query and Table, admin session gate, tus upload with resume, Ulaanbaatar schedule picker'
status: accepted
date: 2026-10-09
tags: [adr, area/admin, area/frontend, area/auth, area/media]
---

## Context

[[SPEC#Surfaces]] (E, G) and [[DESIGN#Admin screens]] ask for a dense light admin: payments queue with a side panel, users, categories, episodes with a resumable audio upload and scheduling, audit log, CSV export. The API routes already exist ([[ADR-0022-admin-totp-session-proof|ADR-0022]], [[ADR-0023-subscription-workflows-implementation|ADR-0023]]); this records how `apps/admin` is built on them.

## Decision

1. **Data.** TanStack Query v5 for server state. A failed mutation shows the server's (Mongolian) message as a toast, unless the caller marks it `meta: { silent: true }`. The payments queue and the dashboard refetch every 30 s.
2. **Tables.** TanStack Table **9.2.8** ([[R-tanstack-table-v9]]): option `features`, display columns only. The API does paging, search and filtering, so the table only draws rows.
3. **Routing.** react-router 8, `basename="/admin"` (the API serves the build at `/admin/`, with the SPA fallback).
4. **Session gate.** The access token lives in memory; the refresh token is the separate httpOnly cookie `ongod_art` (`platform: "admin"`, [[ADR-0026-web-session-cookie-and-portal|ADR-0026]]). Gate: login, role check (ADMIN/OWNER), TOTP setup (QR drawn by the `qrcode` package, one setup request at a time) or code entry, then the app ([[ADR-0022-admin-totp-session-proof|ADR-0022]]). A `TOTP_REQUIRED` answer mid-session sends the user back to the code screen. At the 2-device limit the login screen lists the devices and offers "remove and sign in".
5. **Confirmations.** Every destructive or access-changing action opens a confirm dialog on the native `<dialog>` element (focus trap, Esc, inert page). Reject and revoke require a reason. Cancelling changes nothing.
6. **Keyboard.** Payments queue: J/K (and arrows once a row is selected) move, A approves, R rejects, Esc closes. Ignored while typing in a field or when a modal is open. Approve still asks for confirmation.
7. **Audio upload.** `tus-js-client` 4.3.1 ([[R-tus-js-client-4]]): 5 MB chunks, retries after 0, 1, 3, 5, 10 and 20 s, the Bearer token is read for every request and refreshed on a 401. Resume after a page refresh: the tus fingerprint (name, type, size, lastModified) finds the stored upload, a `HEAD` reads the server's real offset (so the bar jumps there and the message states the true percentage; a 404 starts a new upload), and a per-episode localStorage hint tells the refreshed page to ask for the same file again. Pause, resume, and cancel (with confirm; terminates the server upload). The page polls every 3 s while the audio is UPLOADING or PROCESSING; FAILED shows the reason and a Retry button.
8. **Schedule picker.** `datetime-local` is read as **Asia/Ulaanbaatar** wall-clock time using `Intl` (the offset is computed, never hard-coded; no date library) and sent as an ISO string with offset. All displayed dates are Ulaanbaatar time. Past times are refused; unit tests run under several machine time zones.
9. **Files behind the login.** The receipt image is fetched with the token and kept as a data URL (at most 5 MB; no object-URL lifecycle; click to enlarge). The CSV is fetched with the token and saved as a blob.
10. **Text and style.** All text is in `apps/admin/src/i18n/mn.ts`; CSS uses only token variables, with no media queries (blocks wrap). `apps/admin/test/admin-css.test.ts` checks raw colors, sizes and fonts, unknown variables, and hardcoded Cyrillic in components.
11. **Verification.** `apps/admin/e2e` (Playwright) runs against the real API, database and Mailpit: serial, one signed-in session (a TOTP code works once per 30 s). It creates e2e customers, and its `afterAll` cleans up **only rows that say they are e2e** ("@e2e." usernames, "E2E анги" titles) and asserts that the number of non-e2e rows in the queue and the episode list is unchanged.

## Alternatives rejected

- **TanStack Table v8:** familiar, but v9 is what resolves today and works; pinning v8 would mean a migration later for no gain. The deprecated `useLegacyTable` shim: same reason.
- **A date-time library (date-fns-tz, Luxon):** one more dependency for what `Intl` already does; Mongolia has no DST, but the code does not depend on that.
- **Object URLs for the receipt:** they need revoking, and revoking in an effect breaks under React StrictMode's double mount.
- **Tailwind / shadcn:** [[ADR-0025-ui-component-set|ADR-0025]] already rejects them; the kit plus token CSS is enough.
- **Drag and drop to order categories:** harder with a keyboard; up/down buttons are accessible and enough for a short list.
- **A separate admin auth endpoint or token:** [[ADR-0022-admin-totp-session-proof|ADR-0022]] and [[ADR-0026-web-session-cookie-and-portal|ADR-0026]] already cover it with the same rotation and reuse detection.
- **Resuming from the first progress event's percentage:** it counts bytes sent, not bytes the server has; the `HEAD` offset is exact.

## Consequences

- Running the e2e needs: the API with `SERVE_STATIC=true` and a built admin (`pnpm build`), Mailpit, `BANK_*` set (the subscription step returns 503 otherwise), a `JWT_ACCESS_SECRET` of at least 32 characters, and a free API port (set `ADMIN_E2E_URL`). Each run is a new browser, so a new device for the owner; at the limit the login screen's removal button is used.
- Registering two users at the same moment can deadlock inside the API (`issueCode`: `updateMany` on an empty range, then insert); the e2e registers one after another. Reported in the log, not fixed here.
- The browser's own file button is English ("Choose File") because it follows the browser language; the same holds for the portal's `FileField`.
- The admin JS bundle is about 548 kB (165 kB gzip); there is no code splitting yet.
- Known gaps: the browser tests do not cover a successful publish or schedule (it needs a READY audio and a cover, which need storage), nor the cover thumbnail display; light status badges remain below AA ([[R-admin-light-contrast]]).

## Evidence

- [[R-tanstack-table-v9]], [[R-tus-js-client-4]].
- `apps/admin/e2e/admin.spec.ts`: 9 tests, last run 9/9 (upload interrupted at about 38% and resumed, FAILED shown with reason and Retry, confirm dialogs, shortcuts, CSV, device-limit removal, logout).
- `apps/admin/test/*`: 10/10 (CSS rules, Ulaanbaatar conversion under three machine time zones).
