---
id: ADR-0094
title: 'Screen recordings get no sound: pause while the screen is captured (iOS), forbid audio capture (Android)'
status: accepted
date: '2026-11-12'
tags: [adr, area/mobile, area/security]
---

## Context

[[ADR-0085-block-screen-capture-in-player|ADR-0085]] blanks the picture in the Player. Client, 2026-11-12: a screen recording is black but the voice is still recorded, which gives the content away. Also, the mini player keeps playing outside the Player screen, where nothing was blocked.

Facts ([[R-screen-recording-audio]], VERIFIED from the platform docs on 2026-11-12): iOS records the app's sound together with the screen and offers no setting against it; Apple's own advice is to observe `isCaptured` and stop playback. On Android 10+ other apps and the system recorder may record an app's playback unless the app forbids it.

## Decision

1. A small local native module, `apps/mobile/modules/capture-guard` (Expo module, autolinked):
   - **iOS:** reports `isCaptured` and sends an event on `UIScreen.capturedDidChangeNotification` (screen recording, mirroring, AirPlay of the screen).
   - **Android:** when the module loads it calls `AudioManager.setAllowedCapturePolicy(ALLOW_CAPTURE_BY_NONE)` (API 29+). It never reports a capture (Android has no such signal before Android 15).
2. `app.config.ts` also sets `android:allowAudioPlaybackCapture="false"` in the manifest, which holds from the first moment and does not depend on the module.
3. The player controller gets `setCaptureBlocked`. While the screen is captured: playback pauses at once and the position is saved; `open`, `play` and `toggle` refuse with `SCREEN_CAPTURE`; a start from the lock screen or a headset is paused again. When capture ends nothing resumes by itself.
4. `useCaptureGuard` in the signed-in layout applies it in every screen and in the background, re-checks when the app returns to the front, and shows a toast ("Дэлгэц бичлэг эхэлсэн тул тоглуулалтыг зогсоолоо.").
5. Without the native module (web, Expo Go, an older build) everything is a no-op.

## Alternatives rejected

- FairPlay / Widevine DRM: paid, and Apple states the recorder still includes FairPlay audio.
- Blank the picture in every screen: does nothing about the sound.
- Mute instead of pause: the member would lose their place and see a running player with no sound.
- Android 15 `addScreenRecordingCallback`: only the newest phones, needs a permission, and the capture policy already removes the sound.

## Consequences

- **AirPlay screen mirroring and a cable to a TV also pause playback** (they are "captured" for iOS). AirPlay of the sound alone is not affected.
- Not stopped, and cannot be: a second phone or a microphone recording the speaker; the already-known HLS download case ([[open-questions]] #20).
- Android system features that listen to app audio (live captions) will not hear this app.
- Native code that was **not compiled or run in this session** (no Xcode or Android SDK here): a new build and the device checks in [[DEVICE_SMOKE]] are needed. iOS delivery of the event while the app plays in the background is TO-VERIFY on a phone. `isCaptured` is deprecated from iOS 27 in favour of `sceneCaptureState` (a warning, not a break).
- This amends ADR-0085 item 3 (what is not covered).

## Evidence

- [[R-screen-recording-audio]]. Tests: five `capture:` cases in `apps/mobile/test/audio.test.ts` (251/251). `expo-modules-autolinking resolve` lists the module for both platforms; `expo config --type introspect` shows the manifest flag.
