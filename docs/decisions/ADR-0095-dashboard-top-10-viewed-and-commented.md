---
id: ADR-0095
title: 'The admin dashboard lists the 10 most viewed and the 10 most commented episodes'
status: accepted
date: '2026-11-12'
tags: [adr, area/admin, area/backend]
---

## Context

Client, 2026-11-12: the dashboard should show "хамгийн их үзэлттэй эхний 10 бичлэг" and "хамгийн их сэтгэгдэлтэй эхний 10 бичлэг". The dashboard is defined in [[ADR-0056-admin-dashboard-overview|ADR-0056]]. There is no play counter; `PlaybackProgress` holds one row per member and episode.

## Decision

1. `GET /v1/admin/dashboard` adds `topViewed` and `topCommented` (both default to an empty list in the schema).
2. **Views = members who started the episode:** the number of `PlaybackProgress` rows of a PUBLISHED episode. A member counts once however often they replay. Each row also carries `completed`: members who finished it.
3. **Comments = VISIBLE comments** of a PUBLISHED episode (hidden and deleted ones are not counted).
4. Ten rows each, most first, ties by episode id. Two new cards in the dashboard grid, each row with its rank and a link to the episode.

## Alternatives rejected

- A new play-count column or event table: a write on every play for a number the owner reads a few times a day; unique listeners answer "what do members watch".
- A separate statistics page: the client asked for the dashboard.
- Date ranges (this month, this week): not asked; `PlaybackProgress` keeps only the last update time.

## Consequences

- The number is unique members, not plays; the card says "Нэг гишүүнийг нэг удаа тоолно".
- Three more grouped queries per dashboard load, on existing indexes (`PlaybackProgress(episodeId)`, `Comment(episodeId, status, createdAt)`).
- DESIGN "Admin screens" names the dashboard cards; the two new ones need adding (edit waits for Ganaa's approval).

## Evidence

- Test: `apps/api/test/admin-payments.test.ts` "dashboard top 10".
