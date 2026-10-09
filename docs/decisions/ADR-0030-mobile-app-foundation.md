---
id: ADR-0030
title: 'Mobile app foundation: build config, session client, start-up gate, sign-in screens, social login, Sentry'
status: accepted
date: 2026-10-09
tags: [adr, area/mobile, area/auth]
---

## Context

[[SPEC#Workflows]] A (register), B (login, 2 devices), C (Google/Apple, behind `SOCIAL_LOGIN`), I (minimum version) and the "Auth" screens of [[DESIGN#App screens]] need an app that can sign a user in. CLAUDE.md adds: tokens in secure storage, a stable device id, one refresh at a time, no payment text anywhere in the mobile apps, all text in `mn.ts`, tokens-only styling, and the Step 6 UI kit only. The API side exists ([[ADR-0018-auth-implementation-details|ADR-0018]], [[ADR-0019-social-login-implementation|ADR-0019]], [[ADR-0026-web-session-cookie-and-portal|ADR-0026]]).

## Decision

1. **Build config.** `app.config.ts` replaces `app.json`, so build-time values come from the environment. `eas.json` has `development`, `preview` and `production` profiles with `environment`, `channel`, `autoIncrement` and `cli.appVersionSource: remote` ([[R-eas-json-profiles]]). `EXPO_PUBLIC_*` values (API address, Sentry DSN, store links, Google client IDs) are public and live in `apps/mobile/.env`; the template is `apps/mobile/.env.example`. Preview and production take the same names from EAS environment variables ([[MOBILE_BUILD]]).
2. **Session client** (`src/api/client.ts`, no React or Expo imports, so it is unit-tested). The access token lives in memory only. The **refresh token** is the one long-lived secret and sits in SecureStore, as does the **device id** (created once as `<os>-<uuid>`). A 401 starts **one** refresh however many requests failed at once; a request that fails after another one already refreshed just repeats with the new token. The rotated refresh token is **saved before** the new access token is used (the server treats a second use of an old token as theft, [[ADR-0018-auth-implementation-details|ADR-0018]]). Only a refused refresh token (401/403) ends the session; no network, a timeout or a 5xx keeps it. Every request has a time limit (20 s; 8 s for start-up app-config) and a timeout counts as "no network".
3. **Server state** with TanStack Query v5; the app's foreground state drives its focus handling.
4. **Gate** (`src/gate.ts`): one value decides which screens exist, through `Stack.Protected` groups: `apiMissing`, `loading`, `update`, `unreachable`, `signedOut`, `pendingProfile`, `signedIn`. A screen behind a false guard cannot be reached by link or back button. `app/index.tsx` is the hub (loading, no-connection and "API address missing" states, or a redirect).
5. **Minimum version** (SPEC I). `GET /v1/app-config` on start; below the minimum for the platform, the blocking "Шинэчлэлт шаардлагатай" screen is the only screen (store button only if its address is set). The check is numeric (1.0.10 is newer than 1.0.9) and an unreadable version never locks the app. If the server cannot be reached the app opens normally (login needs the network anyway) and checks again whenever it returns to the foreground.
6. **Screens.** Welcome, Login, Register, Email code (six boxes, the sixth digit sends, 60 s resend wait), Forgot and Reset password, Device limit, Complete profile, and a placeholder signed-in screen until the library is built. Forms are checked with the API's own zod schemas, with Mongolian messages. After the email code the user logs in (no automatic login, so the password is never kept for later); a taken email or username is shown under its field; the server's own message (already Mongolian) is shown for everything else. The password reset returns to the login screen already in the stack (`dismissTo`), so there is never a second, empty login behind it. **Device limit:** the login that was refused is kept as a closure in the auth context, so the password or ID token is never put in a route parameter; removing a device repeats that login with `removeDeviceId`.
7. **Social login** (SPEC C, [[ADR-0009-social-login-feature-flag|ADR-0009]]). Buttons appear only when `/app-config` says `socialLogin` and this build has the Google web client ID. On iOS Google is shown only together with Apple (App Review 4.8, [[R-apple-login-services-4-8]]). Google: `@react-native-google-signin/google-signin` 16, the free "Original" module ([[R-google-signin-v16]]). Apple: `expo-apple-authentication` with Apple's own button ([[R-expo-apple-authentication]]); the app passes Apple the SHA-256 of a random nonce and sends the raw nonce to the API. A new social user is `PENDING_PROFILE` and must complete the profile (username prefilled with the email, Apple's first-time name prefilled) before anything else works.
8. **Sentry** ([[R-sentry-react-native-expo]], [[ADR-0016-monitoring-logs-alert-emails|ADR-0016]]): `@sentry/react-native`, started only when `EXPO_PUBLIC_SENTRY_DSN` is set; no default PII, user id only, no performance tracing yet; `Sentry.wrap` on the root and an error boundary that reports. The build plugin (source-map upload) is added only when `SENTRY_ORG` and `SENTRY_PROJECT` are set; `SENTRY_AUTH_TOKEN` is an EAS secret.
9. **UI.** Only the Step 6 kit plus two small additions in `src/ui`: `Screen` (safe area, keyboard) and `CodeInput` (the six boxes DESIGN.md asks for). `CodeInput` is native only; the portal's email-code page uses one field ([[ADR-0025-ui-component-set|ADR-0025]] asks for a note when a component exists on one platform only). App-level pieces (`AuthHeader`, `StatusView`, `SocialButtons`, `AppleButton`) are built from the kit; Apple's own button is used because Apple's guidelines ask for it; the Google button is the kit's secondary button.
10. **No payment text.** `test/no-payment-text.test.ts` searches everything the app ships, outside comments, for payment words in Mongolian and English (price, bank, plan, subscribe, transfer, ₮, ...) and checks the API wrapper has no payment endpoints. The tokens-only test now also covers `app/` and `src/components/`.

## Alternatives rejected

- **`sentry-expo`:** deprecated, for Expo SDK 49 and older.
- **Access token in SecureStore too:** extra writes on every refresh for a 15-minute token; memory is enough and a restart simply refreshes.
- **Automatic login after the email code:** would have to keep the password in memory or navigation state across screens.
- **Device-limit state in route parameters:** a password or token in the navigation state and logs.
- **Refusing to open when `app-config` is unreachable:** locks everybody out during a server outage and cannot force an update anyway; the server can still refuse old clients later.
- **A global state library (Redux, Zustand):** one small auth context and the query cache are enough.
- **Google's own sign-in button component:** brand button with its own sizes; the kit button keeps one look. Revisit if Google's branding review asks for it.

## Consequences

- **Not tested on a device or in EAS yet:** SecureStore, Google and Apple sign-in, the keyboard behaviour, `CodeInput` with TalkBack/VoiceOver, and the Sentry plugin. What was checked: 80 unit tests, both native JS bundles compile, the plugins run in `expo config`, and the screens work in Expo web against the real API.
- The Apple nonce handling rests on an assumption the docs do not settle ([[R-expo-apple-authentication]], TO-VERIFY); if wrong, Apple sign-in answers `SOCIAL_TOKEN_INVALID` and the fix is one line.
- iOS may keep the device id across a reinstall (Keychain); Android forgets it and uses a new slot, which the device-limit screen can free.
- pnpm skipped the `@sentry/cli` install script locally; the EAS build image decides whether source maps upload.
- [[ADR-0028-cream-library-and-16x9-artwork|ADR-0028 (cream browsing screens)]] changes tokens and the library screens; these auth screens use the tokens only, but should be looked at again once the tokens change.
- `EXPO_PUBLIC_API_URL` must point at the API; with it missing the app shows a clear "API address missing" screen instead of failing silently.

## Evidence

- `apps/mobile/test`: 80/80 (refresh rules, version check, validation, no payment text, tokens-only for the kit, components and every screen).
- `apps/mobile/e2e/auth.spec.ts`: 10/10 in Expo web against the real API and Mailpit: Welcome, field errors, the whole sign-up with the emailed code, duplicate email, password reset, the device limit with three separate "phones", update-required, offline start, and the complete-profile step (answers mocked). Screenshots `docs/screens/mobile-*.png`.
- `expo export --platform android` and `--platform ios` both produce a Hermes bundle.
- [[R-eas-json-profiles]], [[R-sentry-react-native-expo]], [[R-google-signin-v16]], [[R-expo-apple-authentication]], [[R-expo-sdk-57-versions]].
