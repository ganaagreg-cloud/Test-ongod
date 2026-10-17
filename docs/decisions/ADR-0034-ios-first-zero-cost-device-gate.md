---
id: ADR-0034
title: iPhone first at zero cost; device gate split into Expo Go (A) and native build (B)
status: accepted
date: 2026-10-17
supersedes: [ADR-0015, ADR-0033 (only "Expo Go results never count for DEVICE_SMOKE")]
tags: [adr, area/mobile, area/process]
---

## Context

[[ADR-0015-local-first-android-smoke-test|ADR-0015]] made an Android phone test the gate before more mobile UI. Ganaa wants to test on his iPhone first and spend nothing: no Apple Developer Program, and there is no Mac (Windows only). Without both, no native build of this app can be installed on an iPhone ([[R-ios-device-install]]). Expo Go from the App Store is free and runs SDK 57, but it is not our native app: lock-screen audio, Google/Apple sign-in and push are not valid there ([[ADR-0033-expo-go-preview-only|ADR-0033]]).

## Decision

1. Develop locally first (kept from ADR-0015). Device testing starts on Ganaa's iPhone, Android follows.
2. **Zero cost until store submission:** iPhone testing runs in **Expo Go**, with Metro and the API on the Windows PC ([[EXPO_GO_PREVIEW]]). No Apple Developer Program until TestFlight / App Store.
3. **The device gate is split** ([[DEVICE_SMOKE]]):
   - **Gate A (iPhone, Expo Go):** start-up and native modules, fonts with Mongolian Ө/Ү, motion, haptics, gestures, toasts, reduce-motion, the email sign-in flows, the session surviving an app restart, foreground playback through the signed Bunny URL, seek, speed, sleep timer, progress, NO_ACCESS. **Passing gate A unlocks the phase 3 screens.**
   - **Gate B (native build):** 10+ minutes of locked-screen audio, lock-screen controls, headphones out, interruptions, Google and Apple sign-in, push. Free route: an Android development build (Android Studio on Windows, or the EAS free tier, [[R-eas-free-tier]] TO-VERIFY) when an Android phone is available. iPhone native build: only after joining the Apple Developer Program. Gate B must pass before the 30% milestone demo (it shows locked-screen playback, [[approvals]]) and before any store build.
4. Expo Go results count for gate A only. Lock-screen behaviour seen in Expo Go is noted as a hint, never as a pass.

## Alternatives rejected

- **Apple Developer Program now + EAS iOS dev build:** the real iPhone route, but Ganaa does not want to pay yet. It is required for the App Store anyway, so it comes before submission.
- **Mac + Xcode with a free Apple account:** no Mac available; a free team also expires every 7 days and cannot use Sign in with Apple ([[R-ios-device-install]]).
- **Renting a cloud Mac:** costs money.
- **Keep the Android-first gate (ADR-0015):** Ganaa's phone is an iPhone and he wants iOS first.

## Consequences

- Phase 3 (tabs, library, player, saved, profile, delete account, no-access) can start after gate A, before any native build has run. Risk: if background audio fails on a real build, the player may need rework; the engine sits behind the `AudioEngine` interface ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]]), so screens should not change.
- Google and Apple sign-in stay untested on hardware until gate B. The API side is covered by tests with mocked tokens; the complete-profile screen by the web e2e with mocked answers.
- The client's 30% milestone (locked-screen playback) needs gate B; tell the client if it moves.
- Expo Go only runs the newest SDK. If the App Store Expo Go moves past SDK 57 before gate B, the project must upgrade or gate A testing stops (TO-VERIFY, [[R-ios-device-install]]).
- Expo Go needs a free Expo account, signed in both on the PC and in the app (TO-VERIFY).
- The phone reaches the API over plain `http` on the LAN; if iOS refuses it inside Expo Go, use an https tunnel (TO-VERIFY on the phone).
- `app/(app)/home.tsx` shows two dev-only buttons (`/dev/audio`, `/dev/ui`) so the benches can be opened in Expo Go; release builds drop them.

## Evidence

- [[R-ios-device-install]] (free Personal Team limits VERIFIED; Expo Go and EAS facts TO-VERIFY), [[R-eas-free-tier]] (TO-VERIFY).
- Native module versions match SDK 57's `bundledNativeModules.json` (0 mismatches, computed locally 2026-10-17); `expo export --platform ios` builds both the dev and the release bundle.
