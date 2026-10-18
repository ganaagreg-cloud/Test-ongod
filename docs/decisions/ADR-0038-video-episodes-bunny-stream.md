---
id: ADR-0038
title: 'Video episodes: one media file per episode, Bunny Stream for video'
status: accepted
date: 2026-10-18
supersedes: [ADR-0011 "audio-first" (only once this ADR is accepted)]
tags: [adr, area/media, area/backend, area/mobile]
---

## Context

The client's episodes become montaged videos (voice over pictures and slides); some stay audio. Max 720p, at least 40 minutes each, 1 to 10 a week, one file per episode ([[changes]] 2026-10-18). [[SPEC#Product]] and [[ADR-0011-audio-first-media-asset|ADR-0011]] say audio now and video later; [[ADR-0004-media-bunny-token-auth|ADR-0004]] already says video goes through a Bunny Stream library at max 720p, and [[ADR-0020-bunny-signed-urls-hs256-no-ip|ADR-0020]] reserved directory tokens for HLS. **Draft: nothing is built until the client accepts a price option and Ganaa accepts this ADR and the SPEC / DESIGN wording ([[VIDEO-2026-10-18]]).**

## Decision

1. **One media file per episode.** `MediaAsset.kind` is AUDIO or VIDEO; the schema already allows both, no change to `Episode`. A new upload of either kind replaces the old file: the old asset and its Bunny object are deleted by a job once the new one is READY (today only unfinished uploads are replaced).
2. **Video = `BUNNY_STREAM`.** One Stream library per environment ([[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]]). Encoding: H.264 only, resolutions 360p, 480p, 720p (no 1080p: SPEC max 720p). `MediaAsset.path` holds the Stream video id. Audio stays on Bunny Storage.
3. **Env only.** `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_CDN_HOSTNAME` (already in `.env.example`) plus a new `BUNNY_STREAM_TOKEN_KEY` (token-auth key of the library's pull zone). No ids, hosts or keys in code.
4. **Playback.** `POST /v1/episodes/:id/play` keeps every rule of [[ADR-0021-catalog-and-playback-rules|ADR-0021]] item 7 (access, registered device, published, READY; expiry `min(now + 4 h, accessUntil)`) and returns `{ kind, url, expiresAt }`. For VIDEO, `url` is the HLS playlist (`…/<videoId>/playlist.m3u8`) signed with a **path-style directory token** over `/<videoId>/`, so the playlist and all segments are covered ([[R-bunny-stream]]), with the HS256 signer of ADR-0020 (no IP lock).
5. **Upload through jobs, never in a request** ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]): admin → tus (resumable, chunked) → server disk → job `media.video-upload` (create the Stream video, send the file, store the id, delete the local file) → job `media.video-status` (follow Bunny's processing until READY with `durationSec`, or FAILED with Bunny's reason). Retry re-queues the job, as for audio.
6. **Mobile:** VIDEO plays with `expo-video` (SDK 57 ~57.0.5, [[R-expo-video-sdk57]]), AUDIO stays on `expo-audio` ([[ADR-0032-audio-expo-audio-instead-of-track-player|ADR-0032]]). The Player's picture area becomes the video ([[DESIGN]] Player), with fullscreen. Background behaviour for video depends on the client's answer ([[open-questions]] #17).
7. **When accepted:** ADR-0011's status becomes "superseded by ADR-0038"; its `MediaAsset` design is kept.

## Alternatives rejected

- **Browser uploads straight to Bunny Stream (resumable TUS with a short-lived signature from the API):** keeps 0.5–1.5 GB files off the shared host, but needs the Stream video created first and puts a Stream credential flow in the browser. Kept as the **fallback if the host cannot hold the files** ([[R-hosting-limits]], TO-VERIFY).
- **One 720p MP4 on Bunny Storage (no Stream):** cheapest, but no adaptive bitrate, so weak mobile data stalls instead of dropping to 480p/360p (acceptance test: playback starts in < 3 s on mobile data).
- **Bunny's iframe player in a WebView:** not native (no fullscreen, background or lock-screen control of our own).
- **MediaCage Enterprise DRM:** $99/month per library plus licence fees (TO-VERIFY, [[R-bunny-stream]]); ADR-0004 already rejected paid DRM. MediaCage Basic (free, weak clear-key) is an open question (#20).
- **Audio and video for the same episode:** the client never uploads both.

## Consequences

- Delivery cost grows about 32× per view compared with 96 kbps audio (estimate in [[VIDEO-2026-10-18]], TO-VERIFY).
- New native modules (`expo-video`, probably `expo-screen-orientation`): a new dev build for gate B ([[ADR-0034-ios-first-zero-cost-device-gate|ADR-0034]]); background and picture-in-picture need config-plugin options that Expo Go cannot use.
- The app is portrait-only today; landscape fullscreen on iOS needs an orientation change ([[R-expo-video-sdk57]]).
- Biggest risk: 0.5–1.5 GB uploads through the shared host (time, disk, limits all TO-VERIFY).
- SPEC and DESIGN wording must change first (prepared in [[VIDEO-2026-10-18]], awaiting approval).

## Evidence

- [[R-bunny-stream]] (TO-VERIFY): Stream prices, H.264 ladder, HLS directory tokens, MediaCage.
- [[R-bunny-pricing]] (VERIFIED): Asia CDN $0.03/GB, $1 monthly minimum.
- [[R-bunny-token-auth]] (VERIFIED): HS256 token and `token_path`.
- [[R-expo-video-sdk57]] (VERIFIED, computed locally).
- [[R-hosting-limits]] (TO-VERIFY).
