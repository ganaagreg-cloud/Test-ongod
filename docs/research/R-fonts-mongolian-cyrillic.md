---
topic: Lora and Inter cover Mongolian Ө ө Ү ү; on web only in cyrillic-ext
status: VERIFIED
checked: 2026-10-08
recheck_after:
source: 'computed locally: fontTools (Ganaa) and fontkit + Playwright (Claude Code) on @fontsource 5.3.0 and @expo-google-fonts 0.4.2'
tags: [research, area/design]
---

## Fact

Lora 400/600 and Inter 400/500/600 contain Ө ө Ү ү (U+04E8, U+04E9, U+04AE, U+04AF). In the mobile TTFs (`@expo-google-fonts` 0.4.2) they are present. On web (`@fontsource` 5.3.0) they exist **only** in the `cyrillic-ext` subset; the `latin` and `cyrillic` subsets do not contain them. No recheck needed for these package versions; re-run the check after upgrading the font packages.

## How it was checked

- fontTools cmap check by Ganaa (Lora 400/600, Inter 400/600).
- 2026-10-08, Claude Code: fontkit `hasGlyphForCodePoint` on every TTF and every latin/cyrillic/cyrillic-ext woff2 for Lora 400/600 and Inter 400/500/600. All TTFs and all cyrillic-ext files: yes; all latin and cyrillic files: no.
- Playwright `pnpm test:e2e` (portal `/dev/ui`): `document.fonts.check` passes and the cyrillic-ext face is loaded for every weight.

![[font-check-web.png]]

## Used by

- [[ADR-0013-fonts-lora-inter|ADR-0013]]
