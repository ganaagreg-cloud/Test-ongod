---
id: ADR-0034
title: Episode pictures are stored as 16:9 (1280x720 and 400x225)
status: accepted
date: 2026-10-09
supersedes: [ADR-0021 (decision 5, cover sizes only)]
tags: [adr, area/backend, area/admin, area/media]
---

## Context

[[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]] (accepted) made episode pictures 16:9: the player, "Дараагийн" and the Home hero show 16:9, list rows a 4:3 centre crop. [[ADR-0021-catalog-and-playback-rules|ADR-0021]] #5 still said the server stores a 1400x1400 square and a 400x400 thumbnail, and `media/cover.ts` did that. A 16:9 picture from the creator lost about 44% of its width, and the app then cropped the square again. Found by the audit of 2026-10-09 (B-03).

## Decision

1. The cover is **1280x720** WebP and the thumbnail **400x225** WebP. A 16:9 upload is only scaled; any other shape is centre-cropped to 16:9.
2. File names keep the existing pattern, so no URL code changes: the full picture is `<name>.webp`, the thumbnail `<name>-400.webp` (400 is its width). `coverUrl` and `thumbUrl` in the API keep their names and meaning.
3. The admin hint asks for a 16:9 picture (recommended 1280x720) and shows a 16:9 preview.
4. Clients make their own crops from the 16:9 picture: 4:3 for list rows, and the lock-screen artwork ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]] #10).

## Alternatives rejected

- **Keep the square and ask the creator for squares:** 300 extra images for the creator, who already has YouTube-style thumbnails ([[ADR-0028-cream-library-and-16x9-artwork|ADR-0028]]).
- **Store the original size:** unpredictable weight on mobile data.

## Consequences

- No production data exists yet, so there is nothing to migrate. Pictures uploaded during development as squares stay squares until they are uploaded again.
- The category photo (`Category.coverPath`) is a separate, still unbuilt upload (audit B-08).

## Evidence

- `apps/api/test/admin-uploads.test.ts`: a square upload becomes 1280x720 and 400x225; a 16:9 upload keeps both ends of the picture.
