---
id: ADR-0101
title: 'The browsing screens (Сан, series, playlist) are white, not cream'
status: accepted
date: '2026-11-13'
tags: [adr, area/mobile, area/design]
---

## Context

[[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] and [[DESIGN]] make the browsing screens cream: page `#F1ECE1`, cards `#FBF8F2`. The client asked on 2026-11-13 for the cream on the Сан screen to be white (relayed by Ganaa: "that cream things on сан screen as white"). Colours are the client's choice. This conflicts with DESIGN and ADR-0028, so it is recorded here, and the DESIGN colour line was changed with the owner's go-ahead.

## Decision

1. In `packages/tokens/src/index.ts` the `cream` theme becomes white: page `#FFFFFF` (was `#F1ECE1`), card and raised card `#FFFFFF` (were `#FBF8F2`), sunken track `#EEF1F0` (was `#E9E3D6`), skeleton `#E7EBEA` (was `#E5DED0`), and `onHeritage` and `onPrimary` `#FFFFFF` (were `#F1ECE1`). Ink, ink 2, the gold fill, the focus ring and the status colours do not change. The theme keeps the name `cream` in code so no screen has to change.
2. White cards are set apart by the existing hairline, as DESIGN already says ("a surface colour plus a hairline"). Text contrast improves (ink on white is higher than on cream), and `src/themes.test.ts` still passes.
3. The theme is shared, so the **series and playlist pages** (`CollectionScreen`) turn white together with Сан. Keeping them cream would put a cream page right behind a white one. The tab bar stays dark green; its active pill (it used the paper colour) is now white.
4. `docs/DESIGN.md` "Cream colors" is updated to the new values (a test keeps it equal to the code). `packages/tokens/css/tokens.css` is regenerated.

## Alternatives rejected

- A new `white` surface only for Сан: more code and a second light theme for one screen, with the two sibling pages left cream.
- Off-white page with white cards: not what was asked.

## Consequences

- Needs a **new app build** to be seen.
- The admin and the portal use other themes and are unchanged.
- To go back, restore the five values above (the previous ones are in this note).

## Evidence

- Tokens tests 13/13, mobile tests 253/253. Seen in the web preview with sample episodes.
