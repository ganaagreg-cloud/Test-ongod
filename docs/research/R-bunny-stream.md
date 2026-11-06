---
topic: Bunny Stream (video) pricing, encoding ladder, HLS token auth, original files, DRM
status: TO-VERIFY
checked: '2026-10-18'
recheck_after: '2027-01-16'
source: 'web search summaries of https://bunny.net/docs/stream/pricing, https://bunny.net/docs/stream/video-specification, https://bunny.net/docs/stream/encoding, https://bunny.net/docs/stream/security, https://bunny.net/docs/stream/mediacage-basic-guide, https://bunny.net/docs/storage/pricing, https://bunny.net/docs/cdn/pricing (bunny.net and docs.bunny.net not reachable from the session)'
tags: [research, area/media, cost]
---

## Fact

All TO-VERIFY (read through search summaries of Bunny's docs on 2026-10-18, not on the pages themselves):

- **Billing lines:** encoding, transcribing, DRM licences, storage, CDN delivery; the account's $1 monthly minimum ([[R-bunny-pricing]], VERIFIED).
- **Encoding:** standard H.264 encoding is free. Premium encoding is $0.025–0.150 per output minute per codec (not needed here).
- **Default H.264 ladder (video bitrate):** 240p 600, 360p 800, 480p 1,400, **720p 2,800**, 1080p 5,000 kbps; AAC audio 256 kbps. Resolutions can be switched off and bitrates edited per library; changes apply only to later uploads.
- **Storage (HDD):** $0.01/GB/month in the default region (Frankfurt); a 2nd region +$0.01, each further region +$0.005. Every enabled resolution is stored separately. **Keep original files** stores the source too; it must be on before upload and is needed to re-encode later.
- **Delivery:** Standard network Asia & Oceania $0.03/GB (same rate as [[R-bunny-pricing]], VERIFIED for the CDN; that Stream uses it is TO-VERIFY). Volume network $0.005/GB for the first 500 TB, but only about 10 PoPs.
- **Security:** CDN token authentication on the library's pull zone covers direct URLs (HLS playlist, segments, thumbnails, MP4 fallback). HLS needs **path-style directory tokens** (`token_path`) so the segments are signed with the playlist; query-string tokens do not cover segments. Embed view tokens only protect Bunny's iframe player.
- **DRM:** **MediaCage Basic** is free and "prevents most download attempts", but uses clear-key encryption (keys reach the client in the clear). **MediaCage Enterprise** (Widevine, FairPlay, screen-grab protection) is $99/month per library plus per-licence fees.

- **Stream HTTP API** (TO-VERIFY): base `https://video.bunnycdn.com`, header `AccessKey: <library API key>`. Create: `POST /library/{libraryId}/videos` with `{"title"}` → `guid`. Upload: `PUT /library/{libraryId}/videos/{guid}` with the raw file (TUS recommended for large files). Read: `GET …/videos/{guid}` (`status`, `encodeProgress`, `length` in seconds). Delete: `DELETE …/videos/{guid}`. Playlist `https://<library CDN host>/{guid}/playlist.m3u8`, thumbnail `/{guid}/thumbnail.jpg`.
- **Video `status` numbers are not confirmed:** sources disagree (a webhook enum with 3 = finished, 5 = failed; plugins reading the video object with 4 = finished). The API treats 4, or `encodeProgress` 100 with a length, as ready and 5 / 6 as failed; check against the first live upload.
- **MediaCage Basic reportedly works only in Bunny's own player** (a player vendor's guidance, TO-VERIFY): keep it **off** for this library, or expo-video cannot play.

## Live findings (VERIFIED by live test, 2026-11-03, new account)

- **Status numbers:** a finished video has `status` 4 with `encodeProgress` 100 (the 4 = finished reading above is right).
- **Stored size is a multiple of the source.** A 62-minute 360p upload (source recorded as about 99 MB in `MediaAsset.sizeBytes`) shows `storageSize` about 659 MB on Bunny, about 6.6 times. A 98-minute 720p video shows about 2.83 GB. Plan cost from the Bunny `storageSize`, not the file size. Whether the original is kept was not checked.
- **Signed HLS playback works** with the app's signer (`path-style` directory token, `tokenPath: /<guid>/`, token in the URL path): playlist 200, variant playlist by relative URL 200, segment with Range 206. No token, tampered token, expired token and a token for another video all return 403.
- **"Block direct URL file access" must be OFF** on the library's pull zone, with Token Authentication ON. With it on, even a correct token gets 403 (also happens with no referrer, as in the app). Settings take about 30 to 45 seconds to apply.
- The stream and storage rates themselves are still TO-VERIFY above; compare the first invoice.

## How it was checked

Web search, 2026-10-18 (several queries); direct fetches of bunny.net and docs.bunny.net failed (session network policy). Third-party reviews disagree on base storage and delivery rates; the figures above are the ones attributed to Bunny's own docs. Before quoting the client: open the pricing pages, and measure a real 40-minute upload (rendition sizes, actual bitrate of slide video).

Not found: whether MediaCage Basic works with native players (expo-video / AVPlayer / ExoPlayer) or only Bunny's web player.

## Used by

- [[ADR-0038-video-episodes-bunny-stream|ADR-0038]] (proposed)
- [[changes]] 2026-10-18 video entry
