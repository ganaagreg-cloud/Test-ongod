---
id: ADR-0074
title: 'Audit fixes: media serialization, playback deadline and cron races'
status: accepted
date: '2026-11-02'
tags: [adr, area/backend, area/mobile]
---

## Context

[[AUDIT-2026-11-02]] R10–R13 identified media replacement races, uninterrupted playback after access expiry, stale scheduled publication, and skipped reminder candidates starving later members. The owner authorized these fixes and decided that playback must pause at the known access deadline, not before it.

## Decision

- R10: lock the episode with a no-op Prisma update as the first transaction statement. Upload creation checks PROCESSING, removes abandoned UPLOADING/FAILED rows, and creates its replacement under that lock. Finish/recovery handoff also takes the episode lock. Audio/video completion switches to READY conditionally; only the winner removes other READY/FAILED assets. UPLOADING/PROCESSING assets are preserved. Filesystem and remote cleanup follow the committed switch. No new raw SQL.
- R11: add optional nullable `accessEndsAt` to the play response. Paid items return the member's access end; free items return null. `expiresAt` remains the signed URL expiry. The controller uses an injected timer and clock to pause, flush progress and emit the existing NO_ACCESS state at the deadline, checks on foreground return and guards playing engine events. Opening another episode or closing clears the previous timer. Long delays are scheduled in bounded timer intervals. No renewal-during-playback is introduced.
- R12: cron publication compares the schedule it selected as well as SCHEDULED status. For successful updates it re-reads current title and push settings inside the transaction before queueing notifications.
- R13: reminder candidates require an ACTIVE user and are paged by `(endsAt, id)`, passing skipped rows. Stop after 200 reminders actually queued, exhaustion, or five pages (at most 1,000 candidates per tick). Each grant of a reminder flag and its queued jobs remains one idempotent user-locked transaction.

## Consequences

This extends [[ADR-0073-reaudit-2026-10-30-fixes]], [[ADR-0021-catalog-and-playback-rules]] and [[ADR-0032-audio-expo-audio-instead-of-track-player]]. Accepted documents remain unchanged. The five-page bound intentionally limits each tick; it does not guarantee coverage beyond 1,000 skipped candidates. Native background timer accuracy still requires device validation. Signed URLs last at most four hours, capped by access end; their independent renewal behavior is outside this task. The existing payment reconciliation decision [[ADR-0047-wire-payment-sync-window]] is unchanged.

## Evidence

Regression tests were written before each fix. MySQL reproduced R10 races, R11's missing API field, R12's stale publication and R13's skipped-candidate starvation; a fake-clock test reproduced uninterrupted playback past the deadline. Results and remaining verification are recorded in [[AUDIT-2026-11-02]] and [[2026-11-02]].
