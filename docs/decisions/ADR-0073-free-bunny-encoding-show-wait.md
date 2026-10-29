---
id: ADR-0073
title: 'Video stays on Bunny free encoding; the admin shows the time waited'
status: accepted
date: '2026-10-29'
tags: [adr, area/media, area/admin, cost]
---

## Context

[[ADR-0038-video-episodes-bunny-stream|ADR-0038]] puts video on Bunny Stream. On 2026-10-29 uploads sat at 0 % for 9 to 35 minutes before Bunny started encoding, then encoded in about 16 s (18 s videos). Hand uploads in Bunny's own dashboard were just as slow, so our app is not the cause. Bunny's docs say free encoding is a shared service that can be delayed from minutes to hours or days ([[R-bunny-free-encoding-queue]], VERIFIED). Premium Encoding gives priority, but the owner does not want to pay for encoding (about $2 per 40-minute upload by the owner's estimate, unverified). The admin notice said "a 40-minute video takes a few minutes", which was wrong.

## Decision

1. **Video encoding stays on Bunny Stream's free standard encoding.** Premium Encoding is not used.
2. **Operating rule:** creators upload ahead of time and use scheduled publish. A member only ever sees an episode whose media is READY, so unfinished video never reaches the apps.
3. **The admin processing notice shows the time waited** (from the media row's `updatedAt`, re-rendered by the existing 10 s refetch) and says honestly that the wait can be minutes to hours. It gives no ETA, because none is honest. No API or database change.
4. This adds an operating rule to ADR-0038 and does not replace it.

## Alternatives rejected

- **Bunny Premium Encoding:** priority queue and predictable timing, but costs money; the owner declined. Its price is TO-VERIFY ([[R-bunny-stream]]).
- **Play the original MP4 from Bunny Storage first, swap to HLS when ready:** no wait for members, but ADR-0038 rejected a plain MP4 for lacking adaptive bitrate. Kept as the **fallback** if the wait becomes unacceptable; it needs its own ADR.
- **An estimated time in the admin:** the queue wait is unpredictable; an invented number would mislead.
- **Another video host:** no evidence it is faster, needs research, cost and a new ADR.
- **Encoding on our own server (ffmpeg):** the shared one-process host is unlikely to allow it (ASSUMPTION, [[R-hosting-limits]] not re-read).

## Consequences

- The row "a new episode is playable within minutes" in [[LAUNCH_CHECKLIST]] stays open until a 5 to 10 minute and a 40-minute video are timed.
- A scheduled episode whose video is not READY at its time waits until it is (the publish rule already requires READY media).
- Open work: the long-video timing test; asking Bunny support why the queue wait is long; optionally storing Bunny's `encodeProgress` (needs a column and a job change) to show a percentage once encoding starts.

## Evidence

- [[R-bunny-free-encoding-queue]] (VERIFIED docs plus own measurements)
- [[R-bunny-stream]] (TO-VERIFY: Premium price)
