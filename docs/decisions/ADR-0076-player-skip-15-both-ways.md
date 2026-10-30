---
id: ADR-0076
title: Player skip is 15 s back and 15 s forward, with the number drawn inside the arrow
status: accepted
date: '2026-10-31'
supersedes: [ADR-0032 (point 9 only: the in-app skip of -15 / +30)]
tags: [adr, area/mobile, area/audio, area/design]
---

## Context

[[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]] point 9 set the in-app skip to -15 / +30. On an iPhone (Ganaa, 2026-10-31) the "30" did not fit inside the round arrow, "15" was crowded against its edge, and the two buttons did not look like a pair. The number was a text laid over the icon.

## Decision

1. Both skips are 15 seconds: `SKIP_BACK_SEC = 15`, `SKIP_FORWARD_SEC = 15`. Labels: "15 секунд ухрах" and "15 секунд урагшлах".
2. The number is part of the icon: `SkipIcon` draws the arrow and the number in one SVG. The back and forward arrows are mirror images (`packages/tokens/src/assets.ts`), the number is centred on the arrow's circle, and its size is a third of the icon box, so it scales with the icon.
3. Touch target, spacing and colors are unchanged (tokens only).
4. The lock-screen buttons stay at 10 s on both platforms: expo-audio fixes them and has no option ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]], point 9).

## Consequences

- Changed: `controller.ts`, `PlayerControls.tsx`, new `src/ui/SkipIcon.tsx`, `mn.ts`, `test/audio.test.ts`, the dev AudioScreen label. [[DESIGN]] "Player" says -15 / +15.
- [[ADR-0049-player-next-episode-and-autoplay|ADR-0049]] still says "-15 ... +30" in its layout text; this ADR replaces that number.
- The fit of the number inside the arrow has to be looked at on a phone.
