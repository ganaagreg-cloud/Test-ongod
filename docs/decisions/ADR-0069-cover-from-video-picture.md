---
id: ADR-0069
title: A video without a cover gets Bunny Stream's picture from the video as its cover
status: accepted
date: '2026-10-29'
tags: [adr, area/api, area/admin, area/media]
---

## Context

Every episode needs a cover before it can be published ([[ADR-0052-episode-one-page-editor|ADR-0052]] checklist). For a video that means making a picture by hand, while Bunny Stream already takes one from each video. YouTube and Vimeo offer a frame of the video as the thumbnail; Ganaa chose this as the next admin step after [[ADR-0068-admin-upload-flow-like-creator-platforms|ADR-0068]].

## Decision

1. When a video becomes READY and its episode has no cover, a job (`media.video-cover`) fetches Bunny's picture `https://<stream CDN host>/<video id>/thumbnail.jpg` with a 5-minute signed URL (same token key as the playlist, [[ADR-0004-media-bunny-token-auth|ADR-0004]]), turns it into the two 16:9 WebP sizes like an uploaded cover ([[ADR-0035-episode-pictures-16x9-files|ADR-0035]]) and stores it.
2. The admin's own cover always wins: the job sets the cover only while the episode still has none, and deletes its files if one was set meanwhile. An episode that already has a cover gets no job.
3. Best effort: no picture, an unreadable picture or a fetch error never changes the video's state; the cover just stays empty and the checklist asks for one as before.
4. Admin: a hint under an empty cover on a video item says the picture will come from the video; the page looks again every 5 s for two minutes after the video is ready.

## Alternatives rejected

- Let the admin pick one of several frames (YouTube): needs Bunny's frame-at-time API and a picker; the single picture covers the usual case and the admin can still upload their own.
- Make the cover optional for video: the apps' lists and the Player need a picture.

## Consequences

- The thumbnail URL form is TO-VERIFY ([[R-bunny-stream]]): check on the first live upload ([[LAUNCH_CHECKLIST]]). If it differs, only `getThumbnail` in `lib/bunnyStream.ts` changes.
- API tests cover: the picture becomes the cover, an existing cover is kept, no picture leaves it empty.
