---
id: ADR-0046
title: 'Remove the bank-transfer payment path'
status: accepted
date: '2026-10-24'
tags: [adr, area/payments, area/admin, area/portal, area/backend]
---

## Context

[[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]] made QPay through Wire the only way to pay, and kept the old bank-transfer flow "for old requests": the member's "Төлсөн" submit with a receipt photo, the admin queue that approves or rejects PAYMENT_SUBMITTED requests, and the receipt store. The audit of 2026-10-24 (finding 5) found that nothing creates such a request any more, the owner has not launched with real bank requests, and the path costs code, tests, a private disk folder (`RECEIPTS_DIR`) and a second approval workflow to maintain. Ganaa decided on 2026-10-24 to remove everything bank-related.

## Decision

- Remove, in code: the member submit route and service method (`POST /v1/subscriptions/:id/submitted`), the receipt store and upload (`subscriptions/receipts.ts`, `RECEIPTS_DIR`), the admin receipt endpoint and view, the admin approve / reject endpoints and queue (PAYMENT_SUBMITTED handling, keyboard shortcuts, rejection emails), bank-only fields in DTOs and screens (`payerNote`, `transferAt`, `hasReceipt`, `submittedAt`, `rejectReason`), the portal screens and texts for bank requests, `pnpm dev:approve`, and their tests and fixtures.
- Keep: QPay through Wire and the mock checkout, manual grant and revoke by the admin (gift, store-reviewer demo account), the payments list for all requests (search, status filter, history), the CSV export if it works for every payment method, the audit log, the reference code, all emails and pushes for QPay.
- Database: no schema change in this ADR. The columns (`payerNote`, `transferAt`, `proofImagePath`, `submittedAt`, `rejectReason`) and the enum values `PAYMENT_SUBMITTED` and `REJECTED` stay unused so an old database still reads. A later migration drops them after the production data is checked.
- Before the first deploy that contains this change the owner checks `SELECT COUNT(*) FROM Subscription WHERE status = 'PAYMENT_SUBMITTED'`; it must be 0 (a request in that state would no longer be decidable). Written into [[DEPLOY]].
- SPEC (surfaces, workflows D and E, data model) and DESIGN (payments queue, portal screens) are updated as a separate commit and shown to Ganaa before the push.

## Alternatives rejected

- Keep the member side removed but the admin queue for leftovers: still two approval workflows and a receipt-less queue; the owner chose full removal.
- Convert leftover PAYMENT_SUBMITTED rows to CANCELLED in a migration: silently drops a customer who already paid by bank; a count check before deploy is safer.
- Drop the columns and enum values now: a destructive, hard-to-reverse migration for little gain; done later with data checked.
- Cancel the removal (keep ADR-0041 as is): leaves dead code, a private disk folder and a second workflow to test.

## Consequences

- [[ADR-0006-manual-bank-transfer-web-only-payments|ADR-0006]] and the old-request part of [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]] no longer apply; [[ADR-0023-subscription-workflows-implementation|ADR-0023]] keeps only what QPay and manual grants use.
- About 40 files change, with their tests; `admin-payments.test.ts` shrinks to the list, grant and revoke tests.
- Admin Payments becomes a list of all requests plus the CSV export; the dashboard counter "Шалгах төлбөр" goes.
- No access can be granted by an admin except by manual grant; a payment that did not go through Wire has no path.
- `DEVICE_SMOKE` way 3 to give a test account access (`pnpm dev:approve`) is replaced by the mock checkout's "Simulate success".

## Evidence

- Audit report, 2026-10-24 session (finding 5); [[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]].
