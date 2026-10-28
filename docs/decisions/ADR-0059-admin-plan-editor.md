---
id: ADR-0059
title: The owner manages plans in the admin (Багц): add, edit, switch off
status: accepted
date: '2026-10-28'
tags: [adr, area/backend, area/admin]
---

## Context

Monthly and yearly plans were accepted as a paid add-on on 2026-10-28 ([[changes]], [[SPEC]] K). The data model and the portal already handle several plans (`Plan`, `GET /v1/plans`, [[ADR-0058-portal-design-a-aurora|ADR-0058]]), but only the seed creates one, and the seed reset its price and days on every run. The monthly price is still open ([[open-questions]] #30), so the owner must be able to set it without a release.

## Decision

1. Admin routes, any ADMIN or OWNER (like grants and revokes, SPEC E):
   - `GET /v1/admin/plans`: every plan, active first, with its number of subscriptions;
   - `POST /v1/admin/plans`: name, days, price, active;
   - `PATCH /v1/admin/plans/:id`: any of those fields.
2. Validation (zod, `packages/shared`): name 2–60 characters, unique ignoring case (`PLAN_NAME_TAKEN`); days 1–3660; price a whole number of tugrik, 100–100,000,000. The lower bound keeps a zero or near-zero QPay invoice from being created by mistake (ASSUMPTION: the real QPay minimum is not checked).
3. **Days are fixed once a plan is used.** Activation reads the plan's days when the payment arrives (SPEC D), so changing the days of a plan with any subscription would change what open requests and history mean. Such a change is refused (`PLAN_IN_USE`). The owner adds a new plan and switches the old one off instead. Name and price can change at any time; a request keeps the amount it was created with (`Subscription.amountMnt`).
4. **No delete.** A plan is switched off (`active: false`). It leaves the portal list and cannot be chosen, but its subscriptions and open requests stay as they are. Switching off the last active plan is refused (`LAST_ACTIVE_PLAN`), so the portal always has something to sell.
5. Each change runs in one transaction with an audit row (`plan.create`, `plan.update` with the changed fields).
6. The seed creates the yearly plan only if it is missing and no longer overwrites it.
7. Admin page "Багц" under Төлбөр: a table (name, price, days, subscriptions, active badge) and a dialog to add or edit.

## Alternatives rejected

- Owner-only editing: there is no owner-only area yet, and admins already grant and revoke access. Can be added later if the owner asks.
- Store the days on each subscription so plan days can change freely: a schema change and migration for a rare need; a new plan does the same job.
- Delete plans without subscriptions: a switch is enough and never loses data.

## Consequences

- The apps are unchanged: they never show plans or prices ([[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]]).
- The portal lists the active plans cheapest first; a monthly plan appears there as soon as it is added.
- Tests cover the admin-only access, validation, the days rule, the last-active rule, the audit rows and that a switched-off plan cannot be chosen.
