---
topic: Bunny Pull Zone Token Authentication formula and Storage API upload
status: VERIFIED
checked: '2026-10-08'
recheck_after: '2027-01-06'
source: 'https://bunny.net/docs/cdn/security/token-authentication/advanced · https://bunny.net/docs/cdn/security/token-authentication/basic · https://github.com/BunnyWay/BunnyCDN.TokenAuthentication (nodejs/token.js) · https://bunny.net/docs/storage/http'
tags: [research, area/media]
---

## Fact

**Token auth (current, "Advanced", HMAC-SHA256).** `token = "HS256-" + flags + base64url(HMAC-SHA256(key = security key, message = signature_path + expires + ip_bytes + signing_data))`. `signature_path` is the URL path, or the `token_path` value when set (directory token). `expires` is a UNIX timestamp in seconds (decimal string). `ip_bytes` is empty without an IP lock (with one: raw bytes, IPv6 masked to /64, and `flags` = `1-`). `signing_data` = the query parameters (plus `token_path`, `token_countries`, `token_countries_blocked`, `limit` when used) sorted by key, as raw `key=value` joined by `&`, excluding `token` and `expires`; empty when there are none. base64url = standard base64 with `+`→`-`, `/`→`_`, `=` removed. URL: `https://<host><path>?token=<token>[&<params>]&expires=<expires>`. A directory token puts `token_path` (URL-encoded) in the query, or uses the path form `/bcdn_token=<token>&...&expires=<e>/<path>`, which Bunny recommends for HLS/DASH.

**Basic token auth is deprecated:** `base64url(MD5(key + path + expires [+ ip]))`, params `token` + `expires`. Do not use it for new work.

**Storage API upload:** `PUT https://<region host>/<StorageZoneName>/<path>/<file>`, header `AccessKey: <storage zone password>` (not the account or Stream API key), body = raw binary, optional `Content-Type` and `Checksum` (uppercase hex SHA-256). Response `201` = uploaded, `401` = bad key, wrong region host or non-binary body; missing folders are created. Hosts: Frankfurt `storage.bunnycdn.com`; others add a prefix: `uk.`, `ny.`, `la.`, `sg.`, `se.`, `br.`, `jh.`, `syd.` (e.g. `uk.storage.bunnycdn.com`).

**Docs disagree on IP order:** the docs page and `token.js` sign `path + expires + ip + signing_data`; the repo README says `path + expires + signing_data + ip`. We follow the code. It does not matter while tokens are not IP-locked (we do not lock, since mobile IPs change).

## How it was checked

- Fetched the Advanced and Basic token auth pages and the storage HTTP page (WebFetch, 2026-10-08).
- Read the reference implementation `nodejs/token.js` verbatim with `gh api repos/BunnyWay/BunnyCDN.TokenAuthentication/contents/nodejs/token.js`. The signing order, `token_path` inclusion and encoding above come from that code.
- **Not yet checked against a live zone:** a signed URL on `ongod-dev` should return 200 and a tampered one 403, and the pull zone must have token authentication enabled in the current (non-deprecated) mode. Do this at the first Bunny smoke test ([[BUNNY_SWITCH]]).
- Pull zone URL for storage-backed content: `https://<pull zone hostname>/<path in the storage zone>`; hostname comes from env (`BUNNY_PULL_ZONE_HOST`), not verified against the dashboard yet.

- Licence of the reference repo: GitHub API `license: null` and no LICENSE file in the root (`gh api repos/BunnyWay/BunnyCDN.TokenAuthentication`, 2026-10-08), so it is fetched at commit `919fe7d` with a SHA-256 check, not vendored.

## Used by

- [[ADR-0004-media-bunny-token-auth|ADR-0004]]
- [[ADR-0020-bunny-signed-urls-hs256-no-ip|ADR-0020]]
- [[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]]
- [[BUNNY_SWITCH]]
