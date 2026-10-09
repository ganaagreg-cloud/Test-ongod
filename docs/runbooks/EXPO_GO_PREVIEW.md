---
type: runbook
status: draft
tags: [runbook, area/mobile]
---

# Preview the app in Expo Go (Windows)

Decision: [[ADR-0033-expo-go-preview-only|ADR-0033]]. **Preview only.** Testing and release use the dev build ([[MOBILE_BUILD]], [[DEVICE_SMOKE]]).

## 1. Phone

Install **Expo Go** from the App Store (iPhone) or Google Play (Android).

## 2. Network

1. Phone and PC on the **same Wi-Fi**.
2. Find the PC's LAN IP: open PowerShell, run `ipconfig`, and read **IPv4 Address** under your Wi-Fi adapter (for example `192.168.1.23`).
3. In `apps/mobile/.env` set `EXPO_PUBLIC_API_URL=http://192.168.1.23:3000` (your IP, port 3000). Plain `http` is fine for preview.
4. The API must listen on all interfaces: `HOST=0.0.0.0` in the root `.env` (already the default in `.env.example`). Start it with `pnpm dev`.
5. If the phone cannot reach the API, allow Node.js through Windows Firewall for **Private** networks (the prompt appears the first time), and make sure the Wi-Fi is set to "Private network".

## 3. Start Metro

```powershell
pnpm --filter @ongod/mobile exec expo start --go
```

If the Wi-Fi blocks the connection (guest or office network, "client isolation"), use:

```powershell
pnpm --filter @ongod/mobile exec expo start --go --tunnel
```

A tunnel only carries Metro. The phone still reaches the API through `EXPO_PUBLIC_API_URL`, so that address must be reachable from the phone (same Wi-Fi, or a public address).

## 4. Open it

- **iPhone:** scan the QR code with the normal **Camera** app, tap the banner.
- **Android:** open **Expo Go**, tap **Scan QR code**, scan the QR code.

## What works and what does not

| Works | Hidden or off in Expo Go |
|---|---|
| Welcome, email login / register / code / reset, layout, motion, fonts, Mongolian text | Google button, Sign in with Apple button |
| Foreground audio playback (to be checked) | Sentry (errors go to the console) |
| | Lock-screen and background audio, push |

## Limits

- Preview only. Do not record device-test results from Expo Go.
- Lock-screen / background audio tests are **not valid** here; they need the dev build ([[DEVICE_SMOKE]]).
- The Expo Go app in the stores may stop opening SDK 57 projects soon after SDK 58 is stable (ASSUMPTION, TO-VERIFY). Then use the dev build.
- Phone shows a red screen about a missing native module: tell me which one, it needs the same `isExpoGo` guard.

## Checked so far

- Metro serves the Android bundle with `--go` (14.9 MB dev bundle, HTTP 200), 2026-10-09.
- **Not yet checked on a phone** (no device available to Claude): Android Expo Go, iOS Expo Go. Fill in below after the first scan.

| Screen / module | Android Expo Go | iOS Expo Go |
|---|---|---|
| Welcome, fonts, aurora (reanimated, svg, linear-gradient, blur) | ? | ? |
| Login / register (SecureStore, Crypto, Device) | ? | ? |
| Foreground audio (`/dev/audio`) | ? | ? |
