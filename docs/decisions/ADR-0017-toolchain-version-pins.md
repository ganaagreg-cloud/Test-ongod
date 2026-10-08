---
id: ADR-0017
title: 'Toolchain pins: TypeScript 6.0, React 19.2.3, Prisma 7.10, pnpm 10 hoisted'
status: accepted
date: 2026-10-08
tags: [adr, area/backend, area/mobile]
---

## Context

Several latest releases are incompatible with each other or still pre-release (checked 2026-10-08).

## Decision

- **TypeScript ~6.0:** typescript-eslint does not support TypeScript 7 yet ([[R-typescript-eslint-ts-support]]).
- **React 19.2.3 in every app:** the version Expo SDK 57 requires; one React copy in the monorepo ([[R-expo-sdk-57-versions]]).
- **Prisma 7.10 + `@prisma/adapter-mariadb`:** the npm `latest` tag pointed to an 8.0 release candidate.
- **pnpm 10 with `node-linker=hoisted`:** Metro (React Native) needs a flat `node_modules`.

## Alternatives rejected

- **Latest everything:** lint breaks (TS 7) or a pre-release ORM ships to production (Prisma 8 RC).

## Consequences

- Re-check these pins when the research notes' `recheck_after` dates pass.
- Prisma refuses destructive commands when run by an AI agent ([[R-prisma-7-agent-guard]]), so tests use `migrate deploy`.

## Evidence

- [[R-typescript-eslint-ts-support]]
- [[R-expo-sdk-57-versions]]
- [[R-prisma-7-agent-guard]]
