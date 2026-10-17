---
id: ADR-0036
title: CI on GitHub Actions for every push and pull request
status: accepted
date: 2026-10-17
tags: [adr, tooling, area/process]
---

## Context

Nothing ran the checks automatically. The API suite went unrun for over a week and two broken tests slipped through ([[AUDIT-2026-10-17]]). Ganaa wants zero cost.

## Decision

1. `.github/workflows/ci.yml` runs on every push and pull request, on the standard `ubuntu-latest` runner, with Node from `.nvmrc` and pnpm from `packageManager`. A newer push to the same branch cancels the older run.
2. Job **checks**: `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `format:check`, `build`, then `git diff --exit-code` (generated files such as `packages/tokens/css` must be committed), then the unit tests of every package except the API (the portal's no-dev-in-build test runs against the fresh build).
3. Job **api**: the Vitest suite against a throw-away MySQL 8.4 service container. Root has an empty password (the container only exists for the job), so the workflow holds no credentials; the tests take everything else from `testEnv()`.
4. Not in CI yet: the Playwright e2e suites (they need the API, Mailpit, Metro and browsers) and native builds. They stay manual ([[DEVICE_SMOKE]]).
5. Design-tool exports (`docs/design/**/*.html`) are left out of Prettier, so `format:check` can pass.

## Alternatives rejected

- **No CI, run checks by hand:** that is how the broken tests got in.
- **EAS Workflows or another CI service:** GitHub Actions sits next to the code and needs no extra account.
- **MySQL with a password from repository secrets:** nothing to protect in a container that lives for one job; a secret would only add setup.

## Consequences

- Free while the repository is public; if it becomes private, about 2,000 minutes a month on GitHub Free ([[R-github-actions-billing]], TO-VERIFY). A run takes a few minutes.
- A push that breaks typecheck, lint, formatting, a generated file or a test shows a red check on GitHub.
- Adding the e2e suites later needs its own ADR (services, browsers, run time).

## Evidence

- [[R-github-actions-billing]] (TO-VERIFY).
- The two jobs were run locally in a clean environment before committing (log [[2026-10-17]]).
