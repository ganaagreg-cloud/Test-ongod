---
id: ADR-0021
title: 'Catalog, playback, progress and saved: rules'
status: accepted
date: '2026-10-08'
tags: [adr, area/backend, area/media]
---

## Context

[[SPEC#Workflows]] G fixes the episode lifecycle (Draft, Scheduled, Published; media Ready) and the acceptance tests say a link without access is refused and expired access stops playback. It leaves open how the catalog is paged, what "next" means, how long a play link lives, and what progress and saved do on edge cases. This ADR fills those gaps for `/v1/categories`, `/v1/episodes`, `/v1/home`, `/v1/episodes/:id/play`, `/v1/progress` and `/v1/saved`. It does not change SPEC, DESIGN or any accepted ADR; it builds on [[ADR-0004-media-bunny-token-auth|ADR-0004]] and [[ADR-0020-bunny-signed-urls-hs256-no-ip|ADR-0020]].

## Decision

1. **Visibility.** Users see an episode only if `status = PUBLISHED` and `publishedAt <= now`. The time check is a second lock, so a wrong status or a future time can never leak an episode. Anything else (draft, scheduled, archived, unknown) is `404`, so the API does not reveal that it exists. A category with no published episodes is hidden.
2. **The catalog needs login, not paid access.** `SPEC` says the catalog is visible to logged-in users. Only `play` needs access. Progress and saved also work without access.
3. **Paging: opaque cursor, sorted in memory.** `GET /v1/episodes` and `/v1/saved` take `limit` (default 20, max 50) and `cursor`. The server loads only `{id, sort key}` for the filtered set, sorts it (key, then id, so the order is total), returns the page after the cursor, then loads full rows for that page. Reason: "longest" sorts by audio duration, which lives on `MediaAsset`; storing it on `Episode` would change the SPEC data model. A single creator's library is hundreds of episodes. Revisit (denormalise `durationSec` onto `Episode` through a SPEC change) if the library passes a few thousand.
4. **Search** is `contains` on title and description, case-insensitive through the database collation (`utf8mb4_unicode_ci`, set in `docker-compose.yml`).
5. **Covers.** `Episode.coverPath` is the 1400x1400 image; the 400x400 one sits next to it with `-400` before the extension. List items carry `coverUrl` and `thumbUrl`, signed URLs (the pull zone is token protected). Their expiry is the same for everyone during a UTC day (valid 24 to 48 hours), so a cover URL stays identical for a day and can be cached. An unsignable cover path gives `null`, not an error.
6. **Detail `next`** ("Дараагийн" in DESIGN) is up to 5 published episodes of the same category published after this one, oldest first.
7. **Play.** Checks in this order: access (`user.accessUntil > now`, else `403 NO_ACCESS`), a registered device (a `Device` row for the session's device, else `403 DEVICE_NOT_REGISTERED`), episode published (else 404), a READY audio file (else `409 MEDIA_NOT_READY`). The URL is valid **at most 4 hours and never past `accessUntil`** (`min(now + 4 h, accessUntil)`), so expired access stops playback and not four hours later. Response has `Cache-Control: no-store`. Playing updates the device's `lastSeenAt`. With no Bunny settings the endpoint answers `503`; production refuses to start without them.
8. **Error messages carry no price, plan or payment hint** (apps must not show any). New codes: `NO_ACCESS`, `DEVICE_NOT_REGISTERED`, `MEDIA_NOT_READY`.
9. **Progress** is `PUT` with `positionSec` (0 to 24 h) and `completed`; one upsert, last write that arrives wins, `204`. A later write with `completed: false` clears the flag (the user started again). "Continue listening" is progress with `positionSec > 0` and not completed, newest first.
10. **Saved** `PUT` and `DELETE` are idempotent (`204` either way); saving twice keeps the first time. `GET` lists newest saved first. Removing works for any id, including episodes unpublished since.

## Alternatives rejected

- **Native database keyset paging only:** cannot sort by duration without a schema change.
- **Offset paging:** items shift when an episode is published between pages.
- **A flat 4 hour play link:** a user whose access ends in 10 minutes could keep streaming (and re-download) for 4 hours; the acceptance test says expired access stops playback.
- **Per-request cover tokens:** the URL would differ on every request and could never be cached.
- **404 vs 403 for unpublished episodes:** 403 would confirm that the id exists.

## Consequences

- A play link can be shared until it expires (at most 4 hours). Accepted, see ADR-0004 (no DRM).
- Audio already buffered by the player keeps playing after access ends; new range requests fail once the link expires.
- A user with 5 minutes of access left gets a 5 minute link: playback ends when access does.
- Two progress saves sent close together can arrive out of order and the older one wins. Clients save every few seconds and always send the current position next time, so this self-corrects.
- The candidate list is rebuilt on every list request. Fine at this size; see decision 3.
- The play endpoint is only limited by the global rate limit. Add a per-user limit if link harvesting ever shows up in the logs.
- Admin episode management, uploads, scheduled publishing and notifications are separate work; until they exist, episodes are created by seed or SQL.

## Evidence

- [[R-bunny-token-auth]] for the URL format; [[ADR-0020-bunny-signed-urls-hs256-no-ip|ADR-0020]].
- Tests: `apps/api/test/catalog.test.ts`, `play.test.ts`, `library.test.ts` (database) and `catalog-cursor.test.ts` (no database).
