---
id: ADR-0003
title: Hosting = iTools Node.js hosting, VPS only as fallback
status: accepted
date: 2026-10-08
tags: [adr, area/hosting]
---

## Context

The project needs low-cost hosting in Mongolia for one Node process plus MySQL. Media is served by Bunny, not by the app server ([[ADR-0004-media-bunny-token-auth|ADR-0004]]).

## Decision

iTools Node.js hosting. Move to an iTools Cloud 3 VPS only if launch-day limits fail (load, process limits, uploads).

## Alternatives rejected

- **Vercel + Supabase:** 4.5 MB request body limit (receipt and media uploads) and cost. The figure comes from planning chats and has no research note yet.

## Consequences

- One process, so the job worker runs in-process and `/v1/cron/tick` exists for hosts that idle the process ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]).
- Open: [[open-questions]] #2 (DB engine) and #5 (launch-day limits).

## Evidence

- [[R-hosting-limits]] (TO-VERIFY).
