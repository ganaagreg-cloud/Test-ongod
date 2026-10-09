---
type: runbook
status: draft
tags: [runbook, area/mobile]
---

# Mobile build and run

Decisions: [[ADR-0029-mobile-app-foundation|ADR-0029]], [[ADR-0001-mobile-react-native-expo|ADR-0001]], [[ADR-0015-local-first-android-smoke-test|ADR-0015]] · Facts: [[R-eas-json-profiles]], [[R-sentry-react-native-expo]], [[R-google-signin-v16]], [[R-expo-apple-authentication]]

## Settings

- Local: copy `apps/mobile/.env.example` to `apps/mobile/.env` (Expo reads `.env` from the app folder, not the repo root). Set `EXPO_PUBLIC_API_URL`:
  - Android emulator: `http://10.0.2.2:3000`
  - Real phone on the same Wi-Fi: `http://<LAN IP of the computer>:3000`
  - iOS simulator or the browser preview: `http://localhost:3000`
- `EXPO_PUBLIC_*` values end up inside the app: no secrets. `SENTRY_AUTH_TOKEN` is the only secret and goes into EAS secrets, never a file in the repo ([[SECRETS]]).
- Preview and production builds read the same names from **EAS environment variables** (`environment` in `eas.json`). Create them once per environment (check `eas env:create --help` for the current flags): `EXPO_PUBLIC_API_URL` (the real https address), `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_IOS_STORE_URL`, `EXPO_PUBLIC_ANDROID_STORE_URL`, `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and the build-time `GOOGLE_IOS_URL_SCHEME`, `SENTRY_ORG`, `SENTRY_PROJECT`.

## Run

1. API: `pnpm dev` (needs port 3000 free). The app needs the API for everything except the Welcome screen.
2. Dev build (not Expo Go): `pnpm --filter @ongod/mobile android` (Android Studio) or `eas build --profile development --platform android`. Then `pnpm dev:mobile` starts Metro for the dev client.
3. Browser preview of the screens (no Google/Apple, no SecureStore): `pnpm dev:mobile:web`.

## Builds

| Profile       | For                          | Notes                                           |
| ------------- | ---------------------------- | ----------------------------------------------- |
| `development` | developers, dev client       | internal distribution                           |
| `preview`     | testers                      | internal, Android `.apk`, channel `preview`     |
| `production`  | the stores                   | store distribution, build number auto-increment |

`eas build --profile <name> --platform <android|ios>`. The version shown to users is `version` in `app.config.ts`; the server's minimum (`min_version_ios` / `min_version_android` in `AppConfig`, [[SPEC#Workflows]] I) is compared with it.

## Checks without a phone

- `pnpm --filter @ongod/mobile test` (unit tests), `typecheck`.
- `pnpm --filter @ongod/mobile exec expo export --platform android` (and `ios`): bundles the real native code paths, so a broken native import shows up.
- Screens against the real API in a browser: start the API (`SERVE_STATIC` not needed), Mailpit, and Metro web with `EXPO_PUBLIC_API_URL` set, then `MOBILE_E2E_API_URL=<api> pnpm --filter @ongod/mobile test:e2e`. Each browser context counts as a new device (limit 2), so the spec registers its own users.

## Not yet done

- No build has run on a real device or in EAS. Google and Apple sign-in, SecureStore, the keyboard and the Sentry plugin are untested on hardware ([[open-questions]] #12).
- Google Cloud console and Apple developer setup (client IDs, signing fingerprints, Sign in with Apple identifier) are the owner's steps; none are recorded as verified.
