---
id: ADR-0055
title: The app registers an Expo push token per signed-in device; a Профайл switch turns push off on that device
status: accepted
date: '2026-10-28'
tags: [adr, area/mobile, area/backend]
---

## Context

The API sends push on publish, 14 days before access ends and when access turns active (SPEC D, F, G; [[ADR-0042-content-organisation-and-publish-push|ADR-0042]]) to `Device.pushToken`, but nothing ever stored a token, so no push arrived ([[AUDIT-2026-10-27]] item 2). DESIGN lists a notification switch on Профайл. [[open-questions]] #27 parked push registration for gate B.

## Decision

1. **API:** `PUT /v1/me/push-token` with `{ token: ExpoPushToken | null }` (204). It writes the token on the device of the calling session. The same token on any other device row (another account signed in earlier on the same phone) is cleared first, so a phone gets one account's pushes. `null` clears it. Logout already deletes the device row ([[ADR-0018-auth-implementation-details|ADR-0018]] item 3).
2. **When the app asks:** after sign-in, once, only while the system permission is still undetermined; never before sign-in. Android gets a "default" channel first.
3. **When the app registers:** on every signed-in start (tokens can change) and when the system reports a new token. Failures (offline, no permission) are silent and retried on the next start.
4. **Skipped** in Expo Go, on web, on simulators, and when the build has no EAS project id (`EAS_PROJECT_ID` at build time).
5. **Профайл switch "Мэдэгдэл":** per device. Off stores a local flag and clears the token on the server; on asks (or opens the system settings when the system blocks it) and registers.
6. **Tap:** a push with `episodeId` opens the Player. Foreground pushes show as a banner without sound.
7. **Build:** the `expo-notifications` plugin; `EAS_PROJECT_ID` → `extra.eas.projectId`; `GOOGLE_SERVICES_FILE` → `android.googleServicesFile` when set. Credentials: [[R-expo-notifications-sdk57]] (TO-VERIFY parts).

This answers the registration part of [[open-questions]] #27; the bell and "Сануулах" stay open.

## Alternatives rejected

- Ask for permission on first start: before sign-in the app cannot store the token, and an early prompt is denied more often.
- Token in the login request: the token arrives later (permission, network) and changes over time.
- A server-side per-user "notifications off" flag: one switch per phone is enough and needs no schema change.

## Consequences

- New dependency `expo-notifications` (native: a new development build is needed; push does nothing in Expo Go).
- First real push needs the EAS project, FCM and APNs credentials ([[MOBILE_BUILD]]); gate B checks delivery ([[DEVICE_SMOKE]]).
- Tests: the route's access rules and token moves; the app's registration rules as pure functions.

## Evidence

- [[R-expo-notifications-sdk57]], [[R-expo-push-api]].
