---
id: ADR-0025
title: 'UI component set: one design source, a web package, native components, guard tests'
status: accepted
date: 2026-10-08
tags: [adr, area/design, area/mobile, area/web]
---

## Context

Portal, admin and mobile all need the same eleven components ([[DESIGN#Components]]): Button, Input, Chip, EpisodeRow, EpisodeCard, Sheet, Toast, EmptyState, Skeleton, Badge, ListItem. CLAUDE.md forbids hardcoded colors, sizes and fonts outside `packages/tokens`. Portal and mobile are dark, admin is light ([[ADR-0014-admin-light-theme|ADR-0014]]).

## Decision

1. **One design source.** Tokens stay in `packages/tokens` (TS values for React Native, generated CSS variables for web). Icons and the mountain-line motif are drawn once, as path data in `packages/tokens/src/assets.ts`, and rendered by both platforms (`react-native-svg` on mobile, inline `<svg>` on web). A test compares the tokens with the numbers written in `docs/DESIGN.md` (colors, type scale, spacing, radius, component heights, light theme).
2. **Small additions to `layout` tokens** that DESIGN.md implies but did not list: `borderWidth` 1, `iconSize` 24, `iconSizeSmall` 16, `badgeHeight` 24, `progressBarHeight` 3, `sheetHandleWidth` 40, `sheetHandleHeight` 4, `motifWidth` 160, `motifHeight` 48, `overlayMaxWidth` 480. They exist so components contain no raw numbers. **DESIGN.md "Tokens" does not list them yet; the edit is waiting for approval.**
3. **Web: `packages/ui-web`** (`@ongod/ui-web`): React components plus `base.css` (reset and page primitives) and `ui.css` (components), written only with `var(--...)` from the tokens CSS. They work in both themes: where dark and light need a different text color on the heritage green, `ui.css` defines two variables (`--ui-on-heritage`, `--ui-primary-pressed`) per theme. Portal and admin import the package; no per-app copies.
4. **Accessibility built in:** `Sheet` uses the native `<dialog>` (focus trap, Esc, inert background, focus restore); `Toast` announces with `role=status|alert`; icon-only buttons require a `label`; inputs tie label, hint and error with `aria-describedby`; chips and list rows are real buttons; touch targets are at least 44 px (the 36 px chip has a 44 px hit area); motion follows `prefers-reduced-motion` (web) and the system reduce-motion setting (mobile). Components take their labels as props: no Mongolian text is hardcoded in the kit; text lives in the apps' `mn.ts`.
5. **Mobile: `apps/mobile/src/ui`**: the same set in React Native using only tokens (`Modal` + `Animated` for the sheet, `Animated` for toast and skeleton, `react-native-svg` for icons).
6. **`/dev/ui` pages** (dev only, `import.meta.env.DEV` / `__DEV__`): the gallery in `packages/ui-web/src/gallery` is shown by portal and admin (admin so the light theme can be checked); the mobile page is `app/dev/ui.tsx`. Each shows the type scale, the Ө/Ү glyph test, colors and every component in its states.
7. **Guards, as tests:** `ui-web` and `apps/mobile` fail on any raw color, pixel size or font name in the component styles (the mobile test proves it catches violations); Playwright checks the gallery (states, 44 px targets, sheet and toast behaviour, fonts) and, when Metro runs, the mobile web page.
8. **Not part of this step:** TabBar and MiniPlayer (DESIGN.md "Components"). They come with the app screens and the player.

## Alternatives rejected

- **A cross-platform library (React Native Web for the portal, Tamagui, NativeWind):** the portal needs plain, light, accessible HTML and CSS (Lighthouse, SEO); a second styling system would also fight the generated CSS variables.
- **Duplicating icon and motif drawings per platform:** they would drift.
- **A CSS framework (Tailwind):** more setup and a second source of token values.
- **Custom modal and focus-trap code for the web sheet:** `<dialog>` already does it correctly.

## Consequences

- A new component needs both a web and a native version, or a note that it exists on one platform only.
- `react-native-svg` is a new native dependency; a dev build is already required (Expo Go is not used).
- The mobile demo screen shows placeholder covers; React Native Web does not draw SVG data URIs. Real covers are JPEG/WebP over HTTPS.
- Native rendering (iOS and Android) of the kit is checked only through Expo web so far; the device smoke test ([[ADR-0015-local-first-android-smoke-test|ADR-0015]]) is still to do.

## Evidence

- `packages/tokens/src/design-md.test.ts`, `packages/ui-web/src/tokens-only.test.ts`, `apps/mobile/test/ui-tokens-only.test.ts`, `apps/portal/e2e/ui-kit.spec.ts`, `apps/portal/e2e/mobile-web.spec.ts`; screenshots in `docs/screens/`.
- [[R-fonts-mongolian-cyrillic]] (font coverage), checked again for every weight in a browser.
