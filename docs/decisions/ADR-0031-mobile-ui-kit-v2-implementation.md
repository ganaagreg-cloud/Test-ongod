---
id: ADR-0031
title: Mobile UI kit v2 — surface context, spring helpers, enter animation, tokens
status: accepted
date: 2026-10-09
tags: [adr, area/mobile, area/design]
---

## Context

[[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]] and [[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] set the look. Building the kit needed a few technical choices that are not in those ADRs.

## Decision

1. **Surface context.** `SurfaceProvider` (src/ui/surface.tsx) gives every kit component its colors (`dark` or `cream`); `<Screen surface="cream">` mounts it. Components build styles with `useThemedStyles(makeStyles)`. `packages/tokens` has `themes.cream` with the same keys as `dark` (plus the admin `light`). The tab bar, mini player, hero, sheets and toasts force dark; over a cream screen the tab bar is brand green at 94% with a paper pill (Library.dc.html).
2. **Springs from tokens.** `motion.spring.*` in tokens; `src/ui/motion.ts` adds `ReduceMotion.System` so springs finish instantly under reduce-motion. Loops (shimmer, sheen, aurora, equalizer, caret) stop through `useAmbientActive()` (reduce-motion or app in background).
3. **No Reanimated `entering` layout animations.** On Expo web they took sibling elements out of flow (a horizontal list drew over the rows above it). Entrances use `useEnterStyle(index)`: a shared value driving opacity + a 16 pt translateY, 60 ms stagger (max 8), plain 150 ms fade with reduce-motion.
4. **Worklets callbacks** use `scheduleOnRN` from `react-native-worklets` (Reanimated 4); `GestureHandlerRootView` at the app root and again inside the `Modal` of `Sheet` (Android).
5. **Glass.** `expo-blur` on iOS/web, plain surface at 96% on Android. `elevation.floating` uses `elevation: 8` on Android and a CSS `boxShadow` elsewhere.
6. **Tab labels are 12 pt** (the mockups use 11): the rule "never below 12" wins.
7. **Mountain line** uses the Welcome mockup ridge; stroke-draw by animating `strokeDashoffset` with `react-native-svg` + Reanimated.
8. **Old square `Cover` and single `Chip` removed**; `EpisodeThumb` (16:9 / 4:3) and `ChipRow` replace them.

## Alternatives rejected

- **Per-component `theme` props:** every call site would have to pass it; a context is one line per screen.
- **`FadeInDown.springify()` entering:** broke layout on web (see 3).
- **Skia/Lottie for aurora and line drawing:** heavier native deps, SVG + Reanimated is enough ([[ADR-0027-design-v2-aurora-forest-motion|ADR-0027]]).

## Consequences

- New native dependencies: needs a new dev build before any device test ([[R-motion-libs-sdk-57]]).
- Every new kit component must call `useThemedStyles`/`useSurface`; the tokens-only test still scans `src/ui`.

## Evidence

- Web screenshots in `docs/screens/kit-*.png` (2026-10-09). Device behavior TO-VERIFY at the first dev build.
