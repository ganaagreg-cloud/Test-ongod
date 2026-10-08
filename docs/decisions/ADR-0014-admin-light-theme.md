---
id: ADR-0014
title: Admin uses a light theme with the same token keys as dark
status: accepted
date: 2026-10-08
tags: [adr, area/design]
---

## Context

The admin is a dense desktop tool ([[DESIGN#Admin screens]]); the apps and portal are dark.

## Decision

`themes.light` in `packages/tokens` has exactly the same keys as `themes.dark`, so components work in both. CSS: dark on `:root`, light under `[data-theme="light"]`. The admin sets `<html data-theme="light">`. The values are in [[DESIGN#Admin screens]].

## Alternatives rejected

- **A separate admin token set:** components would need two code paths.

## Consequences

- A unit test fails if the two themes' keys differ.
- Known gap: some light status badges fall below AA ([[R-admin-light-contrast]], [[open-questions]] #13).

## Evidence

- [[R-admin-light-contrast]]
