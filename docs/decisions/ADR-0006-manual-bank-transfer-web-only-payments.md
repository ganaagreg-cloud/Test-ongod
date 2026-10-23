---
id: ADR-0006
title: Manual bank transfer approved in admin; payment UI only in the web portal
status: 'accepted (the bank-transfer part superseded by ADR-0041 and [[ADR-0046-remove-bank-transfer-path|ADR-0046]]; payment UI only in the web portal still stands)'
date: 2026-10-08
tags: [adr, area/payments, area/mobile]
---

## Context

Yearly paid access. Store rules restrict payment for digital content inside the apps ([[R-apple-no-payment-ui]], [[R-google-play-payments]]).

## Decision

Payment is a manual bank transfer that the owner approves in admin ([[SPEC#Workflows]] D, E). Payment UI exists only in the web portal. The iOS and Android apps show no price, plan, bank details or links to payment; the no-access state only offers "Эрхээ шалгах".

## Alternatives rejected

- **In-app paywall (from the client's concept):** violates store rules ([[ADR-0012-design-dark-theme-inspiration-only|ADR-0012]]).
- **QPay now:** later, as a paid add-on.

## Consequences

- `/v1/app-config` must never expose prices or plans (enforced by its zod schema).
- Scope clarification for the client: [[changes]].

## Evidence

- [[R-apple-no-payment-ui]] (ASSUMPTION)
- [[R-google-play-payments]] (TO-VERIFY)
