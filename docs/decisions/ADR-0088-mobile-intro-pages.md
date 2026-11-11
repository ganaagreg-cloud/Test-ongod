---
id: ADR-0088
title: Three intro pages before Welcome (mobile)
status: accepted
date: '2026-11-11'
tags: [adr, area/mobile]
---

## Context

The client asked for three introduction pages about the app before the login. The same request also asked that people can browse the library without logging in and register only to watch. That second part changes access rules and the [[SPEC]] and is NOT decided here (see [[changes]], 2026-11-11).

## Decision

- A new screen `app/(auth)/intro.tsx`: three swipeable pages (icon, title, text), dots, "Дараах" / "Эхлэх", and "Алгасах" on pages 1 and 2. It uses the dark surface and the Welcome aurora and only tokens from `packages/tokens`.
- Shown once per phone, only when signed out. The flag `ongod.introSeen` lives in the secure store and stays after a logout. A signed-out start goes to `/intro` the first time and to `/welcome` afterwards (`app/index.tsx`). If the storage cannot be read, the intro is skipped.
- All texts are in `mn.intro` in `src/i18n/mn.ts` and contain no price, plan or payment words (CLAUDE.md, ADR-0044; the existing `no-payment-text` test covers them).
- The texts are a first draft for the client to approve.
- No server change.

## Alternatives rejected

- Show the intro on every start: annoying for returning members.
- Put the pages inside Welcome: Welcome stays the login door, as in DESIGN.

## Consequences

- Login is still required to browse; guest browsing needs its own ADR and a SPEC change approved by Ganaa.
- DESIGN "Auth" section should list the intro pages (not edited here: DESIGN.md change needs Ganaa's approval).
- The generated `.expo/types/router.d.ts` must be regenerated (`npx expo start`) before `tsc` knows `/intro`.

## Evidence

- Tests: mobile 240/240 pass, `tsc --noEmit` clean. Not run on a device yet.
