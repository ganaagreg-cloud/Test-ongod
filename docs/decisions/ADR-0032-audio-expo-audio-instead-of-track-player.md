---
id: ADR-0032
title: Audio — expo-audio instead of react-native-track-player
status: accepted
date: 2026-10-09
supersedes: [ADR-0001 (the react-native-track-player part only)]
tags: [adr, area/mobile, area/audio]
---

> Numbering: Ganaa asked for "ADR-0029"; that number is already the admin app ([[ADR-0029-admin-app-implementation|ADR-0029]]), so this is the next free one. CLAUDE.md names ADR-0032.

## Context

[[ADR-0001-mobile-react-native-expo|ADR-0001]] chose react-native-track-player (RNTP) for audio. The app now runs on Expo SDK 57 / React Native 0.86 (New Architecture). Facts ([[R-track-player-new-arch]]):

- RNTP 4.1.2 (installed) is listed as **unsupported on the New Architecture** by React Native Directory (`expo-doctor` failed that one check) and ships no codegen.
- RNTP v5 (`@rntp/player`) is built for the New Architecture but is **free for non-commercial use only; commercial use needs a paid license** (README 5.7.0, rntp.dev/pricing). Онгод is a paid product.
- expo-audio (SDK 57, [[R-expo-audio-sdk57]]) documents background playback, lock-screen controls (`setActiveForLockScreen`, with seek back / forward buttons), `setPlaybackRate` up to 2.0 on Android, `seekTo`, and remote URL sources. It ships with Expo, so there is no extra license and no version drift.

## Decision

1. **Replace react-native-track-player with expo-audio** (`~57.0.5`); track-player is removed from `apps/mobile`.
2. Config plugin: `['expo-audio', { enableBackgroundPlayback: true, microphonePermission: false, recordAudioAndroid: false }]`. The app never records, so no microphone / `RECORD_AUDIO`. Verified through `expo config --type introspect`: iOS `UIBackgroundModes: [audio]`, Android `AudioControlsService` (`foregroundServiceType=mediaPlayback`) + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
3. Audio mode (once): `playsInSilentMode: true`, `shouldPlayInBackground: true`, `interruptionMode: 'doNotMix'` (exclusive focus; required for the lock-screen controls to work).
4. **One player for the whole app** (`createAudioPlayer`, new episodes `replace`d into it): the OS gives the lock screen to one player only.
5. **Lock-screen controls are switched on with every `play()`** and stay on while paused (`src/audio/engine.ts`): without them Android ends background playback after about 3 minutes. They are removed only by `unload()`.
6. Layers (all behind `AudioEngine`, `src/audio/types.ts`): `engine.ts` (expo-audio, native), `engine.web.ts` (stub for the browser preview), and platform-free logic that is unit-tested: `controller.ts` (signed URL + refresh before expiry, play / pause / seek / skip, speed, sleep timer, progress), `rates.ts` (1, 1.25, 1.5, 2), `sleepTimer.ts` (15 / 30 / 45 min or end of episode, in JS), `progress.ts`.
7. **Progress** goes to `PUT /v1/progress/:episodeId` ([[ADR-0021-catalog-and-playback-rules|ADR-0021]]): every 15 s while playing and at once on pause, seek, end, sleep stop, episode switch and close; one request in flight (a newer position waits, so saves cannot arrive out of order); `completed` when the episode ends or is within 10 s of the end.
8. The signed play URL (`POST /v1/episodes/:id/play`) is a bearer credential: never logged, never in the controller state; a new one is requested when less than 60 s of its life is left.
9. **In-app skip is -15 / +30** (the design). The **lock-screen buttons are fixed at 10 s on both platforms** by expo-audio (Android `SEEK_JUMP_INTERVAL_MS = 10_000`, iOS `preferredIntervals = [10.0]`, read in the 57.0.5 sources); the API has no option for it. The design's -15 / +30 therefore exists in the app only.
10. Lock-screen picture = a square-ish center crop of the 16:9 artwork, passed as `artworkUrl`. Producing that crop (a Bunny image variant or a server-made square) is a phase 3 task; whether the OS crops a 16:9 picture itself is not known.

## Alternatives rejected

- **Stay on RNTP 4.1.2:** not New-Architecture ready on RN 0.86; would only work through the compatibility layer, unproven and unmaintained for it.
- **RNTP v5 (`@rntp/player`):** New-Architecture ready, but a paid commercial license for a commercial product, plus a vendor dependency.
- **Other audio libraries:** not researched; expo-audio covers every item in [[SPEC]] (background, lock screen, speed, seek, remote URL).

## Consequences

- **A new native module set: a NEW development build is required** before any device test (`eas build --profile development --platform android`, [[DEVICE_SMOKE]]).
- Lock-screen seek is 10 s, not 15 / 30 (item 9). Tell the client if it matters.
- No native queue / next-track: the app owns "Дараагийн" and the sleep timer in JS.
- Headphones: expo-audio says audio stops when headphones or Bluetooth disconnect; to be checked on a device.
- The `no-payment-text` guard forbids the English word "subscribe", so listener registration is `onChange(...)` throughout `src/audio`.
- [[R-track-player-new-arch]] is closed by this ADR; ADR-0001 stays as written (its audio line is superseded here).

## Evidence

- Expo docs (SDK 57) https://docs.expo.dev/versions/v57.0.0/sdk/audio.md and the RNTP 5.7.0 README, both read 2026-10-09 ([[R-expo-audio-sdk57]], [[R-track-player-new-arch]]).
- `npx expo-doctor` on apps/mobile: 21/21 after the swap (20/21 before); `expo export --platform android` builds (release 6.5 MB hbc, and a dev bundle that contains expo-audio and no track-player).
- Unit tests `apps/mobile/test/audio.test.ts` (23): speeds, sleep timer, progress saving incl. ordering and retry, controller with a fake engine, endpoints.
- Not yet on a device: playback, lock screen, background, 3-minute limit, headphones ([[DEVICE_SMOKE]]).
