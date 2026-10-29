---
id: ADR-0071
title: Fixes from the 2026-10-29 external audit (webhook order, upload handoff, grant key, comment quota, moderation queue)
status: accepted
date: '2026-10-29'
supersedes:
  [
    ADR-0041 (only when a webhook event is recorded),
    ADR-0061 (only which comments the reported list holds,
    and "hide" on a comment the reports hid),
  ]
tags: [adr, area/api, area/admin, area/portal]
---

## Context

An external audit (ChatGPT/Codex, read-only, commit 3c58d55; summary in [[AUDIT-2026-10-29]]) reported ten findings. Each was checked against the code; F01, F02 and F04 to F08 and F10 were confirmed as real and are fixed here. F03 and F09 are open (see the note).

## Decision

1. **Webhook (F01, F08).** A Wire event is recorded only after it has been applied. A crash in between makes Wire's retry run it again instead of being skipped as a duplicate; applying stays idempotent (one transaction, status precondition). Signature and setup errors use the shared `{error: {code, message}}` shape (400 `BAD_REQUEST`, 503 `SERVICE_UNAVAILABLE`).
2. **Upload handoff (F04).** The tus record is deleted only after the row is PROCESSING and the job is queued. A cron task `recoverFinishedUploads` picks up any row still UPLOADING after 5 minutes whose file is already complete in its folder (the move is a rename) and queues it once.
3. **Manual grant (F02).** The admin sends one `requestId` (UUID) per grant it means to make, stored as `Subscription.grantKey` (unique). The same key again returns the first grant instead of adding another period; a key used for another member is refused (400).
4. **Comment quota (F05).** Counting and inserting run in one transaction under the user's row lock, so parallel posts cannot pass 5 a minute / 40 a day together.
5. **Moderation queue (F06).** "Гомдолтой" lists reported comments that are visible or hidden by the reports themselves. "Нуусан хэвээр үлдээх" (hide by the admin) takes an auto-hidden one out of the list; "Буцааж харуулах" restores it as before.
6. **Portal (F07, F10).** "Миний бэлгүүд" shows "Төлөв шалгах" when its automatic checks stop, and checks again when the tab is opened. The payment status page says cancelled, request expired, access ended or revoked, each in its own words.

## Open, not code

- **F03:** production can still use the mock checkout if `ALLOW_MOCK_PAYMENTS=1` is set (ADR-0041 item 8). Whether to forbid it outright in production is Ganaa's call.
- **F09:** store links and the support contact come with the launch (LAUNCH_CHECKLIST).

## Consequences

- One migration (`20261029120000_grant_key`). API tests 655 pass, including new ones for each fix.
