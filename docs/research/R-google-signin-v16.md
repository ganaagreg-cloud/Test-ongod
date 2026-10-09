---
topic: '@react-native-google-signin/google-signin 16 with Expo (config plugin, configure, signIn)'
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'https://react-native-google-signin.github.io/docs/setting-up/expo and /docs/original (fetched 2026-10-09); npm view (16.1.5, peer expo >= 52.0.40); installed type definitions'
tags: [research, area/mobile, area/auth]
---

## Fact

- Latest is **16.1.5**; it works only in a **dev build**, not Expo Go (native code). Prebuild or EAS build is required.
- Config plugin without Firebase: `["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<id>" }]` (the reversed iOS client ID). Checked: with the scheme set, `expo config --type introspect` adds it to the iOS `CFBundleURLSchemes`.
- The "Original" module (the one used here) is the classic button-based flow. On Android it uses the legacy Google Sign-In SDK, which the docs call deprecated but still working. macOS needs the paid version, which we do not use.
- API: `GoogleSignin.configure({ webClientId, iosClientId })` (the docs say `webClientId` is "needed for idToken and offline access"), `GoogleSignin.hasPlayServices()`, `GoogleSignin.signIn()` returns a response checked with `isSuccessResponse(response)`; the user is on `response.data`, and `idToken` is `string | null`. A cancelled sign-in is `response.type === 'cancelled'` (the docs do not mention `statusCodes.SIGN_IN_CANCELLED`, which exists in the type definitions; the app handles both).
- The ID token's audience is the **web** client ID, so the API's `GOOGLE_CLIENT_IDS` must include it ([[ADR-0019-social-login-implementation|ADR-0019]]).

## ASSUMPTION / TO-VERIFY

- The docs do not say which Universal-module features are paid; we avoid the Universal module.
- A real sign-in (Google Cloud console setup, Play signing certificate fingerprints, an Android device) has **not** been run; the same open point as [[R-google-id-token-verification]].

## Used by

[[ADR-0009-social-login-feature-flag|ADR-0009]], [[ADR-0029-mobile-app-foundation|ADR-0029]]
