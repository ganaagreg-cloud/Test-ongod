---
type: runbook
status: draft
updated: 2026-10-18
tags: [runbook, area/media]
---

# Switch Bunny account (dev zone → owner's account)

Per [[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]], the switch is an env change only. Audio lives in a Storage Zone + Pull Zone ([[ADR-0020-bunny-signed-urls-hs256-no-ip|ADR-0020]]), video in a Stream library ([[ADR-0038-video-episodes-bunny-stream|ADR-0038]], [[R-bunny-stream]]).

## Env keys (from `.env.example`)

Audio: `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_REGION`, `BUNNY_PULL_ZONE_HOST`, `BUNNY_CDN_TOKEN_KEY`.
Video: `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_CDN_HOSTNAME`, `BUNNY_STREAM_TOKEN_KEY`. Production refuses to start without all four; in development, video upload and play are simply off until they are set.

## Steps

1. In the owner's Bunny account: create a Storage Zone and a Pull Zone linked to it.
2. Enable Token Authentication on the Pull Zone ([[R-bunny-token-auth]]) and copy the token key.
3. Video: create a Stream library. In its settings: resolutions **360p, 480p, 720p only**; **MediaCage DRM OFF** (it plays only in Bunny's own player, not in the app); then turn **Token Authentication ON** for the library's CDN (its pull zone; the exact menu is TO-VERIFY in the dashboard).
4. Copy into env: the library ID (a number), the library **API key** (not the account key or the storage password), the CDN hostname (`vz-….b-cdn.net`) and the pull zone's **token key**.
5. If content was uploaded to the dev zone and must be kept: audio files go to the new storage zone with the same paths (`MediaAsset.path` is relative). Videos cannot be copied between libraries by path (their ids change): re-upload them in the admin.
6. Set the new values in production env. Never paste keys into docs or chat.
7. Restart the app, then play one audio and one video episode with an active account and confirm that a URL without a token is refused (for video: the playlist URL with the `bcdn_token=…` part removed).
8. First video upload on a new library: watch the episode go PROCESSING → READY in the admin. Bunny's status numbers are TO-VERIFY ([[R-bunny-stream]]); if a finished video stays PROCESSING or a good one fails, note the video's `status` and `encodeProgress` from the Bunny dashboard in the log.
9. Delete or rotate the dev zone keys.
