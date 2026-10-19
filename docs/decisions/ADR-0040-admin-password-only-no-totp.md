---
id: ADR-0040
title: 'Admin login is password only: TOTP 2FA removed'
status: accepted
date: '2026-10-19'
tags: [adr, area/auth, area/admin]
---

## Context

[[SPEC#Surfaces]] required "TOTP 2FA" for ADMIN and OWNER, and [[ADR-0022-admin-totp-session-proof|ADR-0022]] built it (setup screen with QR code, a code on every new login, `Session.totpVerifiedAt`). [[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]] also lists "Admin requires TOTP 2FA".

The client (the owner of the app) says she does not need a second authenticator on the admin. The owner decided on 2026-10-19 to remove it and rely on the password alone.

This conflicts with SPEC line 18 and with accepted ADR-0022. The owner approved editing SPEC; this ADR supersedes ADR-0022 and the TOTP line of ADR-0010.

## Decision

1. **Admin login is password only.** `POST /v1/auth/login` is the only step. A signed-in user whose role is ADMIN or OWNER can use `/v1/admin/*`.
2. **One guard.** `requireAdmin` (role read from the DB on every request, so a demoted admin is out at once) protects every admin route, including the tus upload. `requireAdminTotp` is removed.
3. **Removed:** the routes `GET /v1/admin/totp`, `POST /v1/admin/totp/setup` and `/verify`; `admin/totp.ts`; the error codes `TOTP_SETUP_REQUIRED`, `TOTP_REQUIRED`, `TOTP_ALREADY_ENABLED`, `TOTP_INVALID`; the `TOTP_ISSUER` env value; `pnpm dev:totp`; the `otplib` dependency; the admin setup and code screens.
4. **Database: columns stay, unused.** `User.totpSecret`, `User.totpEnabledAt`, `User.totpLastStep` and `Session.totpVerifiedAt` are no longer read or written (account deletion still clears `totpSecret`). No migration now, so this change cannot damage the database. A later migration drops them.
5. **Still in force:** argon2id password hashing, the auth rate limiter, the two-device limit, refresh-token rotation with reuse detection, `Cache-Control: no-store` on admin responses, and the audit log.

## Alternatives rejected

- **Dev-only switch (`ADMIN_2FA=off`), 2FA stays in production:** the client does not want 2FA at all, so keeping it in production does not match the decision.
- **Keep TOTP but optional per admin:** keeps all the code and tests for a feature nobody wants.
- **Hide only the setup screen:** the API would still demand a code, so the admin would be locked out.

## Consequences

- A stolen or guessed admin password now gives full admin access (approve payments, grant access, upload content). Mitigations: a long, unique owner password (stored only in env and a password manager), the login rate limiter, the device limit, and the audit log of every grant and approval.
- The "Whoever has an admin password before the real admin sets up TOTP" risk in ADR-0022 no longer exists, because there is no setup step.
- Existing admins need no action. Their TOTP data in the database is ignored.
- Reintroducing a second factor later (for example passkeys) needs a new ADR.
- Follow-up: migration to drop the four unused columns; `docs/runbooks` mentions of the authenticator were updated in the same change.

## Evidence

- Owner instruction, 2026-10-19 (client does not need the second authenticator).
- Behaviour covered by `apps/api/test/admin-access.test.ts`.
- [[R-otplib-13-totp]] describes the removed library and is kept for history.
