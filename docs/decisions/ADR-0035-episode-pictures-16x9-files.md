---
id: ADR-0035
title: Episode picture files are 16:9 (1280x720 and 640x360)
status: accepted
date: 2026-10-17
supersedes: [ADR-0021 item 5 (1400x1400 and 400x400 square covers)]
tags: [adr, area/backend, area/media]
---

## Context

[[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] and [[DESIGN]] made episode pictures 16:9 (recommend 1280×720): the player, "Дараагийн" and the Home hero show 16:9, list rows a 4:3 centre crop (112×84 pt), the mini player and lock screen a centre crop. The API still followed [[ADR-0021-catalog-and-playback-rules|ADR-0021]] item 5 and cut every upload to a 1400×1400 square, so a YouTube-style thumbnail lost its sides ([[AUDIT-2026-10-17]]).

## Decision

1. The admin upload is centre-cropped to 16:9 and stored as two WebP files: **1280×720** (`coverPath`, for 16:9 screens) and **640×360** (`thumbUrl`, for lists and small art). Any other shape (square, portrait) is centre-cropped too.
2. The devices make the 4:3 and square crops themselves (image `cover` fit, centred). 640×360 cropped to 4:3 leaves 480×360 px, enough for a 112×84 pt row at 3x (336×252 px).
3. The small file keeps the `-400` suffix next to `coverPath` (`thumbPathOf`, unchanged). It is now a name, not a size, so pictures uploaded before this change keep working.
4. Working files before the storage job: `<coverId>-full.webp` and `<coverId>-thumb.webp` (no sizes in the names).
5. Tokens get CSS variables `--aspect-artwork` (16:9) and `--aspect-thumbnail` (4:3); the admin preview is 16:9 and its hint asks for 16:9.

## Alternatives rejected

- **Keep square files, crop to 16:9 on the device:** a 16:9 upload would already have lost its sides on the server.
- **A server-side 4:3 thumbnail:** a third file per upload; the device crops a 16:9 file to 4:3 for free.
- **Rename the suffix to `-thumb`:** cleaner, but every picture uploaded before would lose its thumbnail.

## Consequences

- Pictures uploaded before this change stay square until they are uploaded again (dev data only, before launch).
- Lock-screen artwork: whether iOS / Android crop a 16:9 picture well is still unchecked ([[R-expo-audio-sdk57]], [[DEVICE_SMOKE]] row 26).
- Category photos are not touched (no upload route yet).

## Evidence

- No external facts; sizes follow [[DESIGN]] and ADR-0028.
