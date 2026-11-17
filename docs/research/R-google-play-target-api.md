---
topic: Google Play target API level for new apps and updates
status: VERIFIED
checked: '2026-11-16'
recheck_after: '2027-02-14'
source: 'https://developer.android.com/google/play/requirements/target-sdk (fetched 2026-11-16); local: react-native/gradle/libs.versions.toml'
tags: [research, store/google, area/mobile]
---

## Fact

Since **2026-08-31** new apps and app updates must target **Android 16 (API level 36)** or higher to be submitted to Google Play. Existing apps must target API 35 or higher to stay available to new users on newer Android. An extension to 2026-11-01 could be requested (already past). Permanently private organization apps are exempt.

**Our build:** React Native 0.88 (Expo SDK 58) sets `targetSdk = "36"` and `compileSdk = "37"` in its own Gradle version file, so the Android build meets the rule without extra settings. Check the final value in the built AAB.

## How it was checked

Fetched the Android Developers page and read the "Starting August 31 2026" list. Ran `grep targetSdk node_modules/react-native/gradle/libs.versions.toml` in the repo (`targetSdk = "36"`).

## Used by

- [[STORE]]
