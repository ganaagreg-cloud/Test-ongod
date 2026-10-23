---
id: ADR-0045
title: 'Hardening after the 2026-10-24 audit: rate-limit keys, refresh grace, job locks, payment sync'
status: accepted
date: '2026-10-24'
tags: [adr, area/auth, area/backend, area/payments]
---

## Context

An audit of the API on 2026-10-24 (ponytail audit, findings 1 to 4 and 7) found four weaknesses that fit the expected load (a few hundred members, 0.5 to 1.5 GB video uploads, one Node process):

1. The auth rate limit counts attempts per identifier alone ([[ADR-0018-auth-implementation-details|ADR-0018]] item 8), so a stranger can lock any account, including the owner's, or block a member's reset code, with 10 requests per 15 minutes.
2. The job worker marks a whole batch RUNNING with one timestamp, runs it one job after another, and treats a job older than 15 minutes as dead ([[ADR-0010-reliability-jobs-cron-idempotency|ADR-0010]]). A long video upload gets reclaimed and runs twice, queued emails run twice (the cron tick and the loop both claim), and a job that runs out of attempts by lock timeout leaves its MediaAsset in PROCESSING for good, which blocks a new upload.
3. A paid QPay payment whose webhook is lost (the event is recorded before the work is done) is granted only if the member reopens the status page ([[ADR-0041-qpay-via-wire-replaces-bank-transfer|ADR-0041]]).
4. A refresh whose response is lost makes the app retry with the old token; the strict reuse rule ([[ADR-0018-auth-implementation-details|ADR-0018]] item 5) then revokes the whole family and logs the member out.

## Decision

1. **Rate limits.** Login, code and registration endpoints count the identifier bucket per identifier **and** client IP (`identifier|ip`). The IP bucket stays. A separate, higher per-identifier ceiling (`AUTH_RATE_LIMIT_IDENTIFIER_CEILING`, default 100 per window) caps guessing spread over many IPs. The refresh bucket (per `deviceId`) keeps its meaning.
2. **Jobs.** Before a job runs, its `lockedAt` is set to that moment (only if the worker still owns the row). The batch runs in parallel (`Promise.allSettled`). The lock timeout is `JOB_LOCK_TIMEOUT_MS` (default 2 hours). When stale-job recovery fails a job for good, a per-type hook runs: for `media.video-upload` it marks the MediaAsset FAILED with a reason, so the admin can retry.
3. **Payments.** A cron task `syncWaitingPayments` asks Wire about every Wire request created in the last 3 days that is still PENDING_PAYMENT, EXPIRED or CANCELLED with a payment intent, using the existing `sync`, so a lost webhook is recovered within one tick. The webhook keeps its dedupe.
4. **Refresh grace.** A token that was rotated less than `REFRESH_GRACE_SECONDS` (default 10) ago, sent again with the same `deviceId`, is not treated as theft: the newest session of that family (the one that rotation created, still not revoked) is revoked and a new one is issued. Sessions do not record use, so the rule is window-based. Any older reuse, another device, a second grace use of the same token, or a family whose newest session is already revoked still revokes the family.
5. **E2E screenshots** are written outside tracked folders by default.

This supersedes ADR-0018 item 5 (parallel refresh with the same token) and item 8 (rate-limit keys) and the 15-minute lock rule of ADR-0010. The rest of those ADRs stands.

## Alternatives rejected

- Per-identifier lockout with CAPTCHA: too heavy for one Node process and a Mongolian audience.
- Count failed logins only: a stranger can still fail on purpose, and it needs a new table or memory state.
- Raise the lock timeout only (no start-time reset, no parallel batch): fixes the upload but not the double run of queued emails or the wait behind an upload.
- A heartbeat that renews `lockedAt` during a job: more moving parts than a long timeout plus a start-time reset.
- Rely on Wire's webhook retries only: their count and timing are not verified (ASSUMPTION).
- No refresh grace: keeps the strictest rule but logs members out after any lost response.
- A longer refresh grace (minutes): widens the theft window for little gain.

## Consequences

- Tests for each rule (a stranger cannot lock the victim, the ceiling holds, a long job is not reclaimed, a video job that fails by lock timeout frees the episode, the cron sync grants a missed payment once, the refresh grace works once and only inside the window).
- New env values go into `.env.example` and [[SECRETS]] / [[DEPLOY]].
- A thief who steals a refresh token and uses it within the grace window of the real owner's rotation gets one extra session; the second use still revokes the family. Accepted (window 10 s).
- A crashed process now frees its running jobs after up to 2 hours instead of 15 minutes (except video upload failures, which fail visibly). Emails queued behind a crash wait that long.

## Evidence

- Audit report in the 2026-10-24 session; the code paths are `apps/api/src/auth/rate-limit.ts`, `apps/api/src/jobs/worker.ts`, `apps/api/src/payments/service.ts`, `apps/api/src/auth/service.ts`.
- [[R-wire-qpay-gateway]]: Wire webhook retry behavior is TO-VERIFY.
