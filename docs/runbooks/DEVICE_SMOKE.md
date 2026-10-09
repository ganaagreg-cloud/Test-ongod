---
type: runbook
status: draft
tags: [runbook, area/mobile]
---

# Device gate: Android smoke test of the v2 kit

Decisions: [[ADR-0015-local-first-android-smoke-test|ADR-0015]], [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]], [[ADR-0031-mobile-ui-kit-v2-implementation|ADR-0031]] · Build steps: [[MOBILE_BUILD]] · Facts: [[R-motion-libs-sdk-57]], [[R-track-player-new-arch]]

**Gate:** phase 3 (tabs, Нүүр, Сан, Player ...) starts only after every row below is checked on a real Android phone. Results go into today's `docs/log/` and the recordings into `docs/screens/device/`.

## Why it has not run yet

The machine that built the kit (2026-10-09) has no Android SDK, no JDK, no `adb`, and EAS is not logged in. Nothing was installed on a phone. What was checked instead: `expo export --platform android` builds the Hermes bundle (6.5 MB), `expo config --type prebuild` resolves the plugins, `expo-doctor` 20/21 (the one warning is track-player, see below).

## 1. Build (pick one)

**A. Local** (needs Android Studio with an SDK, JDK 17, USB debugging on, `adb devices` lists the phone):

1. `apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<computer LAN IP>:3000` (phone and computer on the same Wi-Fi), `EXPO_PUBLIC_PORTAL_URL=` empty or the LAN portal.
2. `pnpm --filter @ongod/mobile android` (= `expo run:android`, builds and installs a development build with the new native modules).
3. `pnpm dev:mobile` for Metro, open the installed app.

**B. EAS cloud build** (needs `eas login` with the owner's Expo account, a first-time project link and Android keystore prompts; type these yourself with the `!` prefix):

1. `! eas login`
2. `! eas build --profile development --platform android`
3. Open the build page, install the `.apk` on the phone.
4. `pnpm dev:mobile` and open the app; Metro must be reachable from the phone.

## 2. Smoke checklist

Mark each row with the date, device model, Android version and what you saw. Anything that fails: write the symptom, do not guess the cause.

| # | Check | Result |
|---|---|---|
| 1 | App starts: no red screen, no crash, no "native module not found" (Reanimated, worklets, gesture handler, blur, gradient, haptics, image, track player all load) | |
| 2 | Welcome: aurora drifts smoothly, cover rows scroll without stutter, mountain line draws itself once, gold button sheen sweeps | |
| 3 | Welcome: terms line shows only when `EXPO_PUBLIC_PORTAL_URL` is set and opens `{PORTAL_URL}/terms` | |
| 4 | Email code (`/verify-email`): digits pop, caret blinks, a wrong code shakes the boxes and vibrates (error), a right code waves | |
| 5 | Light haptic on every button press (Welcome, Login, chips) | |
| 6 | `/dev/ui` (dev build): Sheet opens with a spring, drags down, dismisses past 30% or on a fling, backdrop fades; Android back closes it; drag works inside the Modal | |
| 7 | `/dev/ui`: TabBar pill slides between tabs, icon bounces; MiniPlayer equalizer moves while "playing" | |
| 8 | `/dev/ui`: Android shows NO blur on TabBar / MiniPlayer (solid 96% surface), iOS-style blur is not attempted | |
| 9 | `/dev/ui`: toasts drop from the top, swipe up dismisses, 2 stack with the older one smaller and dimmer | |
| 10 | Reduce-motion ON (Settings > Accessibility > Remove animations): aurora, rows, sheen, equalizer, skeleton shimmer stop; entrances become a plain fade; springs are instant | |
| 11 | Reduce-motion OFF again: motion returns without restarting the app | |
| 12 | App in the background for 10 s, back: ambient loops resume, no crash | |
| 13 | Frame drops: Welcome and `/dev/ui` feel at 60 fps; note any janky screen. Optional numbers: `adb shell dumpsys gfxinfo <package> framestats` after 30 s on the screen (jank % and 90th percentile frame time) | |
| 14 | Auth flow on the phone: register, code, login, device limit (SecureStore, keyboard, `CodeInput` suggestion) | |

## 3. Record

- Screen video or screenshots into `docs/screens/device/` (names like `welcome.mp4`, `code-shake.mp4`, `sheet-drag.mp4`, `reduce-motion.mp4`). Phone screen recorder or `adb shell screenrecord /sdcard/x.mp4` then `adb pull`.
- No personal data in recordings (use e2e/test accounts).
- Log: device, Android version, build type, the table above, frame-drop notes, crashes with the exact message.

## Known risks to look at first

- **react-native-track-player 4.1.2 on the New Architecture:** `expo-doctor` lists it as unsupported (React Native Directory) and the package ships no codegen, so it runs through the interop layer ([[R-track-player-new-arch]], TO-VERIFY). Row 1 must show the app starting with it linked; audio itself is tested in phase 3.
- Gestures inside React Native `Modal` on Android need their own `GestureHandlerRootView` (built in `Sheet`, unverified on a device).
- Blur on Android is intentionally off; if `expo-blur` renders anything there, that is a bug.
