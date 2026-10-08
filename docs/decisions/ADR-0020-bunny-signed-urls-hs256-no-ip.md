---
id: ADR-0020
title: 'Bunny signed URLs: HS256 token, no IP lock, ASCII paths'
status: accepted
date: '2026-10-08'
tags: [adr, area/media, area/backend]
---

## Context

[[ADR-0004-media-bunny-token-auth|ADR-0004]] chose Pull Zone Token Authentication and says the formula must follow Bunny's docs exactly. [[R-bunny-token-auth]] now records that formula. Several details are left open: which scheme, whether to lock tokens to an IP, which paths are allowed, and how to test the signer. This ADR refines ADR-0004; it does not change it.

## Decision

1. **Scheme: the current HMAC-SHA256 ("Advanced") token**, `HS256-` + base64url, as in [[R-bunny-token-auth]]. The deprecated MD5 "Basic" scheme is not used.
2. **No IP lock, and no IP parameter in our signer at all.** Phones change IP between Wi-Fi and mobile data in the middle of a 20–40 minute episode. A locked token would break playback and the app would have to re-request the URL. In the pull zone, token IP validation must be OFF. Playback is still limited by the short expiry (4 h) and by who can obtain a URL (active access plus a registered device).
3. **Paths are ASCII only.** The signer throws on any other character (and on spaces, `?`, `#`). Object paths are generated from IDs, not from titles, so this costs nothing and avoids encoding mismatches between our signer and Bunny's edge for non-ASCII text.
4. **Directory tokens (`token_path`) are supported by the signer but unused for audio.** Each audio file gets its own token. They are reserved for HLS video later, where one token must cover playlist and segments ([[ADR-0011-audio-first-media-asset|ADR-0011]]).
5. **Env:** the pull zone hostname is `BUNNY_PULL_ZONE_HOST` (renamed from `BUNNY_CDN_HOSTNAME` before anything used it); the token key stays `BUNNY_CDN_TOKEN_KEY`. Both stay in env so the account can be swapped ([[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]]).
6. **Testing: an oracle test against Bunny's reference `token.js`.** The signer must produce byte-identical URLs on 50 generated cases. The upstream repository declares no license (checked 2026-10-08, GitHub API `license: null`, no LICENSE file), so the file is not vendored. `scripts/fetch-bunny-reference.ts` downloads it at pinned commit `919fe7d` into a gitignored path and verifies its SHA-256. A live check against a real zone is `scripts/bunny-smoke.ts`.

## Alternatives rejected

- **IP-locked tokens:** break playback on network changes, and mobile carriers share IPs, so the extra protection is small.
- **Basic (MD5) token auth:** deprecated by Bunny.
- **Allowing non-ASCII paths:** the reference signs the path after URL normalisation; for Mongolian text that is percent-encoding that we would have to match exactly for no benefit.
- **Vendoring the reference `token.js`:** no license means all rights reserved.
- **A structure-only unit test:** it would pass even with a wrong signing order; it was replaced by the oracle test.
- **Our own expected values computed by the same code:** proves nothing about Bunny.

## Consequences

- The oracle test needs network the first time (`pnpm test` fetches the file when missing); afterwards it works offline. If upstream rewrites history and the hash no longer matches, the fetch script fails loudly.
- The oracle proves we agree with Bunny's reference code, not with Bunny's servers. Only the smoke script proves the live zone accepts our tokens; until it has been run, [[R-bunny-token-auth]] is not live-verified.
- Sorting several query parameters follows the reference (`localeCompare`). We sign at most `token_path`, so it is not exercised against the live edge.
- A URL can be shared until it expires (up to 4 h). Accepted risk, see ADR-0004 (no DRM).
- `bunny:smoke` uploads and deletes files in the dev storage zone; it needs real keys in the local `.env`.

## Evidence

- [[R-bunny-token-auth]] (VERIFIED: docs and reference code; live check pending)
- Reference code: <https://github.com/BunnyWay/BunnyCDN.TokenAuthentication> at `919fe7d6c17c9094565875e914adab957e922f10`, `nodejs/token.js`, SHA-256 `41828d0b…ba5492` (computed locally 2026-10-08).
- Tests: `apps/api/test/bunny-token.test.ts` (23 pass).
