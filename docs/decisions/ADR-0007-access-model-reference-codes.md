---
id: ADR-0007
title: Access model = Plan + Subscription + Payment; reference code ONG-XXXXX
status: accepted
date: 2026-10-08
tags: [adr, area/backend, area/payments]
---

## Context

The owner matches bank transfers to users by hand ([[SPEC#Workflows]] D, E).

## Decision

`Plan`, `Subscription` and `Payment` tables; `User.accessUntil` is only a cache of the current access end. Each subscription has a unique reference code `ONG-XXXXX` without ambiguous characters, written in the transfer description. The username stays searchable in the admin queue.

## Alternatives rejected

- **Email address in the bank description:** error-prone (typos, length limits, special characters).

## Consequences

- Approving recomputes `accessUntil` in the same transaction.
- See [[SPEC#Data model (Prisma)]].

## Evidence

- None external.
