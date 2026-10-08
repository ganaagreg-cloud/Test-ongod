---
topic: 'Google ID token verification with google-auth-library'
status: TO-VERIFY
checked: 2026-10-08
recheck_after: 2026-12-07
source: 'computed locally: type definitions of google-auth-library 11.2.0 in node_modules'
tags: [research, area/auth]
---

## Fact

**VERIFIED locally** (installed `google-auth-library` 11.2.0 type definitions):

- `OAuth2Client.verifyIdToken({ idToken, audience?: string | string[], maxExpiry? })`, so several client IDs (web, iOS, Android) can be passed as the audience list.
- The token payload type has `sub`, `email`, `email_verified`, `nonce`, `aud`, `iss`.

**TO-VERIFY** (not read from Google's docs or the library source yet):

- That the library checks the issuer (`accounts.google.com` / `https://accounts.google.com`), the signature against Google's certificates and the expiry. The API relies on this and does not re-check them.
- That the Google client IDs used on iOS and Android differ from the web client ID and all appear as `aud` for their platform.

## How it was checked

Read `build/src/auth/oauth2client.d.ts` and `loginticket.d.ts` in the installed package. The API test only uses a fake client, so the real library path is untested until a real Google token is tried on a device.

## Used by

- [[ADR-0009-social-login-feature-flag|ADR-0009]]
- [[ADR-0019-social-login-implementation|ADR-0019]]
