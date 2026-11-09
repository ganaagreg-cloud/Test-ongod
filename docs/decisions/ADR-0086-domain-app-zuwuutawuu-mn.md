---
id: ADR-0086
title: Production host is app.zuwuutawuu.mn
status: accepted
date: '2026-11-09'
supersedes: [ADR-0081 (only item 3, the domain)]
tags: [adr, area/hosting, area/brand]
---

## Context

[[ADR-0081-store-name-without-question-marks-domain|ADR-0081]] left the domain open (`zuvuutavuu` + unknown TLD). Ganaa gave the real one on 2026-11-09: `https://app.zuwuutawuu.mn/`. Note the spelling uses **w**, while the technical names (slug, scheme, `mn.zuvuutavuu.app`) keep **v** ([[ADR-0080-app-name-zuvuutavuu|ADR-0080]]); they are not renamed.

## Decision

1. Production host: `https://app.zuwuutawuu.mn` (the VPS of [[ADR-0075-hosting-own-vps|ADR-0075]]). One process: API at `/v1`, portal at `/`, admin at `/admin`.
2. `PUBLIC_BASE_URL`, `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_PORTAL_URL` in production are `https://app.zuwuutawuu.mn`. Terms, privacy and deletion links for the stores are `https://app.zuwuutawuu.mn/{terms,privacy,...}`.
3. Values live only in env (EAS environment, server `.env`); the repo keeps placeholders.

## Consequences

- Closes [[open-questions]] #9 as answered. Domain price/VAT (#8) is untouched.
- Whether the apex `zuwuutawuu.mn` is used for anything else is not decided.
