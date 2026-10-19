---
id: ADR-0039
title: Phase 3 screens built now, in parallel with gate A; personal info edit
status: accepted
date: '2026-10-19'
supersedes: [ADR-0034 (only "Passing gate A unlocks the phase 3 screens")]
tags: [adr, area/mobile, area/backend, area/process]
---

## Context

[[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]] made gate A (iPhone, Expo Go) the condition for the phase 3 screens. On 2026-10-19 gate A is partly run: sign-up, login and password reset pass; `/dev/ui` crashed and is fixed (`87952c2`), not yet re-checked; the audio rows were blocked by a test account without access (now documented in [[DEVICE_SMOKE]]). Ganaa decided to build phase 3 now and keep testing on the phone in parallel ("we can fix what we did later"), and asked that members can edit their personal information and that the screens have what they need (categories, search, ...).

## Decision

1. **Phase 3 is built now, in parallel with gate A.** Gate A results turn into fixes, not a stop. Gate B (native build) is unchanged: before the 30% demo and any store build. This replaces only the line "Passing gate A unlocks the phase 3 screens" of ADR-0034.
2. **Order** (Ganaa, 2026-10-18): tabs + Нүүр + Player (mini player, no-access state), then Сан, Хадгалсан, Профайл / Тохиргоо.
3. **Navigation:** expo-router `Tabs` (its bundled tab navigator, no new dependency) with the kit's `TabBar` as the tab bar, floating over the screens; `MiniPlayer` docked above it while an episode is loaded. The Player is a modal route: on iOS a page sheet that closes with a drag down ([[DESIGN]] Player), on Android a full-screen slide. No bottom-sheet library ([[DESIGN]] "Do not").
4. **Personal information:** new `PATCH /v1/me` changes first name, last name and phone with the sign-up rules (SPEC A). The username stays read-only in the app: it is a login identifier and may be written in bank transfer descriptions (SPEC D). Email keeps the existing change + code flow, password the existing change flow.
5. **Profile numbers:** new `GET /v1/me/stats`: episodes finished (progress rows marked completed) and listening time (for each progress row: the episode's duration if completed, else the saved position). An approximation, not a play log.
6. **Next release:** `GET /v1/home` gains `nextRelease`: the earliest scheduled episode due within 7 days (title, category, time), for the "Энэ 7 хоногт" countdown card. Nothing playable is exposed before publishing.
7. **Left out until their backend exists** (instead of buttons that do nothing): the bell and notification list, "Сануулах" on the next-release card, the notification switch (all need push), and "Тусламж" (no support contact chosen).

## Alternatives rejected

- **Wait for gate A to pass first (ADR-0034):** Ganaa chose to build in parallel.
- **A bottom-sheet library for the Player:** forbidden by DESIGN; the native modal sheet gives the drag-to-close on iOS.
- **Headless `expo-router/ui` tabs:** more code for the same result; the stock `Tabs` accepts a custom tab bar.
- **Editable username:** it is used to log in and to match bank transfers; changing it can break both. Can be added later with an ADR.
- **A play log for exact listening hours:** a new table and writes on every play; the approximation from saved progress is enough for the profile.

## Consequences

- If gate A or B finds a device problem (audio, gestures, blur), screens may need rework; playback stays behind the `AudioEngine` interface ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]]), so the screens should not change for an engine fix.
- New device-check rows for the tabs, Player, no-access sheet, Сан, Хадгалсан and Профайл in [[DEVICE_SMOKE]].
- Two new endpoints and one new field, each with zod validation and tests for the access rules (CLAUDE.md).
- Notifications, reminders and help come back as tasks once push ([[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]] gate B) and a support contact exist ([[open-questions]] #26, #27).
- The dev-only `/dev/audio` and `/dev/ui` buttons move from the old placeholder home to the bottom of Профайл (release builds still drop them).

## Evidence

- Gate A results so far: [[2026-10-18]], [[2026-10-19]].
- expo-router 57.0.25 ships the tab navigator in `expo-router/build/react-navigation/bottom-tabs` (read locally from `node_modules`, 2026-10-19).
