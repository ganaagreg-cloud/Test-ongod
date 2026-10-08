---
id: ADR-0018
title: 'Auth implementation details: devices, sessions, codes, rate limits'
status: accepted
date: 2026-10-08
tags: [adr, area/auth, area/backend]
---

## Context

[[ADR-0008-auth-primitives-two-devices|ADR-0008]] fixes the primitives (argon2id, JWT 15 min, opaque rotating refresh tokens, 2 devices, 6-digit email codes). [[SPEC#Workflows]] A, B and H leave several details open. This ADR records how `/v1/auth` and `/v1/me` fill them in. It does not change ADR-0008, SPEC or DESIGN.

## Decision

1. **Register returns no tokens.** `verify-email` and `resend-code` are public and keyed by email. Login is a separate call.
2. **Device limit.** The 3rd device gets `403 DEVICE_LIMIT` with `error.details.devices`. The blocked device frees a slot by logging in again with `removeDeviceId` plus the password (removal without a session). A signed-in user removes a device with `DELETE /v1/me/devices/:id`, which also needs the password.
3. **Logout** (by refresh token) revokes the device's sessions and deletes its `Device` row. So "2 devices" means 2 signed-in devices.
4. **Access guard checks the `Session` row on every request** (JWT claim `sid`). Logout, password reset, device removal and account deletion take effect at once, not after 15 minutes.
5. **Refresh reuse.** A rotated or revoked token, or a token sent with another `deviceId`, revokes the whole token family. Two parallel refreshes with the same token also kill the family (one wins, then the family is revoked). The revoke is committed before the 401 is returned. Device limit is checked on refresh too.
6. **Per-user row lock.** The first statement of every device/session transaction is a no-op `UPDATE` of the user row, which serialises changes per user. This prevents a 3rd device through a race. No raw SQL.
7. **Email codes** are stored as HMAC-SHA256 keyed with `JWT_ACCESS_SECRET`, not plain SHA-256 (10^6 values would be reversible at once). Each attempt is counted atomically before the comparison, so parallel guesses cannot exceed 5. The resend cooldown is derived from `expiresAt - 10 min`, so there is no schema change.
8. **Auth rate limits** are in-memory fixed windows, per IP and per identifier, in the single Node process. Limits are set by `AUTH_RATE_LIMIT_*` env values. Counters reset on restart.
9. **Usernames.** A username that looks like an email must equal the user's own email, so nobody can shadow another login. The default username (= email) follows the email when the email changes.
10. **Delete account** anonymizes the user row in place, revokes sessions, deletes devices, identities and codes, and keeps subscriptions and payments. It needs no password (as requested). Refresh token TTL defaults to 30 days; `.env.example` said 60.

## Alternatives rejected

- **Register returns tokens:** verify-by-email without a session would still be needed for the portal; one flow is simpler.
- **Logout keeps the Device row:** users would be blocked after logging out on a phone until they remove it with the password.
- **Stateless access-token check:** a revoked session would stay valid for up to 15 minutes.
- **Plain SHA-256 for codes:** offline brute force of a leaked table is instant.
- **Redis or DB-backed rate limits:** not available or not worth it on one process ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]).
- **Password required to delete the account:** not requested; social-only users have none.

## Consequences

- Sharing is limited to 2 simultaneous signed-in devices; logging out and in on a third is possible (accepted).
- One extra DB read per authenticated request.
- A legitimate double refresh from a client logs that device out (standard rotation trade-off).
- In-memory limits are lost on restart and do not span processes; revisit if the app ever runs more than one.
- A stolen access token can delete the account within its 15 minutes.
- `register` reveals `EMAIL_TAKEN` / `USERNAME_TAKEN`; forgot-password and resend-code do not reveal accounts.
- Local `.env` files need `JWT_ACCESS_SECRET` of at least 32 characters.

## Evidence

- Behaviour covered by `apps/api/test/auth.test.ts` and `account.test.ts` (126 API tests pass).
- No external facts used; no research note needed.
