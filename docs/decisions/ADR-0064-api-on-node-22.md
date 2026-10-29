---
id: ADR-0064
title: The API is built for Node 22 and needs Node 22 on the host
status: accepted
date: '2026-10-29'
supersedes: [ADR-0063 (only item 2 and 3, the API build target)]
tags: [adr, tooling, area/backend, area/hosting]
---

## Context

[[ADR-0063-node-22-toolchain|ADR-0063]] moved development, CI and the mobile build to Node 22 but kept the API build target at `node20`, because the host's Node version is unknown ([[R-hosting-limits]], TO-VERIFY). That leaves a gap: the API is tested on Node 22 and may run on Node 20. Ganaa decided on 2026-10-29 to use Node 22 for the API too.

## Decision

1. `apps/api/tsup.config.ts` targets `node22`. `apps/api/package.json` gets `engines.node >= 22.13.0`, the same as the root. Tests and production then run the same Node major.
2. **The host must run Node 22 (22.13 or newer).** This is a launch gate: it is ASSUMPTION until iTools confirms it ([[R-hosting-limits]], [[open-questions]] #2 and #5). The check is in [[LAUNCH_CHECKLIST]].
3. If iTools cannot run Node 22, the options are another host that can, or going back to `node20` with a new ADR. The code does not use anything newer than Node 20 today, so going back is a one-line change.

## Alternatives rejected

- Keep `node20` as the build target: a green test run on Node 22 would not prove the API works on a Node 20 host.
- Pick a Node version by the host's current default: it is not known yet.

## Consequences

- If the host has an older Node, the API will not start there (the `engines` field warns on install, and the bundle may use syntax Node 20 rejects). Find this out before launch, not at launch.
- The deploy notes and the host's Node setting must say 22 ([[DEPLOY]]).
