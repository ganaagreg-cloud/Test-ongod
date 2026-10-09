---
topic: Sentry for an Expo app (@sentry/react-native, config plugin, Metro, source maps)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'https://docs.sentry.io/platforms/react-native/manual-setup/expo/ and .../sourcemaps/uploading/expo/ (fetched 2026-10-09); version from expo 57 bundledNativeModules.json'
tags: [research, area/mobile, tooling]
---

## Fact

- **`sentry-expo` is deprecated** (only for Expo SDK 49 and older). Use **`@sentry/react-native`** (Expo SDK 50 or newer). Expo SDK 57 expects `~7.11.0` (`bundledNativeModules.json`).
- `app.json` / `app.config.ts` plugin: `["@sentry/react-native/expo", { "url": "https://sentry.io/", "organization": "<org>", "project": "<project>" }]`.
- Metro: `const { getSentryExpoConfig } = require('@sentry/react-native/metro'); module.exports = getSentryExpoConfig(__dirname);`.
- Code: `Sentry.init({ dsn, ... })` once, then `export default Sentry.wrap(RootLayout)` in the expo-router root layout.
- Source maps and debug symbols upload by themselves during EAS builds and local release builds when the plugin and the Metro config are present. `SENTRY_AUTH_TOKEN`: a gitignored `.env.local` for local builds, an **EAS secret** for EAS builds.
- The docs name **no switch** to turn the upload off other than not adding the plugin. We therefore add the plugin only when `SENTRY_ORG` and `SENTRY_PROJECT` are set ([[ADR-0029-mobile-app-foundation|ADR-0029]]).
- The page does not say whether it works in Expo Go; we use a dev build anyway ([[ADR-0001-mobile-react-native-expo|ADR-0001]]).

## Not checked

- Whether a build without the plugin still reports readable stack traces (needs a Sentry project and a device); until then crash reports may show minified frames.

## Used by

[[ADR-0016-monitoring-logs-alert-emails|ADR-0016]], [[ADR-0029-mobile-app-foundation|ADR-0029]]
