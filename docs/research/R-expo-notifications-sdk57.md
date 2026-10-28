---
topic: expo-notifications on SDK 57 (version, push token, permission, Android channel, Expo Go, iOS entitlement)
status: VERIFIED
checked: '2026-10-28'
recheck_after: '2026-12-27'
source: 'computed locally: node_modules/expo/bundledNativeModules.json and the installed expo-notifications 57.0.24 package (src/getExpoPushTokenAsync.ts, src/warnOfExpoGoPushUsage.ts, plugin/build/withNotifications*.js, android/src/main/AndroidManifest.xml)'
tags: [research, area/mobile]
---

## Fact

**VERIFIED (installed package source, 2026-10-28):**

- SDK 57 (`expo` 57.0.27) bundles `expo-notifications` `~57.0.22`; installed 57.0.24.
- `getExpoPushTokenAsync()` needs an EAS `projectId`: the option, or `Constants.easConfig.projectId`, or `Constants.expoConfig.extra.eas.projectId`. Without one it throws `ERR_NOTIFICATIONS_NO_EXPERIENCE_ID`. It calls Expo's servers, so it can fail offline (`ERR_NOTIFICATIONS_NETWORK_ERROR`); the package says to try/catch and retry later.
- Remote push is not available in Expo Go on Android since SDK 53 (the package warns); a development build is needed.
- The package's Android manifest declares `android.permission.POST_NOTIFICATIONS`. Permissions: `getPermissionsAsync()` (no prompt) and `requestPermissionsAsync()`; channels with `setNotificationChannelAsync`.
- The config plugin takes `icon`, `color`, `defaultChannel`, `sounds`, `mode` (iOS, default `development`) and sets the iOS `aps-environment` entitlement to `mode`.
- Exports used: `addPushTokenListener`, `addNotificationResponseReceivedListener`, `getLastNotificationResponse`, `setNotificationHandler`.

**TO-VERIFY (docs.expo.dev could not be reached from the session on 2026-10-28):**

- Android delivery needs Firebase Cloud Messaging: a `google-services.json` in the build (`android.googleServicesFile`) and an FCM v1 service-account key uploaded to EAS credentials.
- iOS delivery needs an APNs key, which needs a paid Apple Developer Program membership ([[R-ios-device-install]]); EAS can create it during `eas build`.
- Android needs a notification channel before the permission prompt on Android 13+.
- Whether a store (App Store / TestFlight) build needs the plugin's `mode: 'production'`, or the signing step sets `aps-environment` from the provisioning profile.

## How it was checked

Read the files named in `source` after `pnpm add expo-notifications@~57.0.22` in `apps/mobile`. WebFetch of `docs.expo.dev` failed (host not reachable from the session); a web search gave only third-party pages, used for nothing marked VERIFIED.

## Used by

- [[ADR-0055-push-token-registration|ADR-0055]]
