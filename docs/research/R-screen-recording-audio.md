---
topic: What iOS and Android let an app do about sound in a screen recording
status: VERIFIED
checked: '2026-11-12'
recheck_after: '2027-01-11'
source: 'https://developer.apple.com/documentation/uikit/uiscreen/iscaptured (JSON of the page); https://developer.android.com/media/platform/av-capture; computed locally: node_modules/expo-screen-capture 58.0.6 (build/ScreenCapture.d.ts, ios/ScreenCaptureModule.swift)'
tags: [research, area/mobile, area/security]
---

## Fact

**VERIFIED from the platform docs (2026-11-12). Behaviour on a real phone is TO-VERIFY.**

- **iOS.** `UIScreen.isCaptured` is true while "the system is actively recording, mirroring, or using AirPlay to stream the contents of the screen". Apple: FairPlay video is blacked out in a recording but "it includes FPS-encrypted audio content. To prevent the system from recording the audio portion, observe the `isCaptured` property and take appropriate action", for example "stop any current media playback and present a dialog". `UIScreen.capturedDidChangeNotification` posts on a change. `isCaptured` is deprecated from iOS 27 ("Use the sceneCaptureState in UITraitCollection instead"). There is no setting that keeps an app's sound out of a recording.
- **Android.** Since Android 10 other apps can record what an app plays (AudioPlaybackCapture). Apps that target API 29+ allow it by default. `android:allowAudioPlaybackCapture="false"` leaves "system only"; the capture policy `ALLOW_CAPTURE_BY_NONE` (`AudioManager.setAllowedCapturePolicy`) gives "no capture", system components included. The most restrictive of manifest, AudioManager and the player's attributes wins. A policy set at runtime does not affect a player that is already playing.
- **expo-screen-capture 58.0.6** has no JavaScript event for a screen recording (only for screenshots) and no audio control; on iOS it only covers the picture.
- Not preventable on either platform: recording the loudspeaker with a microphone or a second phone.

## How it was checked

WebFetch of the two pages on 2026-11-12 (Apple's page through its JSON data file, because the HTML page is rendered by script). The Expo module was read in `node_modules`. Nothing was run on a phone: whether iOS delivers the notification to an app that plays in the background, and whether every Android vendor's built-in recorder obeys `ALLOW_CAPTURE_BY_NONE`, are TO-VERIFY ([[DEVICE_SMOKE]]).

## Used by

- [[ADR-0094-no-sound-in-screen-recordings|ADR-0094]]
