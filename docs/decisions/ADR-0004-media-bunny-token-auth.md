---
id: ADR-0004
title: Media = Bunny Storage + Pull Zone with Token Authentication, no DRM
status: accepted
date: 2026-10-08
tags: [adr, area/media]
---

## Context

Paid members-only audio (later video). Links must stop working without access ([[SPEC#Acceptance tests (must pass before launch)]]). Budget is small.

## Decision

Bunny Storage Zone + Pull Zone with Token Authentication (short-lived signed URLs issued only to users with active access). No DRM. Video later goes through a Bunny Stream library, max 720p.

## Alternatives rejected

- **DRM:** $99/month base cost, too expensive for this project (figure from planning).
- **Cloudflare Stream:** 3–6× the cost of Bunny for this usage (figure from planning).

## Consequences

- The token formula must follow Bunny's docs exactly ([[R-bunny-token-auth]], TO-VERIFY).
- All Bunny settings live in env ([[ADR-0005-bunny-dev-zone-env-switch|ADR-0005]]).
- A determined member can still record audio; accepted risk without DRM.

## Evidence

- [[R-bunny-pricing]]
- [[R-bunny-token-auth]]
