---
id: ADR-0066
title: Player comments sit flat on the page, not in a card
status: accepted
date: '2026-10-29'
supersedes: [ADR-0061 (only the card look of the comments block in the Player)]
tags: [adr, area/mobile, area/design]
---

## Context

[[ADR-0061-episode-comments|ADR-0061]] put the comments in a raised, bordered card with a bordered text box inside. Ganaa said on 2026-10-29 it stands out too much from the rest of the Player, where "Тайлбар" is plain text.

## Decision

1. No card: the "Сэтгэгдэл" block sits on the page background, separated from "Тайлбар" by one hairline on top.
2. The text box is a single quiet field with a hairline underline, no box and no fill.
3. Behaviour, texts and rules from [[ADR-0061-episode-comments|ADR-0061]] and [[ADR-0062-comments-without-contact-gate|ADR-0062]] are unchanged. Only tokens are used ([[DESIGN]]).

## Consequences

- One file changes: `CommentsSection.tsx`. [[DESIGN]] "Player" now says "block" instead of "card".
