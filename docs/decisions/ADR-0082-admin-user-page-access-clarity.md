---
id: ADR-0082
title: Admin user page separates account, access and history, and previews a grant
status: accepted
date: '2026-10-31'
tags: [adr, area/admin, area/design]
---

## Context

The admin user page mixed three things under one badge and one word ("Эрх"): the account status, the user role and the subscription access. The grant form showed the plan's price next to a form that charges nothing, and gave no hint of what the grant does to existing access. Facts checked in the code on 2026-10-31:

- `POST /v1/admin/users/:id/grants` creates a **new** ACTIVE subscription with `amountMnt` 0 and a `MANUAL_GRANT` payment of 0 (`apps/api/src/admin/decisions.ts`). Nothing is charged.
- The period starts at `max(now, end of the latest ACTIVE period)` and lasts the days given (`computePeriod`, SPEC E). An early grant is added after the remaining time, not over it; the user's `accessUntil` becomes the latest end.
- Removing a device deletes it and revokes that device's sessions; the auth guard reads the session on every request, so the device loses its login at once (`removeDevice`, `guard.ts`). The user's access is untouched.
- Revoking a subscription recomputes `accessUntil` from the remaining ACTIVE subscriptions, so access can continue if another one remains.
- The user detail already returns the audit entries (`targetId` = the subscription id, `data` holds the note or reason). A `paymentProvider` of NONE means "a manual grant or an old row", so it proves nothing by itself.

## Decision

1. Account and access are separate cards. Account status, role ("Хэрэглэгчийн үүрэг"), email verification and access state each carry their own badge next to the value ("Эрхийн хугацаа дуусах" sits in the access card).
2. The grant form shows the plan's list price as reference and says the grant charges 0₮, then a live preview of the result using the same rule as the API (`previewPeriod`, which repeats `computePeriod`'s rule and has its own unit test; it does not import the API code). It says whether the new period continues after the current one or starts now, always as a separate record. With an invalid duration it shows no date. The start can differ by the time spent confirming, and the preview says so. The idempotency key and the confirmation dialog are unchanged.
3. The history shows plan, source, amount, period, created date, and the granting or revoking admin, note and reason when the audit log has them. A row is called a manual grant only when an audit entry says so; a 0₮ row with no entry shows "Төлбөрийн арга бүртгэгдээгүй".
4. Device removal and revocation use an outlined danger button and say what actually happens (sign-in ends, access unchanged; other periods keep access). After the dialog closes, focus goes to the card heading or the history row when the trigger is gone.
5. No API or billing change. Layout uses wrapping (no width media queries, per `admin.css`): 2:3 columns, and history rows as grids of labelled cells instead of a separate mobile card list.

## Consequences

- Changed: `UserDetail.tsx`, `lib/access.ts`, `bits.tsx` (AccessBadge), `admin.css`, `mn.ts`, a unit test.
- The audit list is capped at 100 entries, so an old grant may show without its admin or note.
- The history is one responsive row component, not a `<table>` plus a card list.
