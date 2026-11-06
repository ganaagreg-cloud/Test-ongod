---
id: ADR-0085
title: 'Block screenshots and screen recording while the player is open'
status: accepted
date: '2026-11-05'
tags: [adr, area/mobile, area/security]
---

## Context

Open question #20 (piracy) listed screenshot blocking as a cheap mitigation; [[R-bunny-stream]] says token auth cannot stop screen recording. The owner said on 2026-11-05 that the anti screen recording protection was forgotten.

## Decision

1. The player screen (audio and video episodes) calls `usePreventScreenCapture()` from `expo-screen-capture` (`~58.0.6`). Android sets `FLAG_SECURE`; iOS blanks the picture in screenshots and recordings (behaviour on iOS is TO-VERIFY on a device).
2. Only the player is covered, not lists, so members can still screenshot the library.
3. Not covered: a second phone filming the screen, and the already-known HLS download case. No paid DRM, no watermark (still open in #20).

## Consequences

- New dependency: INSTALL FIRST, then a new dev build (native module).
- Side effect: Android recent-apps thumbnail of the player is blank.
