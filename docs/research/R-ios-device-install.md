---
topic: Installing a dev build on a physical iPhone (free Apple Account vs Apple Developer Program, Expo Go)
status: TO-VERIFY
checked: '2026-10-17'
recheck_after: '2027-01-15'
source: 'https://developer.apple.com/support/compare-memberships/ (fetched 2026-10-17); web search summaries of https://docs.expo.dev/build/internal-distribution/, https://expo.dev/changelog/expo-go-57-login, https://expo.dev/changelog/expo-go-and-app-store-may-2026 (expo.dev was not reachable from the session)'
tags: [research, area/mobile, store/apple]
---

## Fact

**VERIFIED (Apple, primary):** a free Apple Account in Xcode is a "Personal Team": up to 10 App IDs and 3 devices, each expiring after 7 days; up to 3 apps per device; provisioning profiles expire 7 days after issue, then the app must be rebuilt and reinstalled. It needs Xcode, so a Mac.

**TO-VERIFY (secondary sources only):**

- EAS internal distribution on iOS (ad hoc profile, devices registered with `eas device:create`) and TestFlight need a paid Apple Developer Program membership. Only builds made after a device is registered install on it. Ad hoc allows 100 devices per year (disabled ones still count).
- A Personal Team cannot sign the Sign in with Apple or Push Notifications capabilities. `app.config.ts` always sets `ios.usesAppleSignIn: true`, so a free-team `expo run:ios --device` build would need that switched off first.
- The App Store Expo Go supports SDK 57 (iOS update reported 2026-09-02) and requires being logged in to an Expo account in both the CLI and the app to load a project in development mode.
- Apple Developer Program fee: commonly quoted as US$99 per year (third-party page; not read on Apple's site).

## How it was checked

Apple's compare-memberships page fetched directly. `docs.expo.dev` and `expo.dev` were blocked by the session's network policy, so the Expo facts come from web-search summaries of those pages plus an Expo forum post and third-party blogs: re-read the Expo pages before relying on them.

## Used by

- [[ADR-0033-expo-go-preview-only|ADR-0033]] (Expo Go SDK 57 on iOS)
- [[MOBILE_BUILD]], [[STORE]], [[open-questions]] #12
