---
topic: react-native-track-player 4.1.2 on the React Native New Architecture (RN 0.86 / Expo SDK 57)
status: TO-VERIFY
checked: '2026-10-09'
recheck_after: '2026-11-09'
source: '`npx expo-doctor` output on apps/mobile (2026-10-09); node_modules/react-native-track-player/package.json 4.1.2 (no codegenConfig, peer react-native >=0.60.0-rc.2)'
tags: [research, area/mobile, risk]
---

## Fact

- `expo-doctor` check "Validate packages against React Native Directory package metadata" failed for exactly one package: **react-native-track-player: Unsupported on New Architecture**. The other 20 checks passed.
- The installed 4.1.2 has no `codegenConfig` in its `package.json`, so it is a classic (non-TurboModule) native module. On the New Architecture such a module only works through React Native's compatibility layer.
- What is NOT known: whether the interop layer in RN 0.86 runs it correctly (playback, lock-screen controls, background service). Nothing has been built or run on a device yet.

## Consequence

- The player screen (phase 3, [[SPEC]] playback, lock-screen artwork) depends on it ([[ADR-0001-mobile-react-native-expo|ADR-0001]]). It must be proven on a device first: [[DEVICE_SMOKE]] row 1 (loads) and the first player build (plays, pauses, lock screen, background).
- If it fails: look for a newer release or a maintained fork, or a different audio library; that needs a new ADR (never edit ADR-0001).

## Not covered

- Any release notes or issues of the library (not read). Re-check `https://reactnative.directory` and the repo's releases before deciding.

## Used by

[[DEVICE_SMOKE]], [[ADR-0031-mobile-ui-kit-v2-implementation|ADR-0031]]
