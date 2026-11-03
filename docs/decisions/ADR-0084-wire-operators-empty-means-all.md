---
id: ADR-0084
title: 'An empty WIRE_ALLOWED_OPERATORS sends no operator list'
status: accepted
date: '2026-10-31'
tags: [adr, area/payments, area/api]
---

## Context

[[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]] #11 made an empty `WIRE_ALLOWED_OPERATORS` mean `['sandbox']`. On 2026-10-31 Wire rejected a test-key payment intent with: `allowed_operators[0] "sandbox" is not an operator id. Use the operator ids enabled on your project ... or omit allowed_operators to use all of them.` Creating a subscription answered 503 and the mobile and portal pay buttons did nothing. The error text is Wire's own; the documentation was not read ([[R-wire-qpay-gateway]], TO-VERIFY).

## Decision

1. An empty `WIRE_ALLOWED_OPERATORS` now sends no `allowed_operators` field, so Wire uses every operator enabled on the project. A non-empty list is sent as before.
2. No other default. Production should still set the exact operator id (for example `qpay`) so a second enabled operator cannot appear by accident.
3. `.env.example` explains it. A test checks both cases (nothing sent when empty, ids sent when set).

## Alternatives rejected

- **Guess `qpay` as the new default:** the id is project specific; a wrong guess fails the same way.
- **Keep `sandbox`:** Wire rejects it for this project.

## Consequences

- Test keys work without knowing an operator id.
- A project with several enabled operators shows all of them in the checkout until the list is set.

## Evidence

- Wire error text quoted above (API log, 2026-10-31); [[R-wire-qpay-gateway]] (TO-VERIFY).
