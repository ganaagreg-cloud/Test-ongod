---
topic: otplib 13 TOTP API (verifySync, epochTolerance, afterTimeStep)
status: VERIFIED
checked: '2026-10-08'
recheck_after: '2026-12-07'
source: 'computed locally: read node_modules/otplib/dist/*.d.ts (v13.5.0) and ran the API tests'
tags: [research, area/auth, area/backend]
---

## Fact

- `otplib` 13.5.0 has a functional API: `generateSecret()` (Base32, 20 random bytes), `generateURI({ issuer, label, secret })` (otpauth:// URI), `generateSync` / `verifySync`.
- `verifySync({ secret, token, epochTolerance, afterTimeStep })` returns `{ valid, delta?, timeStep? }`. `epochTolerance` is in seconds (we use 30 = one step either side). `afterTimeStep` rejects any code whose time step is at or below it: the library's own replay protection. We store the last accepted step in `User.totpLastStep`.
- Defaults are the Google Authenticator ones: SHA-1, 6 digits, 30 s period. The comparison is constant time.
- Older tutorials use the `authenticator` object of v12; it no longer exists in v13.

## How it was checked

- Read the shipped type definitions and doc comments (`functional.d.ts`, `@otplib/totp` options).
- `apps/api/test/admin-access.test.ts` runs real codes through the API: a valid code, a replayed code, a code one step ahead, a code outside the tolerance.

## Used by

- [[ADR-0022-admin-totp-session-proof|ADR-0022]]
