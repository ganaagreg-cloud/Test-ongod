---
topic: expo-video in SDK 57 (background, now playing, PiP, fullscreen, HLS)
status: VERIFIED
checked: '2026-10-18'
recheck_after: '2026-12-17'
source: 'computed locally: expo/bundledNativeModules.json (expo 57.0.27) and the type definitions in `npm pack expo-video@57.0.5`'
tags: [research, area/mobile, area/media]
---

## Fact

- SDK 57 expects `expo-video` ~57.0.5, `expo-screen-orientation` ~57.0.2 and `expo-screen-capture` ~57.0.4. Installed in `apps/mobile` (2026-10-18): `expo-video` ~57.0.5 and `expo-screen-orientation` ~57.0.3.
- **Background:** `player.staysActiveInBackground` (default false) works only with the config plugin option `supportsBackgroundPlayback: true`. `showNowPlayingNotification` (iOS + Android, default false) also needs that plugin option on Android.
- **Picture in Picture:** `allowsPictureInPicture` / `startsPictureInPictureAutomatically` need the plugin option `supportsPictureInPicture`.
- **Fullscreen:** `enterFullscreen()`, `onFullscreenEnter/Exit`, `fullscreenOptions`; the fullscreen `orientation` option is **Android only**. On iOS the app's own orientation setting applies (the app is `portrait` today).
- **HLS:** on iOS the source URI must contain `.m3u8` or set `contentType: 'hls'`; the cache cannot be used with HLS on iOS.
- **Loading:** `replace()` is synchronous and warns on iOS that it can block the UI; `replaceAsync()` is the recommended form (equal to `replace` on Android and web).
- **Orientation plugin:** `expo-screen-orientation` takes `initialOrientation` (iOS only, writes `EXDefaultScreenOrientationMask`); `expo config --type introspect` with `orientation: 'default'` gives all four iOS orientations plus the portrait start mask.

Not checked here: whether the App Store Expo Go contains expo-video (expected for an SDK module, TO-VERIFY on the phone). Config-plugin features (background, PiP) cannot work in Expo Go, which cannot add plugins.

## How it was checked

`node -e` over `expo/bundledNativeModules.json`; `npm pack expo-video@57.0.5` into the scratchpad and read `build/VideoPlayer.types.d.ts`, `build/VideoView.types.d.ts`, `plugin/build/withExpoVideo.d.ts`.

## Used by

- [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (accepted)
