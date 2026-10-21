---
id: ADR-0042
title: 'Content organisation (series, playlists, tags, featured) and push on publish'
status: accepted
date: '2026-10-21'
tags: [adr, area/admin, area/catalog, area/api, area/mobile]
---

## Context

The admin can only manage categories; an item has one category, a cover and one media file. With 1 to 10 items a week of 40+ minutes, a flat list is hard to organise and feature. Design from the brainstorm with Ganaa: [[2026-10-21-content-management-design]]. Ganaa approved the design and the phase 1 plan on 2026-10-21.

This ADR covers phase 1 only (organise + admin management + push on publish). Free content and play stats are phases 2 and 3 and get their own ADRs. Nothing here changes "no free episodes" in [[SPEC]] or CLAUDE.md. Item model and media rules stay as in [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (one audio or video file per item).

## Decision

1. **Series.** `Series(id, title, slug unique, description, coverPath?, createdAt)`. An item is in zero or one series (`Episode.seriesId?`) with a part number (`seriesPart?`), unique `(seriesId, seriesPart)`. Series is optional: the admin form defaults to "Цувралгүй". Category stays required.
2. **Playlists.** `Playlist(id, title, slug unique, description?, coverPath?, showOnHome, homeOrder, isFeatured, createdAt)` and `PlaylistItem(playlistId, episodeId, position)`, pk `(playlistId, episodeId)`. An item can be in many playlists, ordered by `position` (admin drag order).
3. **Онцлох (featured)** is one built-in playlist (`isFeatured`), seeded, never deletable. It is the top row of Нүүр.
4. **Tags.** `Tag(id, name, slug unique)` and `EpisodeTag(episodeId, tagId)`. Any number per item; used for search and filters. Deleting a tag removes it from items.
5. **Нүүр order.** Онцлох, Үргэлжлүүлэх (logged-in only), Энэ 7 хоногт ([[ADR-0039-phase-3-before-gate-a|ADR-0039]]), playlists with `showOnHome` by `homeOrder`, Шинэ, categories. `HomeResponse` only gains fields; nothing is removed, so existing app versions keep working.
6. **Push on publish.** New `Episode.notifyOnPublish` (default true) and `pushText?` (default text is the title). Built for "publish now", the scheduled-publish cron, and bulk publish. Audience is users with active access AND a non-revoked session (logged in); logout clears that device's push token (phase 1 has no free items). A bulk publish sends one combined push per audience ("N шинэ бичлэг нэмэгдлээ"), not one per item. Pushes are queued as jobs, never sent inside the request.
7. **Cron fix.** Scheduled publishing today only matches AUDIO media; it is fixed to publish any item whose media is READY (audio or video).
8. **Admin tools.** Контент list with filters, sort and pagination; bulk actions (max 100 items, one DB transaction, one audit row per item, all-or-nothing); preview in any status through a separate admin endpoint; duplicate to a new DRAFT; calendar; series, playlist and tag pages. Details are left to the builder.
9. **Naming.** Code keeps the model name `Episode`. User-facing admin text says Контент / бичлэг; the mobile app keeps "Анги".
10. **Store rules unchanged.** No endpoint or screen the mobile apps use gains a price, plan or payment text.

## Alternatives rejected

- **Several categories per item:** ambiguous "where it lives"; tags cover topics.
- **Featured as a flag on the item:** needs its own ordering; a built-in playlist reuses playlist ordering and admin UI.
- **Series as a playlist kind:** series needs part numbers and "next part"; mixing the two blurs both.
- **One push per item on bulk publish:** floods members.

## Consequences

- **SPEC changes** (applied with this ADR): admin Surfaces line, workflow G, data model (five models and four Episode fields). The free-content lines are not touched (phase 2).
- **Migration:** five tables, four Episode columns, a seeded Онцлох row. Existing rows untouched.
- **Mobile:** series page, playlist rows and tag filter arrive in phase 1; no payment UI.
- **Change request:** [[changes]] entry of 2026-10-21 (price set by Ganaa).
- Phase 2 (free content, logged-out access) waits for Ganaa to set the price and edit CLAUDE.md.

## Evidence

- [[2026-10-21-content-management-design]]
- [[ADR-0038-video-episodes-bunny-stream|ADR-0038]], [[ADR-0039-phase-3-before-gate-a|ADR-0039]]
