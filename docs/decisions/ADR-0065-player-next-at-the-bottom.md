---
id: ADR-0065
title: Player: "Дараагийн" moves to the bottom, under "Тайлбар" and the comments (YouTube order)
status: accepted
date: '2026-10-29'
supersedes: [ADR-0049 (only item 1 and 2: where the "Дараагийн" section sits)]
tags: [adr, area/mobile, area/design]
---

## Context

[[ADR-0049-player-next-episode-and-autoplay|ADR-0049]] put the "Дараагийн" row between the controls and the description, so that on a small phone everything down to "Дараагийн" fit without scrolling. Ganaa asked on 2026-10-29 for the YouTube order: the next suggestions at the bottom, below "Тайлбар".

## Decision

1. Order, top to bottom: top bar (chevron and bookmark), 16:9 media, title and meta, scrubber, control row, then the scrolling area: **"Тайлбар", "Сэтгэгдэл" ([[ADR-0061-episode-comments|ADR-0061]]), "Дараагийн"**. Comments sit above the suggestions as on YouTube (ASSUMPTION: the request named only "Тайлбар"; swapping comments and "Дараагийн" is a small change).
2. "Дараагийн" is still one row (16:9 thumbnail, title, meta) with "Бүгд", and "Дараагийн хэсэг" for the next part of a series. Hidden when nothing is next.
3. The autoplay countdown ([[ADR-0049-player-next-episode-and-autoplay|ADR-0049]] item 5) stays in the fixed area under the controls, so it is visible at the moment an episode ends, wherever the member has scrolled. It no longer replaces the "Дараагийн" row.
4. Everything else in ADR-0049 stands (what "next" is, the sleep timer rule, access checks, no prefetching).

## Alternatives rejected

- Keep "Дараагийн" above the description: the old layout; the member asked to change it.
- Show several suggestion rows like YouTube: more rows to load and rank; one row plus "Бүгд" is enough until the client asks.

## Consequences

- The fixed area is shorter, so more of the screen scrolls; "Тайлбар" is visible right under the controls on a 6.1" phone (checked in Expo web at 390 px; a real device is still TO-VERIFY in [[DEVICE_SMOKE]]).
- A member has to scroll past the comments to see the suggestion. Autoplay-next and the "Бүгд" link are unchanged.
- [[DESIGN]] "Player" is updated.
