---
topic: expo-apple-authentication 57 (signInAsync, nonce, availability, config)
status: TO-VERIFY
checked: '2026-10-09'
recheck_after: '2026-11-08'
source: 'https://docs.expo.dev/versions/latest/sdk/apple-authentication/ (fetched 2026-10-09); installed type definitions (57.0.2)'
tags: [research, area/mobile, area/auth, store/apple]
---

## Fact (VERIFIED from the docs)

- Config: `ios.usesAppleSignIn: true` (or the package in `plugins`). Checked: it adds the `com.apple.developer.applesignin` entitlement. `CFBundleAllowMixedLocalizations: true` lets Apple's button follow the device language.
- `signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce })` returns `identityToken` (a JWT, `string | null`), `fullName`, `email`, `user`. Name and email come **only on the first sign-in** of that Apple ID for the app; later calls return `null` for them.
- `isAvailableAsync()` tells whether to show the button. A cancelled sign-in rejects with the code `ERR_REQUEST_CANCELED`.

## TO-VERIFY (the docs are silent; needs a real iPhone)

- **The nonce.** The docs only say "an arbitrary string used to prevent replay attacks". They do not say whether the library hashes it. The app assumes it is passed to Apple **unchanged**, so it passes `SHA-256(raw)` as `nonce` and sends the raw value to the API, which accepts "claim equals the raw nonce or its SHA-256 hex" ([[ADR-0019-social-login-implementation|ADR-0019]], [[R-apple-id-token-verification]]). If the library hashed it again, Apple sign-in would fail with `SOCIAL_TOKEN_INVALID`; the fix is then to pass the raw value.

## Used by

[[ADR-0009-social-login-feature-flag|ADR-0009]], [[ADR-0029-mobile-app-foundation|ADR-0029]]
