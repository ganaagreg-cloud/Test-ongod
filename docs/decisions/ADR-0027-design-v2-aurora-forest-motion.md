---
id: ADR-0027
title: Design v2 — Aurora Forest palette, motion system and motion libraries
status: proposed
date: 2026-10-09
supersedes: [ADR-0012 (palette and "quiet UI" parts only)]
tags: [adr, area/design, area/mobile]
---

## Context

The client set **Aurora Forest #053931** as the main color, sent the "Философи" app (video) as a reference and a concept image, and asked for an above-average app with real motion. [[DESIGN]] v1 used a near-black green-grey palette, "no shadows", one motion rule (200 ms ease-out) and no animation libraries, so the built kit looked flat.

## Decision

1. Adopt [[DESIGN-v2-aurora]]: forest palette built from #053931, gold kept as the only accent, two allowed shadows (floating, gold glow), glass surfaces, larger radii, tab bar 68 pt.
2. Add motion tokens (snappy, smooth, sheet springs; enter; shimmer; ambient) and haptics.
3. Add `react-native-reanimated`, `react-native-gesture-handler`, `expo-blur`, `expo-linear-gradient`, `expo-haptics`, `expo-image` via `npx expo install`.
4. shadcn/ui, 21st.dev and Shuffle are pattern references only; components are rebuilt natively ([[ADR-0025-ui-component-set|ADR-0025]] still holds: no Tailwind/NativeWind).
5. Unchanged: one dark theme, no payment UI ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]), square covers, no per-episode locks, Lora + Inter ([[ADR-0013-fonts-lora-inter|ADR-0013]]).

## Alternatives rejected

- **Copy the concept's paywall screen (100,000 ₮ / Эрх авах / restore purchase):** breaks store rules (ADR-0006).
- **Copy the reference app's black + white look:** brand/legal risk and ignores the client's color.
- **Install shadcn / 21st.dev components:** web-only (React DOM + Tailwind); they do not run in React Native.
- **Skia or Lottie for effects:** heavier native deps; SVG + Reanimated is enough for the aurora and line drawing.

## Consequences

- `packages/tokens`, `docs/DESIGN.md` and `design-md.test.ts` change together. Portal CSS picks up the new colors automatically.
- New native deps need a new dev build (EAS or local), then the Android smoke test ([[ADR-0015-local-first-android-smoke-test|ADR-0015]]).
- textTertiary is not allowed on brand/heritage surfaces (contrast 3.9:1 / 3.1:1).

## Evidence

- Contrast ratios computed 2026-10-09 (WCAG formula): cream on surfaceRaised 13.4:1, textSecondary 7.5:1, textTertiary 4.6:1, onAccent on gold 9.1:1.
- Library versions for Expo SDK 57: TO-VERIFY at install time (write [[R-motion-libs-sdk-57]]).
- Visual target: `docs/design/v2-screens/*.dc.html`.
