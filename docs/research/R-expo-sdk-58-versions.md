---
topic: Expo SDK 58 bundled native module versions, and why the App Store Expo Go forces the move
status: VERIFIED
checked: '2026-10-24'
recheck_after: '2026-12-23'
source: 'computed locally: bundledNativeModules.json in npm pack expo@58.0.19; npm dist-tags of expo (latest 58.0.19, sdk-57 57.0.31); Expo Go error text pasted by the user on 2026-10-24'
tags: [research, area/mobile, tooling]
---

## Fact

**VERIFIED (npm registry, 2026-10-24):** `expo` dist-tag `latest` is 58.0.19; the SDK 57 line ends at 57.0.31 (`sdk-57`). Expo SDK 58 (expo 58.0.19) expects:

| Package                        | SDK 57 (in repo) | SDK 58   |
| ------------------------------ | ---------------- | -------- |
| react / react-dom              | 19.2.3           | 19.3.0   |
| react-native                   | 0.86.3           | 0.88.0   |
| react-native-web               | ^0.21.3          | ~0.21.4  |
| expo-router                    | ~57.0.25         | ~58.0.26 |
| expo-audio                     | ~57.0.5          | ~58.0.10 |
| expo-video                     | ~57.0.5          | ~58.0.12 |
| react-native-reanimated        | 4.5.1            | 4.7.1    |
| react-native-worklets          | 0.10.1           | 0.13.0   |
| react-native-gesture-handler   | ~2.32.0          | ~3.3.0   |
| react-native-screens           | ~4.26.0          | ~4.30.0  |
| react-native-safe-area-context | ~5.7.0           | ~5.10.1  |
| react-native-svg               | 15.15.4          | 15.16.0  |
| @sentry/react-native           | ~7.11.0          | ~8.28.0  |
| expo-application               | ~57.0.3          | ~58.1.2  |

Every other `expo-*` package the mobile app uses moves from ~57.0.x to ~58.0.x (see `bundledNativeModules.json` of expo 58.0.19). Major bumps that can change APIs: **react-native-gesture-handler 2 to 3**, **@sentry/react-native 7 to 8**, react-native 0.86 to 0.88, react-native-worklets 0.10 to 0.13.

**Reported by the user, not read from Expo (TO-VERIFY):** the App Store Expo Go on the user's iPhone is SDK 58.0.0 and refused the SDK 57 project with "not possible to install an older version of Expo Go for iOS devices, only the latest version is supported" (message pasted 2026-10-24). This contradicts the SDK 57 claim in [[R-ios-device-install]], which was reported on 2026-09-02 and has since been overtaken.

## How it was checked

`npm pack expo@58` in a scratch folder, read `bundledNativeModules.json`, compared with `apps/mobile/package.json`. `npm view expo dist-tags`. expo.dev was not read.

## Used by

- [[ADR-0048-upgrade-to-expo-sdk-58|ADR-0048]]
