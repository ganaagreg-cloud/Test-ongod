---
id: ADR-0108
title: 'The Welcome title is "Зөвүү Тавуу", on one line, without question marks'
status: accepted
date: '2026-11-16'
tags: [adr, area/mobile, area/design]
---

## Context

The client's own mock-up of the first screen writes the name as "Зөвүү Тавуу", on one line. Our Welcome screen showed "Зөв үү? Тав уу?" and wrapped it onto two lines ([[AUDIT-2026-11-12]], "Welcome title still wraps"). Ganaa relayed: it must not go to a second line, and the question marks can go (2026-11-16).

## Decision

1. Only the **Welcome title** changes: `mn.welcome.title = 'Зөвүү Тавуу'`, one line (`numberOfLines={1}`, `adjustsFontSizeToFit`, down to 60 %), so it shrinks on narrow phones instead of wrapping. The size also follows the screen width (`layout.heroTitleWidthPerPoint`), so a 320 pt screen shows the whole name on the web preview too. By day the Welcome glow is not drawn: its green edge showed under the painting's fade.
2. The name elsewhere (store title "Зөв үү Тав уу", [[ADR-0081-store-name-without-question-marks-domain|ADR-0081]]; the app label; legal pages) is not changed by this ADR.
3. The client's mock-up also has "Тавтай морил" under the name; we kept our longer text for now.

## Consequences

Needs a new app build. Check on a small iPhone.
