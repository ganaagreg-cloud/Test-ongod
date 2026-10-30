---
topic: Bunny Stream free encoding is a shared queue; measured wait before encoding starts
status: VERIFIED
checked: '2026-10-29'
recheck_after: '2027-01-27'
source: 'https://bunny.net/docs/stream/encoding (page fetched 2026-10-29); own measurements 2026-10-29 (Bunny Stream API, dev library)'
tags: [research, area/media, cost]
---

## Fact

- **VERIFIED (Bunny docs, fetched 2026-10-29):** "Free encoding is a shared service intended for low volume workloads"; it is shared across all users. "Encoding may be briefly delayed during peak periods - this is normal." During high demand it "may take anywhere from several hours to multiple days to complete". No guaranteed timing. Premium Encoding is positioned for "time sensitive video workflows and predictable priority encoding". The page gives no Premium price and no steps to enable it.
- **Measured (dev library, 2026-10-29, standard free encoding, H.264 MP4 18-24 s):** a video sat at status 2 (processing), 0 %, for about 9 to 35 minutes, then encoded in about 16 s (5 % to 100 %). App uploads finished 12 and 14 minutes after upload; hand uploads in Bunny's dashboard were slow too, so the app is not the cause. An earlier test (Test2, 2026-10-24, same kind of file) was reported fast by the owner (no timestamps kept).
- **Long video, measured 2026-10-30 (dev library, free encoding, 720p H.264, 5906 s = 98 min, 167 MB source):** created in Bunny 16:13:55 UTC, processing from 16:15:33, encoding started 16:18:15 (queue wait about 2 min 40 s), finished 16:29:18. About 11 minutes of encoding (roughly 9 times real time) and about 15 minutes from creation to finished; our app marked it READY 10 s later. One sample on a quiet moment: the queue wait varies (9-35 min for the small files earlier the same day), so TO-VERIFY that a busy period does not push it to hours. The progress number is uneven (5 % to 30 % in 50 s, then 30 % to 40 % in 5 min, then 70 % in 2 min), so do not show an ETA from it.
- **The wait does not grow with video length** in these samples: a 98-minute video was ready sooner than several 18-second files.
- **Bug found while measuring (our side, dev):** one upload created two assets and two Bunny videos because React StrictMode ran the "start the picked file" effect twice; guarded in `MediaUploader.tsx`. This doubled the work in the queue for the earlier small-file measurements, so they may overstate the wait. Whether it also happens in a production build is not confirmed.
- **ASSUMPTION (Premium cost):** [[R-bunny-stream]] (TO-VERIFY) says $0.025 to 0.150 per output minute per codec; the owner estimated about $2 per 40-minute upload. Not checked against Bunny's Premium page.
- **ASSUMPTION (other platforms, old third-party blogs and forums, not official):** YouTube HD usually minutes to about 30 minutes; a 60-minute 4K video up to about 4 hours; Vimeo forum reports from 2008-2012 say 35 minutes to a couple of hours. No current official figures found.

## Implication

Do not promise members or creators a processing time. Show the time waited, not an invented ETA ([[ADR-0074-free-bunny-encoding-show-wait]]). The launch row "a new episode is playable within minutes" in [[LAUNCH_CHECKLIST]] stays open until a long video is timed.
