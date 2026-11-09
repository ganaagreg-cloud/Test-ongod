---
id: ADR-0087
title: EAS project id has a fixed default in app.config.ts
status: accepted
date: '2026-11-09'
tags: [adr, area/mobile, area/devops]
---

## Context

`app.config.ts` is dynamic, so `eas init` cannot write the project id, and the id came only from `EAS_PROJECT_ID`. A new shell lost it and every `eas` command failed with "project not configured".

## Decision

`easProjectId = process.env.EAS_PROJECT_ID ?? '<project id>'`. The id of `@ganaa08100/zuvuutavuu` is public (it appears in expo.dev URLs), so it is not a secret. The env var still overrides it (a different Expo account or project).

## Consequences

- No shell setup before `eas build`/`eas update`. The same applies to later builds and OTA updates.
- Moving to another Expo account means changing this default or setting `EAS_PROJECT_ID`.
