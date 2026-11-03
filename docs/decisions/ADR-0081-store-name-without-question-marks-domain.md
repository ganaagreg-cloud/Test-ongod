---
id: ADR-0081
title: Store name without question marks, the domain is zuvuutavuu
status: accepted
date: '2026-11-03'
supersedes: [ADR-0080 (only item 4 and the open domain in item 2)]
tags: [adr, area/brand, area/mobile]
---

## Context

[[ADR-0080-app-name-zuvuutavuu|ADR-0080]] said to try the store title with question marks and fall back if a store refused them (store rules TO-VERIFY). Ganaa decided on 2026-11-03: no question marks towards the stores, and the domain is `zuvuutavuu` too.

## Decision

1. **Towards the stores the name is "Зөв үү Тав уу"** (no question marks): the store listing title, and the app label under the icon (`name` in `apps/mobile/app.config.ts`, which the stores and the phone use). No store rule needs to be read for this.
2. **Inside our own screens** the name stays "Зөв үү? Тав уу?" (app texts, portal, emails, share image).
3. **Domain:** `zuvuutavuu` plus a top-level domain that is not chosen yet ([[open-questions]] #8, #9). Not bought or checked for availability.
4. Technical names stay `zuvuutavuu` (slug, scheme, `mn.zuvuutavuu.app`).

## Consequences

- The question about the stores accepting question marks is closed. The label under the icon is shorter by one mark but may still be cut off on a phone; check on a device.
- The privacy, terms and deletion page links given to the stores must use the final domain ([[STORE]]).
