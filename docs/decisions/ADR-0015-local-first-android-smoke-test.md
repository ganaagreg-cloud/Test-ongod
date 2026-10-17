---
id: ADR-0015
title: Local-first build; Android device smoke test gates further mobile UI
status: superseded by [[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]]
date: 2026-10-08
tags: [adr, area/mobile, area/process]
---

## Context

Native modules (track-player, expo-font) can fail only on real devices, and UI built before that is proven can be wasted.

## Decision

Develop locally first. A native smoke test on a real Android device must pass before more mobile UI is built: dev build installs, fonts render Mongolian, and audio plays with the screen locked.

## Alternatives rejected

- **Building screens first, testing on device later:** expensive rework if native setup fails.

## Consequences

- Next step after the API foundation: Android dev build (Android Studio or EAS, [[R-eas-free-tier]]).
- Feeds the 30% milestone demo ([[approvals]]).

## Evidence

- None external.
