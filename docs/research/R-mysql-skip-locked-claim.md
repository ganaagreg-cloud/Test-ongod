---
topic: MySQL job claim with SKIP LOCKED must stay on an ordered index range
status: VERIFIED
checked: 2026-10-08
recheck_after:
source: 'computed locally: apps/api/test/jobs.worker.test.ts against MySQL 8.4 (docker)'
tags: [research, area/backend]
---

## Fact

1. A claim query with `WHERE (status='QUEUED' AND runAt<=?) OR (status='RUNNING' AND lockedAt<?) ORDER BY runAt LIMIT n FOR UPDATE SKIP LOCKED` cannot use the `(status, runAt)` index. MySQL filesorts and locks every due row, so concurrent claimers get nothing (21 of 60 jobs claimed by 12 workers). With only `status='QUEUED' AND runAt<=?` it reads in index order and locks just the returned rows.
2. Stale-lock recovery as a plain `updateMany` under REPEATABLE READ deadlocked with concurrent claims (gap locks). Running it in a READ COMMITTED transaction, throttled and best-effort, fixed it (8 of 8 test runs green).

## How it was checked

Concurrency tests in `jobs.worker.test.ts` (no double claim, exactly-once with 4 workers), before and after the fix.

## Used by

- [[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]
