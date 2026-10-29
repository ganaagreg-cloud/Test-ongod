---
id: ADR-0072
title: No mock checkout in production; without Wire keys payments are off and the portal says so
status: accepted
date: '2026-10-29'
supersedes: [ADR-0041 (only item 8, the ALLOW_MOCK_PAYMENTS override in production)]
tags: [adr, area/api, area/portal, area/payments]
---

## Context

The 2026-10-29 audit (F03, [[AUDIT-2026-10-29]]) found that `ALLOW_MOCK_PAYMENTS=1` turns on the mock checkout in production, i.e. free access by a configuration mistake. Ganaa then said the first deploy, for store review, needs no payments at all: the reviewer signs in with the demo account that gets access by a manual grant ([[STORE]]).

## Decision

1. The mock checkout runs only outside production. `ALLOW_MOCK_PAYMENTS` set in production makes the API refuse to start, naming the key.
2. "Payments open" = Wire is set up (`WIRE_API_KEY`), or this is development (mock). `GET /v1/plans` returns `paymentsOpen`; the apps never call it, and `/v1/app-config` is unchanged.
3. With payments off the portal still shows the plans (name, price, length), without "choose" buttons, with "Төлбөр удахгүй нээгдэнэ. Одоогоор багц худалдан авах боломжгүй." on the landing page, the plans page and the gift page; the gift links on the account page are hidden. A payment request still answers 503.
4. Adding the Wire keys and restarting opens payments; nothing else changes.

## Consequences

- The first deploy runs without Wire keys; review uses the demo account. No payment code is removed: it is switched off by configuration.
- API tests cover: production refuses the mock and the flag, `/v1/plans` says closed in production without Wire and open in development.
