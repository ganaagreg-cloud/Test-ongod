---
type: runbook
status: draft
updated: 2026-10-08
tags: [runbook, area/media]
---

# Switch Bunny account (dev zone → owner's account)

Per [[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]], the switch is an env change only. Draft until Bunny integration exists.

## Env keys (from `.env.example`)

`BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_REGION`, `BUNNY_PULL_ZONE_HOST`, `BUNNY_CDN_TOKEN_KEY`, `BUNNY_STREAM_LIBRARY_ID`, `BUNNY_STREAM_API_KEY`, `BUNNY_STREAM_CDN_HOSTNAME`

## Steps

1. In the owner's Bunny account: create a Storage Zone and a Pull Zone linked to it.
2. Enable Token Authentication on the Pull Zone ([[R-bunny-token-auth]]) and copy the token key.
3. (Video, later) create a Stream library, max 720p.
4. If content was uploaded to the dev zone and must be kept, copy those files to the new storage zone with the same paths, because `MediaAsset.path` is relative.
5. Set the new values in production env. Never paste keys into docs or chat.
6. Restart the app, then play one episode with an active account and confirm that a URL without a token is refused.
7. Delete or rotate the dev zone keys.
