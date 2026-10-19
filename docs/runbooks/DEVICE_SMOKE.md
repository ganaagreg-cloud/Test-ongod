---
type: runbook
status: draft
updated: 2026-10-19
tags: [runbook, area/mobile]
---

# Device gate: iPhone first (gate A in Expo Go), then the native build (gate B)

Decisions: [[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]] (replaces the Android-first [[ADR-0015-local-first-android-smoke-test|ADR-0015]]), [[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]], [[ADR-0031-mobile-ui-kit-v2-implementation|ADR-0031]], [[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], [[ADR-0033-expo-go-preview-only|ADR-0033]], [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] · Steps: [[EXPO_GO_PREVIEW]] (gate A), [[MOBILE_BUILD]] (gate B) · Facts: [[R-ios-device-install]], [[R-motion-libs-sdk-57]], [[R-expo-audio-sdk57]], [[R-expo-video-sdk57]]

- **Gate A** (column "A"): the iPhone in **Expo Go**, zero cost. Passing every A row unlocks phase 3 (tabs, Нүүр, Сан, Player ...).
- **Gate B** (column "B"): a **native build** of the app. Free on Android (Android Studio on Windows, or EAS); on iPhone only after joining the Apple Developer Program. Must pass before the 30% milestone demo and any store build.
- Results go into today's `docs/log/`, recordings into `docs/screens/device/`. Anything that fails: write the symptom, do not guess the cause. Lock-screen behaviour seen in Expo Go is a hint only, never a B pass.

## 1. Before you start

- Gate A: follow [[EXPO_GO_PREVIEW]] until the app opens on the iPhone.
- Gate B, Android: `pnpm --filter @ongod/mobile android` (Android Studio, JDK 17, USB debugging) or `! eas build --profile development --platform android`, then `pnpm dev:mobile`. iPhone: [[MOBILE_BUILD]] after the paid program.

## 2. What the audio rows need

- The API reachable from the phone and the **Bunny dev zone** in the root `.env` ([[BUNNY_SWITCH]]); without Bunny the API gives no audio URL.
- **A published episode whose audio is READY** (20 to 40 minutes is best): upload it in the admin on the PC (`http://localhost:5174/admin/`). The seeded episodes have no audio file.
- Test accounts from the seed (password = `SEED_USER_PASSWORD` in `.env`): `demo` and `bat` have access, `tuya`'s access has ended, `saraa` has never paid.
- **A newly registered account has no access** (members only, [[SPEC]]): playing shows `NO_ACCESS`, which is correct (that is row 23). To play with it, give it access in one of three ways:
  1. Simplest: log in on the phone as `demo` or `bat`. If they do not exist yet, run `pnpm --filter @ongod/api db:seed` once (`pnpm dev` runs the migrations but not the seed).
  2. Grant your own account in the admin: `http://localhost:5174/admin/`, sign in as `owner` (`SEED_OWNER_PASSWORD`, no second step: [[ADR-0040-admin-password-only-no-totp|ADR-0040]]), **Хэрэглэгчид** → search the username → open it → **Эрх олгох** → choose a plan → confirm.
  3. The real member path (also tests payment): on the portal `http://localhost:5173`, sign in, choose a plan, note the `ONG-XXXXX` reference, fill the **Төлсөн** form (no real transfer needed locally), then approve it in the admin under payments, or run `pnpm dev:approve ONG-XXXXX`.
- Video rows: the **Bunny Stream** keys in `.env` too ([[BUNNY_SWITCH]] step 3) and **a published episode with a READY video** (upload an `.mp4` in the admin; it stays PROCESSING while Bunny encodes, usually minutes). In the bench a video episode is listed as `[video] …`.
- Open the bench: sign in, then tap **/dev/audio** at the bottom of the **Профайл** tab (dev builds and Expo Go only; `/dev/ui` is next to it). It lists episodes, opens one through the signed URL and shows status, position, speed and sleep timer. It is a test bench, not the player screen.

## 3. Checklist

Mark each row with the date, phone model, iOS / Android version, Expo Go or native build, and what you saw.

| #   | Gate | Check                                                                                                                                                                                                                                                                    | Result |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 1   | A    | App starts: no red screen, no crash, no "native module not found" (Reanimated, worklets, gesture handler, blur, gradient, haptics, image, expo-audio, SecureStore all load)                                                                                              |        |
| 2   | A    | iPhone: Expo Go asks for **Local Network** access → Allow; Login reaches the API. If it fails, write the exact message (plain `http` may be refused, see [[EXPO_GO_PREVIEW]])                                                                                            |        |
| 3   | A    | Welcome: aurora drifts smoothly, cover rows scroll without stutter, mountain line draws itself once, gold button sheen sweeps; Mongolian Ө and Ү render in Lora and Inter                                                                                                |        |
| 4   | A    | Welcome: terms line shows only when `EXPO_PUBLIC_PORTAL_URL` is set and opens `{PORTAL_URL}/terms`                                                                                                                                                                       |        |
| 5   | A    | Email code (`/verify-email`): digits pop, caret blinks, a wrong code shakes the boxes and vibrates, a right code waves. In development the code is in Mailpit on the PC (`http://localhost:8025`), so the keyboard's "From Mail" suggestion only appears with real email |        |
| 6   | A    | Light haptic on every button press (Welcome, Login, chips)                                                                                                                                                                                                               |        |
| 7   | A    | `/dev/ui`: Sheet opens with a spring, drags down, dismisses past 30% or on a fling, backdrop fades; drag works inside the Modal                                                                                                                                          |        |
| 8   | A    | `/dev/ui`: TabBar pill slides between tabs, icon bounces; MiniPlayer equalizer moves while "playing"                                                                                                                                                                     |        |
| 9   | A    | `/dev/ui`: **iPhone shows blur** behind TabBar / MiniPlayer. (Android, gate B: NO blur, solid 96% surface, and the back button closes the Sheet)                                                                                                                         |        |
| 10  | A    | `/dev/ui`: toasts drop from the top, swipe up dismisses, 2 stack with the older one smaller and dimmer                                                                                                                                                                   |        |
| 11  | A    | Reduce motion ON (iPhone: Settings > Accessibility > Motion > Reduce Motion; Android: Remove animations): aurora, rows, sheen, equalizer, shimmer stop; entrances become a plain fade; springs are instant                                                               |        |
| 12  | A    | Reduce motion OFF again: motion returns without restarting the app                                                                                                                                                                                                       |        |
| 13  | A    | App in the background for 10 s, back: ambient loops resume, no crash                                                                                                                                                                                                     |        |
| 14  | A    | Smoothness: Welcome and `/dev/ui` feel fluid; note any janky screen (Expo Go runs a dev bundle, so judge loosely; numbers only in gate B: Android `adb shell dumpsys gfxinfo <package> framestats`)                                                                      |        |
| 15  | A    | Auth on the phone: register, email code, login, forgot / reset password, 3rd device sees DEVICE_LIMIT and can remove one                                                                                                                                                 |        |
| 16  | A    | Session survives: swipe Expo Go away, open the project again: still signed in (SecureStore)                                                                                                                                                                              |        |

### Audio (`/dev/audio`)

| #   | Gate | Check                                                                                                                                                                                        | Result |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 17  | A    | Open an episode: it loads within about 3 s on mobile data and plays; status goes loading, playing; position and duration advance; saved progress resumes                                     |        |
| 18  | A    | iPhone ring/silent switch on silent: the episode still plays (`playsInSilentMode`)                                                                                                           |        |
| 19  | A    | Speed 1x, 1.25x, 1.5x, 2x while playing: natural pitch, no restart, the chip cycles; speed is kept for the next episode                                                                      |        |
| 20  | A    | Seek far forward and back (`+30` several times, then the 2nd half): no restart from 0, no long stall                                                                                         |        |
| 21  | A    | Sleep timer (screen kept on: Settings > Display > Auto-Lock > Never): 15 m pauses after 15 minutes, position saved; `end` stops exactly at the end and starts nothing else                   |        |
| 22  | A    | Progress: play 1 minute, swipe the app away, reopen `/dev/audio`: "saved 1:xx" and resumes there (the API shows the same `positionSec`); finishing marks it completed                        |        |
| 23  | A    | Refused URL: as `tuya` (access ended) or `saraa` (never paid) the bench shows `NO_ACCESS`, no sound, no crash                                                                                |        |
| 24  | A    | URL renewal: pause for longer than the URL life, press play: a new URL is fetched and playback continues at the same position                                                                |        |
| 25  | B    | **Lock the phone and keep playing for 10+ minutes without touching it.** Audio must not stop (Android stops at about 3 minutes without the lock-screen controls); note the exact time it ran |        |
| 26  | B    | Lock screen / notification / iPhone Control Center shows the title, the artist (category) and the picture, with play / pause                                                                 |        |
| 27  | B    | Lock-screen seek buttons work. **They jump 10 s (fixed by expo-audio), not 15 / 30**; in the app `-15` / `+30` are the real values                                                           |        |
| 28  | B    | Pause and play from the lock screen; the position in `/dev/audio` follows                                                                                                                    |        |
| 29  | B    | **Unplug wired headphones / take AirPods out / disconnect Bluetooth while playing: playback must pause**                                                                                     |        |
| 30  | B    | Another app playing music, then start an episode: the other app pauses (`doNotMix`); a phone call or an alarm interrupts and the episode can be resumed                                      |        |
| 31  | B    | Android 13+: the background notification shows without a permission prompt; swipe the app away from recents while playing: note what happens                                                 |        |

### Video (`/dev/audio`, a `[video]` episode)

Option A of [[open-questions]] #17: the sound keeps playing in the background with lock-screen controls; no picture in picture. Background and lock-screen rows need the native build (Expo Go cannot add the `expo-video` plugin options).

| #   | Gate | Check                                                                                                                                                                                                                | Result |
| --- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 36  | A    | Open a video episode: the picture appears above the controls (16:9, rounded), plays within about 5 s on mobile data, sound and picture in sync, also with the ring/silent switch on silent; status line says `VIDEO` |        |
| 37  | A    | The bench's play / pause, `-15` / `+30`, speed and sleep timer act on the video like on audio; saved progress resumes at the right second                                                                            |        |
| 38  | A    | Fullscreen button: the video **turns to landscape**; leaving fullscreen turns the app back to portrait. Rotating the phone on any other screen keeps it portrait                                                     |        |
| 39  | A    | Switch from a video episode to an audio one and back: only one plays at a time, the picture goes away for audio, the speed is kept                                                                                   |        |
| 40  | A    | Quality: on Wi-Fi the picture gets sharp (720p) after a few seconds; on weak mobile data it drops to a lower quality instead of stopping                                                                             |        |
| 41  | B    | **Lock the phone during a video for 10+ minutes**: the sound keeps playing; lock screen / notification shows title, category and picture with play / pause; note the time it ran                                     |        |
| 42  | B    | App in the background (home button) while a video plays: the sound keeps going; back in the app the picture continues at the same position                                                                           |        |
| 43  | B    | The sleep timer stops a video while the phone is locked, and the position is saved                                                                                                                                   |        |

### Phase 3 screens ([[ADR-0039-phase-3-before-gate-a|ADR-0039]])

Built in parallel with gate A. Needs the seeded catalog (`pnpm --filter @ongod/api db:seed`) and, for playing, an account with access (section 2).

| #   | Gate | Check                                                                                                                                                                                                                                                           | Result |
| --- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 44  | A    | Tabs: the pill slides between the four tabs; on Сан the bar turns brand green with a paper pill and the status-bar text turns dark (light again on the other tabs)                                                                                              |        |
| 45  | A    | Нүүр: greeting for the time of day + first name; hero slides advance every 4.8 s and stop while touched; "Шинэ" scrolls sideways; a category card opens Сан filtered; "Энэ 7 хоногт" counts down every second; after scrolling the title moves into a glass bar |        |
| 46  | A    | Player: an episode opens as a sheet (iPhone: drag down closes it); play starts from the saved position; dragging the bar seeks; -15 / +30, speed chip, sleep-timer sheet; "Тайлбар" opens and closes; a "Дараагийн" row opens that episode                      |        |
| 47  | A    | Mini player: shows above the tab bar while an episode is loaded; play / pause works; tapping it opens the Player; after listening, "Үргэлжлүүлэх" on Нүүр resumes it                                                                                            |        |
| 48  | A    | No access (new account): play shows only "Таны эрх идэвхгүй байна" + "Эрхээ шалгах", no price, no link; grant access in the admin, then "Эрхээ шалгах" turns green and "Тоглуулах" plays                                                                        |        |
| 49  | A    | Сан: search filters a moment after typing; chips filter by category; Шинэ / Хуучин / Урт sort; skeleton rows on each change; more rows load at the end; pull down refreshes                                                                                     |        |
| 50  | A    | Bookmark: saving in Сан or in the Player shows in Хадгалсан at once; removing the last one there shows the bookmark dropping onto the mountain line                                                                                                             |        |
| 51  | A    | Профайл: access card ("Идэвхтэй · … хүртэл" with the days-left ring, or "Идэвхгүй"); the numbers roll; Тохиргоо and Төхөөрөмжүүд open                                                                                                                           |        |
| 52  | A    | Тохиргоо: change name or phone and save (Профайл shows it); email change sends a code to the new address and the code finishes it; password change; devices list marks "Энэ төхөөрөмж"                                                                          |        |
| 53  | A    | "Бүртгэл устгах" (throwaway account only): two confirmations, then Welcome; the same login is refused afterwards                                                                                                                                                |        |
| 54  | A    | A video episode in the Player: the picture area is the video, fullscreen turns landscape (as rows 36–40)                                                                                                                                                        |        |

### Social sign-in and push (gate B, only with `SOCIAL_LOGIN=true` and real client IDs)

| #   | Gate | Check                                                                                                                                             | Result |
| --- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| 32  | B    | Google, new account: the Google sheet opens, then "Профайлаа гүйцээнэ үү" with the email as username; after saving, the home screen               |        |
| 33  | B    | Google, email of an existing password user: the LINK_REQUIRED message; the password login still works                                             |        |
| 34  | B    | iPhone: Sign in with Apple works (checks the nonce handling, [[R-expo-apple-authentication]]); Google is shown on iPhone only together with Apple |        |
| 35  | B    | Push: a test push arrives (after push registration is built)                                                                                      |        |

## 4. Record

- Screen video or screenshots into `docs/screens/device/` (names like `welcome.mp4`, `code-shake.mp4`, `sheet-drag.mp4`, `reduce-motion.mp4`, `lockscreen.mp4`). iPhone: Control Center > Screen Recording. Android: phone recorder or `adb shell screenrecord /sdcard/x.mp4` then `adb pull`.
- No personal data in recordings (use the seeded or e2e accounts).
- Log: phone, OS version, Expo Go or native build, the tables above, smoothness notes, crashes with the exact message.

## Known risks to look at first

- Nothing in the audio rows has ever run on a phone. The first failure is more likely setup (Bunny URL, access, network) than design: read the status line and error in `/dev/audio` before guessing.
- Expo Go only opens the newest SDK; if it stops opening this SDK 57 project, gate A needs an SDK upgrade ([[R-ios-device-install]]).
- The OS may not crop a 16:9 lock-screen picture ([[R-expo-audio-sdk57]]); the bench passes the cover URL as it is.
- Gestures inside React Native `Modal` need their own `GestureHandlerRootView` (built in `Sheet`, unverified on a device).
- Video: whether Expo Go on the App Store contains `expo-video` and `expo-screen-orientation` is TO-VERIFY ([[R-expo-video-sdk57]]); if rows 36 to 40 fail with "native module not found", they move to gate B. The iOS landscape turn in fullscreen is a runtime orientation lock (`src/video/orientation.ts`), not yet seen on a device.
