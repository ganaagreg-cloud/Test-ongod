---
id: ADR-0067
title: Player: the whole page scrolls, a slim bar takes over from the controls, "Дараагийн" shows up to 4 rows
status: accepted
date: '2026-10-29'
supersedes: [ADR-0049 (only the "everything above the description is fixed" rule and the one-row "Дараагийн")]
tags: [adr, area/mobile, area/design]
---

## Context

In the Player the picture, title, scrubber and controls were fixed and only the text below scrolled ([[ADR-0049-player-next-episode-and-autoplay|ADR-0049]]). On a small phone that leaves a thin window for "Тайлбар", comments and "Дараагийн". Ganaa asked for the YouTube layout ([[ADR-0065-player-next-at-the-bottom|ADR-0065]]) and then for the two next steps: scroll like YouTube, and more than one suggestion.

## Decision

1. The whole page scrolls: picture, title, scrubber, controls, "Тайлбар", "Сэтгэгдэл", "Дараагийн".
2. When the big controls are half out of view, a slim bar is pinned under the top bar (it overlays the page, so the scroll position never jumps): play / pause, the title, a progress line. It is not shown while the controls are visible, so a short page never gets it.
3. When the autoplay countdown starts ([[ADR-0049-player-next-episode-and-autoplay|ADR-0049]] item 5) the page scrolls back to the top, so the countdown and "Болих" are visible.
4. "Дараагийн" shows up to 4 rows: the next item first (the opening list's next, else the next part of the series, else the next of the category), then more of the category from the API's `next` (already up to 5, oldest first), without repeats and without the open episode. No API change. "Бүгд" and "Дараагийн хэсэг" stay.
5. Rows without access keep the blurred picture. The slim bar has no prices, links or payment text.

## Alternatives rejected

- Shrink the picture while scrolling (animated, like YouTube): more code and easier to get wrong on Android; the pinned slim bar gives the same use. Can be added later.
- Related items beyond the category: needs a ranking in the API; not asked for.

## Consequences

- More of the screen scrolls on a small phone; the scrubber and the speed / skip buttons are not visible while the slim bar is shown (play / pause is).
- Seed data has one next item only, so several rows were not seen in the browser; the row logic has unit tests (`next-rows.test.ts`). A real device is still TO-VERIFY in [[DEVICE_SMOKE]].
- [[DESIGN]] "Player" is updated.
