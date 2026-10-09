---
topic: expo-audio in Expo SDK 57 (background playback, lock screen, speed, remote sources)
status: VERIFIED
checked: '2026-10-09'
recheck_after: '2026-12-08'
source: 'https://docs.expo.dev/versions/v57.0.0/sdk/audio.md (fetched 2026-10-09); installed expo-audio 57.0.5 type definitions and Android / iOS sources in node_modules'
tags: [research, area/mobile, area/audio]
---

## Fact (docs, 2026-10-09)

- Install: `npx expo install expo-audio`; config plugin `expo-audio` with `enableBackgroundPlayback` (default `true`: Android media-playback foreground service, iOS `audio` background mode), `microphonePermission` (iOS, `false` disables it), `recordAudioAndroid` (default `true`), `enableBackgroundRecording` (default `false`).
- `setAudioModeAsync`: `playsInSilentMode` (default true), `shouldPlayInBackground` (default false), `interruptionMode` `'doNotMix'` | `'duckOthers'` | `'mixWithOthers'` (default `'mixWithOthers'`; `'doNotMix'` = exclusive audio focus). `interruptionMode` must be `'doNotMix'` for the lock-screen controls to work correctly.
- Player: `createAudioPlayer(source, { updateInterval, downloadFirst, keepAudioSessionActive })`, `play()`, `pause()`, `replace(source)`, `seekTo(seconds)`, `setPlaybackRate(rate)` (Android 0.1 to 2.0, iOS 0.0 to 2.0), `volume`, `currentTime`, `duration`, event `playbackStatusUpdate` (`AudioStatus`: `currentTime`, `duration`, `playing`, `isLoaded`, `isBuffering`, `playbackRate`, `didJustFinish`).
- Remote source: a URL string, or `{ uri, headers }`.
- Lock screen: `setActiveForLockScreen(active, { title, artist, albumTitle, artworkUrl }, { showSeekBackward, showSeekForward, isLiveStream })`, `updateLockScreenMetadata`, `clearLockScreenControls`.
- **Android:** without lock-screen controls active, background playback stops after about 3 minutes (OS limitation), so the controls must always be on while playing. **Only one player can control the lock screen at a time.** Background playback runs a foreground service (`AudioControlsService`); the plugin adds `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- Audio stops automatically when headphones or Bluetooth devices disconnect (docs; to be tested on a device).
- `useAudioPlayer` releases on unmount; `createAudioPlayer` must be released by the caller. The docs list `remove()` for freeing a player (the page also links `release()` from the shared-object docs); the 57.0.5 type definitions have `remove()`, which is what the app would call (it keeps one player for its whole life).

## Fact (installed 57.0.5 sources)

- **Lock-screen seek buttons are fixed at 10 s:** Android `AudioPlayer.kt` `SEEK_JUMP_INTERVAL_MS = 10_000`; iOS `MediaController.swift` `skipForwardCommand/skipBackwardCommand.preferredIntervals = [10.0]`. There is no option to change them, so the design's -15 / +30 is in-app only ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]]).
- Plugin result (`expo config --type introspect`): iOS `UIBackgroundModes: [audio]` once; Android service `expo.modules.audio.service.AudioControlsService` with `foregroundServiceType=mediaPlayback`; no `RECORD_AUDIO`, no microphone usage string when `recordAudioAndroid` and `microphonePermission` are `false`.
- `AudioSource` accepts `null`, so `replace(null)` unloads.

## Not covered (TO-VERIFY on a device, [[DEVICE_SMOKE]])

- Playback of the signed Bunny URL (range requests, token), buffering, seeking in a 20 to 40 minute file.
- The 3-minute background limit really stays away with the controls on; the notification shows on Android 13+ without a notification permission prompt.
- Whether the OS center-crops a 16:9 `artworkUrl` for the lock screen, or a square variant is needed.
- Headphone unplug and Bluetooth disconnect pause; phone calls and other apps' audio (`doNotMix`).

## Used by

[[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], [[DEVICE_SMOKE]]
