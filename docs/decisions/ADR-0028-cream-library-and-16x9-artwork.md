---
id: ADR-0028
title: Cream (light) browsing screens + 16:9 episode artwork
status: accepted
date: 2026-10-09
supersedes: [ADR-0012 ("one dark theme" rule only), DESIGN "Do not use 16:9 covers for audio"]
tags: [adr, area/design, area/mobile]
---

## Context

The client's concept mixes dark listening screens with a cream library screen, and Ganaa prefers that look. The podcaster confirmed (2026-10-09) that his episode pictures are YouTube-style 16:9 thumbnails. [[DESIGN]] said "one dark theme only" and "no 16:9 covers for audio".

## Decision

1. **Two surfaces in the app.** Listening screens stay dark (Welcome, Home, Episode/Player, No-access). Browsing screens are cream: **Сан** first; Хадгалсан and Профайл may follow. Cream tokens: paper `#F1ECE1`, card `#FBF8F2`, ink `#053931` (10.9:1), ink 2 `#3F5F58` (6.0:1), hairline `rgba(5,57,49,.12)`, skeleton `#E5DED0`. Gold is only a fill on cream, never text or a thin icon (contrast too low). The floating tab bar stays dark green on every screen.
2. **16:9 artwork.** Episode pictures are 16:9. Player and "Дараагийн" use 16:9; list rows use a 4:3 center crop; Home hero uses the 16:9 picture. The square-cover rule is dropped. Lock-screen / now-playing artwork uses a center crop.
3. **Player = Episode.** The concept-style player (16:9 picture on top, controls, description, next list) replaces the separate Episode detail screen.

## Alternatives rejected

- **All dark:** safer at night but the client and Ganaa prefer the mixed look.
- **Ask for square covers:** 300 extra images for the podcaster; he already has 16:9.

## Consequences

- `packages/tokens` gets a `cream` color set next to `dark` (same keys, like the admin light theme), and screens choose a surface.
- Night risk: a bright cream screen at night. If testers complain, make cream follow the phone's light/dark setting (dark phone = dark library).
- Admin upload: the episode picture field expects 16:9 (recommend 1280×720); show a 16:9 preview.
- Mockups: `docs/design/v2-screens/Library.dc.html`, `Player.dc.html`.

## Evidence

- Client message 2026-10-09: thumbnails are "just like YouTube" (16:9).
- Contrast ratios computed 2026-10-09 (WCAG formula).
