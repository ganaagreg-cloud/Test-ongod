---
topic: 'Sign in with Apple: ID token issuer, JWKS and claims'
status: VERIFIED
checked: 2026-10-08
recheck_after: 2027-01-06
source: https://appleid.apple.com/.well-known/openid-configuration
tags: [research, area/auth, store/apple]
---

## Fact

**VERIFIED** (Apple's OpenID discovery document, fetched 2026-10-08):

- `issuer`: `https://appleid.apple.com`
- `jwks_uri`: `https://appleid.apple.com/auth/keys`
- `id_token_signing_alg_values_supported`: `RS256`
- `claims_supported` include `aud`, `email`, `email_verified`, `exp`, `iat`, `is_private_email`, `iss`, `nonce`, `nonce_supported`, `sub`

**ASSUMPTION** (Apple's developer pages could not be fetched, so these are not confirmed from Apple; the code accepts both forms):

- `email_verified` and `is_private_email` may arrive as a boolean or as the string `"true"`.
- The `nonce` claim holds whatever the app gave Apple. Apps often pass the SHA-256 of a random value, so the API accepts the raw nonce or its SHA-256 hex.
- Apple sends `email` mainly on the first authorization; later tokens may only have `sub`. Private relay addresses end in `@privaterelay.appleid.com`.

## How it was checked

`Invoke-WebRequest https://appleid.apple.com/.well-known/openid-configuration` on 2026-10-08. The ASSUMPTION items were handled defensively and are covered by `apps/api/test/social-verifiers.test.ts`.

## Used by

- [[ADR-0009-social-login-feature-flag|ADR-0009]]
- [[ADR-0019-social-login-implementation|ADR-0019]]
