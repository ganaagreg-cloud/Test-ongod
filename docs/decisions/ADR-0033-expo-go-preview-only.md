---
id: ADR-0033
title: Expo Go allowed for preview only
status: accepted
date: 2026-10-09
tags: [adr, area/mobile, tooling]
---

## Context

[[CLAUDE]] says the mobile app runs as a dev build, not Expo Go, because the app uses native modules Expo Go does not contain (Google sign-in, Sentry native, background audio). Ganaa wants to look at screens quickly on a real phone without building first.

## Decision

1. **Expo Go may be used to preview screens only.** Testing and release stay on the dev build / store builds ([[MOBILE_BUILD]], [[DEVICE_SMOKE]]). The CLAUDE.md rule is unchanged for everything else.
2. `src/lib/expoGo.ts` exports `isExpoGo` (`Constants.executionEnvironment === 'storeClient'`).
3. In Expo Go:
   - `@react-native-google-signin/google-signin` is never imported at the top of a file; `social.ts` loads it with `import()` only when not in Expo Go, and `googleConfigured` is `false`, so the Google button is hidden. Email login works.
   - Sign in with Apple is hidden too (`isAppleAvailable()` is `false`): Expo Go signs with its own bundle id, so the token would not match the API's expected audience (reasoning, not tested on a device).
   - `@sentry/react-native` is `require`d lazily, only outside Expo Go; in Expo Go errors go to `console.warn`.
4. Start command: `pnpm --filter @ongod/mobile exec expo start --go` ([[EXPO_GO_PREVIEW]]).

## Not valid in Expo Go

Lock-screen / background audio, the 3-minute Android limit, push notifications, Google and Apple sign-in, Sentry. Results from Expo Go never count for [[DEVICE_SMOKE]].

## Consequences

- Production behaviour is unchanged: outside Expo Go every code path is as before (Google configured as before, Sentry on with a DSN).
- Expo Go in the stores tracks the newest SDK only; it may stop opening an SDK 57 project soon after SDK 58 is stable (ASSUMPTION, TO-VERIFY before relying on it). The dev build is not affected.
- The `expo-dev-client` package stays installed; it is simply not used inside Expo Go.
