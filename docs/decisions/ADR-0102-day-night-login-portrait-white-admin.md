---
id: ADR-0102
title: 'Day and night modes in the app, a painted portrait behind Welcome and Login, white admin'
status: accepted
date: '2026-11-13'
tags: [adr, area/mobile, area/admin, area/design]
---

## Context

The client sent a painting (an old man in front of a red banner) and asked, through Ganaa, on 2026-11-13: (1) the login background must look like their phone-login mockup, with the painting fading into white; (2) the app gets a day/night switch with a sun/moon icon: night is the existing dark palette, day is white with the existing forest green replacing the gold buttons; (3) the tab bar's bottom gap shows the page behind it and looks mismatched; (4) the admin panel is white and green, without the switch. Colours are the client's choice. This changes [[DESIGN]] (dark is the only app theme there), so it is recorded here and DESIGN was updated with the owner's go-ahead.

## Decision

1. **Day and night, mobile only.** `packages/tokens` gets `applyTheme('day' | 'night')`. Most screens build their styles once at load from the shared theme objects, so the mode is applied once at boot (`src/theme/boot.ts`, first import in `app/_layout.tsx`) by changing those objects in place. Switching saves the choice (SecureStore, `localStorage` on web) and restarts the interface (`Updates.reloadAsync`); the sign-in is kept. The default is **day**, one constant (`DEFAULT_THEME`) in `src/theme/preference.ts`.
2. **Day palette.** Page and cards white, ink and brand forest green `#053931`; the gold fills (`accent`, `primary`, `accentText`) become forest green with white text on them. Gold stays only as detail on brand-green panels, through the new token `onBrandAccent` (the Эрх card, the Welcome tile). The tab bar's active text uses `onHeritage` so it stays readable on the green pill.
3. **Toggle.** A round sun (in night) / moon (in day) button on Welcome (over the painting) and top right of Профайл. Labels in `mn.ts` (`theme.toDay`, `theme.toNight`).
4. **Portrait.** `apps/mobile/assets/login-portrait.jpg` (1080×1528) fills the top 58 % of Welcome and Login and fades into the page colour, so it works in both modes. The cover marquee on Welcome is replaced (the component is left in the repo, unused). Only the background changed: the form, the buttons and the other screens keep their design.
5. **Tab bar.** A page-coloured gradient strip (`DockBackdrop`) sits under and above the floating bar so lists no longer show through the gap beneath it.
6. **Admin.** The `light` theme (admin and e-mail) is white: page `#FFFFFF`, sunken `#F1F4F3`. It keeps the forest green primary. No switch in admin.
7. `docs/DESIGN.md` and the token tests were updated; `tokens.css` regenerated.

## Alternatives rejected

- Rebuilding about 100 files on theme hooks to switch live: large, risky, no user benefit over a restart.
- Following the mockup's exact green (`#12632B`): the client later chose the green already in the app.

## Consequences

- Needs a new app build (new asset, native restart call). The toggle restarts the interface.
- **Rights:** the painting carries an artist's signature. The client must confirm they may use it (also relevant to Apple's Content Rights question).
- The painting shows on both Welcome and Login; limiting it to Login is a one-line change.
- Not checked on a phone, only in the browser build.
