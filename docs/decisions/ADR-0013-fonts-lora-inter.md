---
id: ADR-0013
title: Fonts = Lora (display) + Inter (UI)
status: accepted
date: 2026-10-08
tags: [adr, area/design, area/mobile]
---

## Context

All text is Mongolian Cyrillic, including Ө ө Ү ү, which many fonts lack or split into extra subsets.

## Decision

Lora for display text, Inter for UI ([[DESIGN]], Typography).

- **Mobile:** full TTFs from `@expo-google-fonts`, loaded with expo-font before the splash hides. One family name per weight, because Android does not synthesize weights.
- **Web:** self-hosted Fontsource latin + cyrillic + cyrillic-ext subsets, no Google Fonts CDN.

## Alternatives rejected

- **Web cyrillic subset only:** misses Ө/Ү ([[R-fonts-mongolian-cyrillic]]).
- **Importing Fontsource's per-subset CSS files:** they have no `unicode-range` ([[R-fontsource-subset-css]]). Instead, `packages/tokens` generates `fonts.css` from Fontsource's rules.

## Consequences

- Weights in use: Lora 400/600, Inter 400/500/600.
- The Playwright test `pnpm test:e2e` guards the web side.

## Evidence

- [[R-fonts-mongolian-cyrillic]]
- [[R-fontsource-subset-css]]
