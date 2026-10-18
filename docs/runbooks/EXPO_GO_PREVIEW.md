---
type: runbook
status: draft
updated: 2026-10-17
tags: [runbook, area/mobile]
---

# Run the app on the iPhone (or Android) in Expo Go, from Windows

Decisions: [[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]] (Expo Go is gate A, zero cost), [[ADR-0033-expo-go-preview-only|ADR-0033]] · Checklist: [[DEVICE_SMOKE]] · Facts: [[R-ios-device-install]]

Costs nothing: no Apple Developer Program, no Mac. Not valid here (gate B, native build): locked-screen audio, Google / Apple sign-in, push.

## 1. Phone (once)

1. Install **Expo Go** from the App Store (iPhone) or Google Play (Android).
2. Make a free Expo account (expo.dev) and sign in **inside Expo Go**. On the PC: `pnpm --filter @ongod/mobile exec expo login` with the same account. (Expo Go reportedly needs both to open a project in development mode: TO-VERIFY, [[R-ios-device-install]].)

## 2. PC: API, database, emails

1. Root `.env`: the usual values plus the **Bunny dev zone** keys (`BUNNY_*`); without them episodes do not play. `HOST=0.0.0.0` (default) so the phone can reach the API.
2. `pnpm dev` (Docker must be running). It prints the URLs: API `:3000`, admin `:5174/admin/`, Mailpit `:8025` (the email codes land here, not in a real inbox).
3. Find the PC's LAN IP: PowerShell `ipconfig`, **IPv4 Address** of the Wi-Fi adapter, e.g. `192.168.1.23`.
4. Phone and PC on the **same Wi-Fi**. Windows Firewall: allow Node.js on **Private** networks, and set the Wi-Fi to "Private network".
5. **Check from the phone first:** open Safari (or Chrome) on the phone at `http://192.168.1.23:3000/health`. It must answer. If not, fix the network before going on.

## 3. Start the app

1. `apps/mobile/.env` (copy from `.env.example`): `EXPO_PUBLIC_API_URL=http://192.168.1.23:3000` (your IP, port 3000, no `/v1`).
2. Start Metro: `pnpm --filter @ongod/mobile exec expo start --go --clear`
3. **iPhone:** scan the QR code with the normal **Camera** app and tap the banner. **Android:** Expo Go > Scan QR code.
4. iPhone asks "Allow Expo Go to find devices on your local network": tap **Allow** (otherwise neither Metro nor the API can be reached).
5. After any change to `apps/mobile/.env`: stop Metro and start it again with `--clear`.

## 4. Use it

- Register a new account (the 6-digit code is in Mailpit on the PC), or log in as a seeded user: `demo` / `bat` (access), `tuya` (access ended), `saraa` (never paid); password = `SEED_USER_PASSWORD`.
- After login the placeholder home screen shows two dev-only buttons: **/dev/audio** (audio bench) and **/dev/ui** (UI kit).
- For audio: upload and publish an episode with an audio file in the admin first ([[DEVICE_SMOKE]] section 2).
- Work through the gate A rows of [[DEVICE_SMOKE]] and write the results into today's log.

## 5. When something does not connect

| Symptom                                                               | Try                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| QR scan opens nothing / "could not connect to development server"     | Same Wi-Fi? Firewall on Private? Guest / office Wi-Fi blocks devices: `expo start --go --tunnel` (carries Metro only)                                                                                                                                                                            |
| App opens, Safari reaches `/health`, but the app cannot reach the API | Plain `http` may be refused inside the app (TO-VERIFY). Use an https tunnel to port 3000 (for example a free Cloudflare quick tunnel: `cloudflared tunnel --url http://localhost:3000`; TO-VERIFY) and put its `https://...` address in `EXPO_PUBLIC_API_URL`, then restart Metro with `--clear` |
| "Project is incompatible with this version of Expo Go"                | Expo Go moved to a newer SDK; gate A needs an SDK upgrade ([[ADR-0034-ios-first-zero-cost-device-gate                                                                                                                                                                                            | ADR-0034]]) |
| Red screen about a missing native module                              | Tell Claude the module name: it needs the same `isExpoGo` guard as Google / Sentry                                                                                                                                                                                                               |
| Episode list empty or `NO_ACCESS`                                     | Is an episode published with READY audio? Does the user have access? Is Bunny set in `.env`?                                                                                                                                                                                                     |

## What works and what does not

| Works in Expo Go (gate A)                                                                                                           | Not here (gate B, native build)                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Every screen built so far, email login / register / code / reset / device limit, fonts, motion, haptics, blur (iPhone), SecureStore | Google and Apple buttons (hidden in Expo Go)                                 |
| Foreground audio through Bunny: play, seek, speed, sleep timer, progress, NO_ACCESS                                                 | Locked-screen / background audio, lock-screen controls, headphones-out pause |
| Foreground video (if Expo Go contains `expo-video`, TO-VERIFY): picture, controls, fullscreen landscape                             | Video sound in the background and on the lock screen (needs the plugin)      |
|                                                                                                                                     | Push notifications; Sentry (errors go to the console)                        |

## Checked so far

- 2026-10-09: Metro serves the Android bundle with `--go` (HTTP 200).
- 2026-10-17 (from the cloud session, no phone): native module versions match SDK 57 (0 mismatches); `expo export --platform ios` builds the dev and release bundles; the dev buttons are absent from the release bundle.
- 2026-10-18 (cloud session, no phone): with `expo-video` and `expo-screen-orientation` added, `expo export` builds the iOS and web bundles.

| Screen / module                                                 | Android Expo Go | iOS Expo Go |
| --------------------------------------------------------------- | --------------- | ----------- |
| Welcome, fonts, aurora (reanimated, svg, linear-gradient, blur) | ?               | ?           |
| Login / register (SecureStore, Crypto, Device)                  | ?               | ?           |
| Foreground audio (`/dev/audio`)                                 | ?               | ?           |
