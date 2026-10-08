---
id: ADR-0005
title: Development uses Ganaa's Bunny dev zone; production uses the owner's account
status: accepted
date: 2026-10-08
tags: [adr, area/media, area/process]
---

## Context

Development needs Bunny before the owner's account exists. Production media and billing must belong to the owner.

## Decision

Development uses Ganaa's personal Bunny dev zone (`ongod-dev`). Production must use the owner's Bunny account. Switching accounts is an env change only: every Bunny setting is read from `BUNNY_*` env vars. Procedure: [[BUNNY_SWITCH]].

## Alternatives rejected

- **Owner's account from day one:** blocks development until the owner sets it up.

## Consequences

- No Bunny hostnames, keys or zone names in code.
- Media uploaded during development stays in the dev zone; production starts clean, or files are copied over as part of the switch.

## Evidence

- None external.
