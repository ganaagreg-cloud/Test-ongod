---
topic: Expo SDK 57 bundled native module versions
status: VERIFIED
checked: 2026-10-08
recheck_after: 2026-12-07
source: 'computed locally: bundledNativeModules.json in npm pack expo@57.0.27'
tags: [research, area/mobile, tooling]
---

## Fact

Expo SDK 57 (expo 57.0.27) expects react 19.2.3, react-native 0.86.3, expo-router ~57.0.25, react-native-safe-area-context ~5.7.0 and react-native-screens ~4.26.0. npm `latest` for react was 19.3.0, so all apps pin react 19.2.3 to share one copy.

## How it was checked

Extracted `bundledNativeModules.json` from the expo 57.0.27 tarball.

## Used by

- [[ADR-0017-toolchain-version-pins|ADR-0017]]
