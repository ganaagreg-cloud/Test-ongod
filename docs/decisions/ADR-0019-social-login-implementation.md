---
id: ADR-0019
title: 'Social login implementation: verification, LINK_REQUIRED, pending profile'
status: accepted
date: 2026-10-08
tags: [adr, area/auth, area/backend]
---

## Context

[[ADR-0009-social-login-feature-flag|ADR-0009]] (accepted: paid add-on) defines Google/Apple login behind `SOCIAL_LOGIN`, flow per [[SPEC#Workflows]] C. This ADR fixes the details of the API. It builds on [[ADR-0008-auth-primitives-two-devices|ADR-0008]] and [[ADR-0018-auth-implementation-details|ADR-0018]] and changes neither.

## Decision

1. **Flag.** The social routes are registered only when `SOCIAL_LOGIN=true`; otherwise they are plain 404s. With the flag on, `GOOGLE_CLIENT_IDS` and `APPLE_CLIENT_IDS` must both be set (env validation), because Google on iOS needs Sign in with Apple ([[R-apple-login-services-4-8]]).
2. **Verification.** Google: `google-auth-library` `OAuth2Client.verifyIdToken` with the list of web, iOS and Android client IDs as audience. Apple: `jose` `jwtVerify` against `https://appleid.apple.com/auth/keys`, `iss=https://appleid.apple.com`, `aud` in `APPLE_CLIENT_IDS`, RS256 only ([[R-apple-id-token-verification]], [[R-google-id-token-verification]]). Any failure is `401 SOCIAL_TOKEN_INVALID`. Verifiers are injectable so tests use fakes.
3. **Nonce.** Required for Apple, optional for Google (checked when sent). The client sends the raw nonce; the token's `nonce` claim may be the raw value or its SHA-256 hex.
4. **Identity key.** An identity is `(provider, sub)`. Login never matches by email, so an email change at the provider changes nothing.
5. **New user.** No identity and the email is free: create a `PENDING_PROFILE` user with the provider-verified email (`emailVerifiedAt` set), a placeholder username `pending-<uuid>`, empty names and phone, no password. The email must be present and `email_verified`; else `SOCIAL_EMAIL_REQUIRED` or `SOCIAL_TOKEN_INVALID`. Apple private relay addresses are stored as ordinary emails.
6. **LINK_REQUIRED.** No identity but the email belongs to an existing user: `409 LINK_REQUIRED` with `details.email`. Nothing is created and nobody is logged in. The user logs in with the password, then links.
7. **Pending lock.** The auth guard answers `403 PROFILE_INCOMPLETE` for `PENDING_PROFILE` users unless the route sets `config.allowPending`. Only `POST /auth/complete-profile` and `GET /me` set it; `POST /auth/logout` is public (refresh token), so it works too. New authenticated routes are locked by default.
8. **Complete profile.** Sets username, password, names and phone and activates the user, once (`WHERE status = PENDING_PROFILE`); a second call is `409 BAD_REQUEST`. An email-shaped username must be the user's own email (same rule as register).
9. **Link / unlink.** `POST /me/link/google|apple`: one identity per provider per user; the same account twice is a no-op; an account linked to another user is `409 IDENTITY_TAKEN`; the provider email need not match. `GET /me/identities` lists identities (needed for their ids). `DELETE /me/identities/:id` is refused with `409 LAST_LOGIN_METHOD` unless the user still has a password.
10. **Devices.** Social sign-in uses the same device limit as password login. After `DEVICE_LIMIT`, `removeDeviceId` is authorised by the valid ID token, as the password is for password login.

## Alternatives rejected

- **Auto-link by verified email:** one compromised or recycled provider email would take over a paid account; the spec asks for a password login first.
- **Hash-only nonce:** would break apps that send the raw value, or the other way round; accepting both loses nothing.
- **Trusting an unverified provider email:** anyone could claim another person's address.
- **Create pending users without a placeholder username:** `username` is required and unique.

## Consequences

- The Google verification path runs through the real library only on a device; the API tests use fakes ([[R-google-id-token-verification]] stays TO-VERIFY). Apple's logic is tested with a local key pair.
- A person who registered with someone else's email and never verified it blocks that person's Google login with `LINK_REQUIRED` (they can reset the password by email code). Not solved here.
- Mobile must send the raw nonce and, on iOS, offer both Google and Apple.
- Account deletion already removes identities, so the same Google account can start fresh.
- Implemented in `apps/api/src/auth/social*.ts`, `routes/social.ts`; tests in `social.test.ts` and `social-verifiers.test.ts`.

## Evidence

- [[R-apple-id-token-verification]] (VERIFIED discovery document; nonce and flag formats are assumptions handled in both forms)
- [[R-google-id-token-verification]] (TO-VERIFY)
- [[R-apple-login-services-4-8]]
