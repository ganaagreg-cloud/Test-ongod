---
id: ADR-0048
title: 'Upgrade the mobile app to Expo SDK 58 (react-native 0.88, React 19.3.0 in every app)'
status: accepted
date: 2026-10-24
supersedes: [ADR-0017 (only the React 19.2.3 pin), ADR-0033 and ADR-0034 (only the premise "Expo Go runs SDK 57")]
tags: [adr, area/mobile, tooling]
---

## Context

On 2026-10-24 Ganaa's iPhone refused to open the project in Expo Go: the App Store Expo Go is SDK 58 and the project is SDK 57. iOS cannot install an older Expo Go, only the latest ([[R-expo-sdk-58-versions]], user-reported message, TO-VERIFY on expo.dev). Gate A of [[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]] (iPhone in Expo Go, zero cost) is therefore blocked, and it will break again at every new SDK while the project stays on the older one. [[DEVICE_SMOKE]] already says "if it stops opening this SDK 57 project, gate A needs an SDK upgrade".

## Decision

1. Move `apps/mobile` to **Expo SDK 58**: `expo` ~58.0.19, `react-native` 0.88.0, every `expo-*` and native library to the version in `bundledNativeModules.json` of expo 58.0.19 ([[R-expo-sdk-58-versions]]), installed with `expo install --fix`, not by hand.
2. **React 19.3.0 in every app** (admin, portal, mobile, `packages/ui-web`): SDK 58 requires it, and the monorepo keeps one React copy ([[ADR-0017-toolchain-version-pins|ADR-0017]] reason). `@types/react` follows.
3. Handle the major bumps deliberately, each checked by the existing tests and a Metro bundle: `react-native-gesture-handler` 2 to 3, `@sentry/react-native` 7 to 8, `react-native-worklets` 0.10 to 0.13, `react-native-reanimated` 4.5 to 4.7, `expo-audio` and `expo-video` ~58 (the audio and video engines are the risk, [[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], [[ADR-0038-video-episodes-bunny-stream|ADR-0038]]).
4. Nothing else changes: the rules of [[ADR-0033-expo-go-preview-only|ADR-0033]] (Expo Go for preview only, native modules guarded by `isExpoGo`) and the gates of ADR-0034 stay; only the SDK number they assume moves from 57 to 58. Old SDK 57 notes keep their dates; `R-*-sdk57` notes get SDK 58 successors only where the upgrade touches them.
5. The upgrade lands on its own branch step: dependency change first, then fixes, then the full test and typecheck run. The user must **INSTALL FIRST** after the dependency change (`pnpm install`).

## Alternatives rejected

- **Stay on SDK 57 and use an Android phone:** the Android SDK 57 Expo Go APK still works, but Ganaa's phone is an iPhone ([[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]]).
- **Apple Developer Program + EAS iOS dev build now:** the real long-term route, needed before the App Store anyway, but costs money now and Ganaa chose not to pay yet. It stays the plan for gate B.
- **Browser preview only:** audio and video are stubs in the web build ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]]), so it cannot test the product's main feature.
- **Upgrade only mobile and keep React 19.2.3 elsewhere:** two React copies break the hoisted monorepo (flat `node_modules` for Metro).

## Consequences

- Expect changes in `apps/mobile` and a dependency-only change (React 19.3.0) in `apps/admin`, `apps/portal`, `packages/ui-web`; `pnpm-lock.yaml` changes a lot.
- Gate A can be tried again on the iPhone in Expo Go; Expo Go tracks the latest SDK, so this repeats at the next SDK ([[R-ios-device-install]]). A native dev build (gate B) removes that dependency.
- Re-check [[R-expo-audio-sdk57]], [[R-expo-video-sdk57]] and [[R-motion-libs-sdk-57]] against SDK 58 when the upgrade touches them; their `recheck_after` dates stand.
- Not yet verified: that every screen, the audio engine and the video engine behave the same on SDK 58 on a device. The tests and the Metro bundle only prove it compiles and passes.

## Evidence

- [[R-expo-sdk-58-versions]]
- [[R-expo-sdk-57-versions]] (the previous state)
- [[R-ios-device-install]] (its "Expo Go supports SDK 57" line is overtaken)
