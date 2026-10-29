---
id: ADR-0063
title: Node 22 for development, CI and the mobile build; the API stays buildable for Node 20
status: 'accepted (item 2 and 3, the API build target, superseded by [[ADR-0064-api-on-node-22|ADR-0064]])'
date: '2026-10-29'
supersedes: [ADR-0002 (only "Node 20"), ADR-0036 (only the Node version CI reads from .nvmrc)]
tags: [adr, tooling]
---

## Context

[[ADR-0048-upgrade-to-expo-sdk-58|ADR-0048]] moved the mobile app to Expo SDK 58 (`expo` 58.0.19, `react-native` 0.88), which declare Node `^22.13.0 || ^24.3.0 || >=26` in their `engines`. The project, `.nvmrc`, CI ([[ADR-0036-ci-github-actions|ADR-0036]]), `CLAUDE.md` and [[ADR-0002-api-fastify-prisma-mysql-single-process|ADR-0002]] said Node 20. Install and typecheck worked on Node 20 (CI was green on it), but Metro and native builds are not supported there. The cloud session already ran Node 22.22 and everything passed. Ganaa decided on 2026-10-29 to move to Node 22.

## Decision

1. `.nvmrc` is `22`, so CI and every developer use Node 22. `engines.node` is `>=22.13.0`. `@types/node` is `^22` in every package.
2. **The API build target stays `node20`** (`apps/api/tsup.config.ts`). The Node version of the production host (iTools) is not known yet ([[R-hosting-limits]], TO-VERIFY, [[open-questions]] #2 and #5), so the output must not need a feature newer than Node 20. The API source uses nothing Node-22-only today.
3. When iTools' Node version is known: if it is 22 or newer, move the API target to `node22` and drop this exception with a new ADR; if it is 20, the API must keep avoiding Node-22-only features, and the tests that run on Node 22 do not prove that.

## Alternatives rejected

- Stay on Node 20 and ignore the `engines` of Expo and React Native: unsupported, and breaks at the next patch.
- Node 22 only for the mobile app, Node 20 for the rest: two Node versions in one monorepo with one `.nvmrc` and one CI job.
- Node 24: not needed yet.

## Consequences

- Everyone installs Node 22 (`nvm use`, or the installer); `pnpm install` warns on Node 20 from now on.
- The API is tested on Node 22 but may run on 20 in production until [[R-hosting-limits]] says otherwise. This is a known gap, listed in [[LAUNCH_CHECKLIST]].
- `CLAUDE.md` "Stack: Node 20" becomes "Node 22".
