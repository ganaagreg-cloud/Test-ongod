---
type: runbook
status: draft
tags: [runbook, area/mobile]
---

# Device gate: Android smoke test of the v2 kit and the audio engine

Decisions: [[ADR-0015-local-first-android-smoke-test|ADR-0015]], [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]], [[ADR-0031-mobile-ui-kit-v2-implementation|ADR-0031]], [[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]] · Build steps: [[MOBILE_BUILD]] · Facts: [[R-motion-libs-sdk-57]], [[R-expo-audio-sdk57]]

**Gate:** phase 3 (tabs, Нүүр, Сан, Player ...) starts only after every row below is checked on a real Android phone. Results go into today's `docs/log/` and the recordings into `docs/screens/device/`.

## Why it has not run yet

The machine that built the kit (2026-10-09) has no Android SDK, no JDK, no `adb`, and EAS is not logged in. Nothing was installed on a phone. What was checked instead: `expo export --platform android` builds the Hermes bundle (release 6.5 MB; a dev bundle contains expo-audio and no track-player), `expo config --type introspect` shows the audio plugin result, `expo-doctor` **21/21** after the audio swap.

**The native modules changed again (react-native-track-player out, expo-audio in): any dev build made before 2026-10-09 evening is out of date. Make a NEW one.**

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

## 2. What the audio rows need

- The API reachable from the phone (`EXPO_PUBLIC_API_URL` = the computer's LAN address, port 3000) with a working Bunny dev zone ([[BUNNY_SWITCH]]).
- A test account with **active access** (admin: grant) and at least one **published episode whose audio is READY** (20 to 40 minutes is best, the 10-minute checks need it).
- Open the dev audio bench: `/dev/audio` in the dev build (deep link `ongod://dev/audio`, e.g. `adb shell am start -a android.intent.action.VIEW -d "ongod://dev/audio"`). It lists episodes, opens one through the signed URL and shows status, position, speed and sleep timer. It is a test bench, not the player screen (phase 3).

## 3. Smoke checklist

Mark each row with the date, device model, Android version and what you saw. Anything that fails: write the symptom, do not guess the cause.

| # | Check | Result |
|---|---|---|
| 1 | App starts: no red screen, no crash, no "native module not found" (Reanimated, worklets, gesture handler, blur, gradient, haptics, image, **expo-audio** all load) | |
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

### Audio (ADR-0032, `/dev/audio`)

| # | Check | Result |
|---|---|---|
| 15 | Open an episode: it loads within about 3 s on mobile data and plays; status goes loading, playing; position and duration advance; an episode with saved progress resumes from it | |
| 16 | **Lock the phone and keep playing for 10+ minutes without touching it.** Audio must not stop at about 3 minutes (the Android limit that the lock-screen controls prevent); note the exact time it ran | |
| 17 | Lock screen / notification shows the title, the artist (category) and the picture, with play / pause | |
| 18 | Lock-screen seek buttons work. **They jump 10 s (fixed by expo-audio), not 15 / 30**; in the app `-15` / `+30` are the real values | |
| 19 | Pause and play from the lock screen; the position in `/dev/audio` follows | |
| 20 | Change speed 1x, 1.25x, 1.5x, 2x while playing: pitch stays natural, no restart, the chip cycles; speed is kept for the next episode | |
| 21 | **Unplug wired headphones / disconnect Bluetooth while playing: playback must pause** | |
| 22 | Another app playing music, then start an episode: the other app pauses (`doNotMix`); a phone call or an alarm interrupts and the episode can be resumed | |
| 23 | Seek far forward and back (scrubbing with `+30` several times, then the 2nd half of the file): no restart from 0, no long stall | |
| 24 | Sleep timer: set 15 m and watch it stop after 15 minutes (or run the 10-minute lock test first and choose `end` near the end): playback pauses, position saved; `end` stops exactly at the end and does not start anything else | |
| 25 | Progress: play 1 minute, force-close the app, reopen `/dev/audio`: the episode shows "saved 1:xx" and resumes there (the admin / API shows the same `positionSec`); finishing an episode marks it completed | |
| 26 | An expired or refused URL: for a user without access the bench shows `NO_ACCESS` (no sound, no crash); after the URL life ends (pause for the full TTL) play fetches a new one and continues at the same position | |
| 27 | Background notification is visible on Android 13+ without a permission prompt; swipe the app away from recents while playing: note what happens (the service keeps playing or stops) | |

## 4. Record

- Screen video or screenshots into `docs/screens/device/` (names like `welcome.mp4`, `code-shake.mp4`, `sheet-drag.mp4`, `reduce-motion.mp4`, `lockscreen.mp4`). Phone screen recorder or `adb shell screenrecord /sdcard/x.mp4` then `adb pull`.
- No personal data in recordings (use e2e/test accounts).
- Log: device, Android version, build type, the tables above, frame-drop notes, crashes with the exact message.

## Known risks to look at first

- **expo-audio 57.0.5 is new to this project:** nothing in rows 15 to 27 has ever run. The first failure there is more likely a setup issue (Bunny URL, access, audio mode) than a design problem: read the status line and error in `/dev/audio` before guessing.
- The OS may not crop a 16:9 lock-screen picture ([[R-expo-audio-sdk57]], not covered); the bench passes the cover URL as it is.
- Gestures inside React Native `Modal` on Android need their own `GestureHandlerRootView` (built in `Sheet`, unverified on a device).
- Blur on Android is intentionally off; if `expo-blur` renders anything there, that is a bug.
