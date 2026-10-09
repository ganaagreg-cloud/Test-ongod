---
id: ADR-0022
title: 'Admin TOTP 2FA: the proof lives on the session'
status: accepted
date: 2026-10-08
tags: [adr, area/auth, area/admin]
---

## Context

[[SPEC#Surfaces]] and [[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]] require TOTP 2FA for ADMIN and OWNER, set up on the first admin login. Admins log in through the normal `/v1/auth/login` (password + device) and get the same access tokens as members. Something must record that _this session_ also passed the second factor, and that must survive token refresh.

## Decision

1. **Session proof.** `Session.totpVerifiedAt` is set by `POST /v1/admin/totp/verify`. A refresh copies it to the new session of the same token family; a new login (new family) starts without it.
2. **Guards.** `requireAdmin` (role ADMIN/OWNER, read from the DB on every request) protects the three TOTP routes. `requireAdminTotp` (that, plus `User.totpEnabledAt` set, plus `Session.totpVerifiedAt` set) protects every other `/v1/admin/*` route. Answers: `403 FORBIDDEN` (not an admin), `403 TOTP_SETUP_REQUIRED`, `403 TOTP_REQUIRED`.
3. **Setup.** `POST /v1/admin/totp/setup` stores a fresh secret in `User.totpSecret` and returns the secret and the otpauth URI (the admin app draws the QR). The secret counts only after the first valid code sets `User.totpEnabledAt`. A restarted setup replaces a pending secret. **After TOTP is enabled, setup is refused (`TOTP_ALREADY_ENABLED`)**, so a stolen password cannot swap the second factor. Resetting a lost authenticator is a manual step by the OWNER/developer (clear `totpSecret` and `totpEnabledAt` in the DB).
4. **Replay and guessing.** `otplib` `verifySync` with a 30 s tolerance and `afterTimeStep = User.totpLastStep`; the new step is stored with a precondition on the old one, so two parallel requests with one code cannot both pass. Setup and verify share the auth rate limiter (per IP and per user).
5. **Audit.** Enabling TOTP is written to `AuditLog` (`admin.totp_enabled`).

Schema additions (migration `20261009090000_admin_payments_totp`): `User.totpEnabledAt`, `User.totpLastStep`, `Session.totpVerifiedAt`. **SPEC "Data model" needs the same three fields; the edit is waiting for approval** (see log 2026-10-08).

## Alternatives rejected

- **A separate admin login endpoint and token type:** a second token system to build and secure; the session row already gives instant revocation ([[ADR-0018-auth-implementation-details|ADR-0018]] #4).
- **A `totp` claim in the access JWT:** the token is refreshed every 15 minutes, so the proof would have to be re-derived from something stored anyway.
- **Skipping `totpEnabledAt` and treating any stored secret as enabled:** an abandoned setup would count as enabled, and setup could not be refused safely.
- **Encrypting `totpSecret` at rest:** needs a new key to manage and home-made use of AES; the database already holds only hashed passwords and tokens, and a database leak is a bigger problem than the TOTP seeds. Revisit if the host offers a secrets store.

## Consequences

- An admin who logs in on a second browser must enter a code there too. A code can be used once, so two logins in the same 30 s need the next code.
- Whoever has an admin password _before_ the real admin sets up TOTP can enrol their own authenticator. Mitigation: the owner account is created by the developer (seed) and its TOTP is set up at hand-over, before launch.
- Existing admin sessions created before this migration have no proof and are asked for a code, which is the intended result.
- Logout and password change already revoke sessions, so they also drop the proof.

## Evidence

- [[R-otplib-13-totp]]
- Behaviour covered by `apps/api/test/admin-access.test.ts`.
