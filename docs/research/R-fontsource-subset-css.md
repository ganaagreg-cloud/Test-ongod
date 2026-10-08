---
topic: Fontsource per-subset CSS files have no unicode-range
status: VERIFIED
checked: 2026-10-08
recheck_after: 2026-12-07
source: 'computed locally: read node_modules/@fontsource/inter/cyrillic-ext-400.css and 400.css (v5.3.0)'
tags: [research, area/design]
---

## Fact

In `@fontsource/*` 5.3.0, the per-subset files (e.g. `cyrillic-ext-400.css`) declare `@font-face` **without** `unicode-range`. The per-weight files (e.g. `400.css`) include every subset with `unicode-range`. Importing three per-subset files for one weight creates overlapping faces, so `packages/tokens` generates `css/fonts.css` from the per-weight files, keeping only latin, cyrillic and cyrillic-ext.

## How it was checked

Read both CSS files in `node_modules` on 2026-10-08.

## Used by

- [[ADR-0013-fonts-lora-inter|ADR-0013]]
