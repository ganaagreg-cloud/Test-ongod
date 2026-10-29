---
id: ADR-0070
title: Admin "Олон файл": several audio or video files at once, one draft each
status: accepted
date: '2026-10-29'
tags: [adr, area/admin]
---

## Context

Adding a season meant repeating the one-page editor per episode ([[ADR-0068-admin-upload-flow-like-creator-platforms|ADR-0068]]). Creator platforms (YouTube Studio, Vimeo, Uscreen, Kajabi; general product knowledge) take several files at once and make a draft for each. Ganaa chose this as the last admin step of 2026-10-29.

## Decision

1. A page `/admin/episodes/upload` ("Олон файл" next to "Шинэ бичлэг" on Контент, and a link under the empty drop zone of a new item). One category for all files (the remembered one, or the only one), then pick or drop several files.
2. Each file is checked before anything is sent (type and size, the same rules as the API); a wrong file is listed with the reason and never sent.
3. "N файл оруулах" sends them one after another: a draft (title from the file name, [[ADR-0068-admin-upload-flow-like-creator-platforms|ADR-0068]]) and then its tus upload, with progress per row. A failure stays on its row with the reason and a link to the draft; pressing the button again retries only those.
4. Cover, description and publishing stay on each draft's page; a video gets its cover from the video ([[ADR-0069-cover-from-video-picture|ADR-0069]]). Leaving while files are going up asks first.
5. The tus settings (chunks, token refresh, retries) are shared with the single uploader (`upload/tusUpload.ts`). No API change.

## Alternatives rejected

- Several uploads at the same time: the shared host's upload bandwidth and disk ([[open-questions]] #23) favour one at a time; it also keeps the order of episodes.
- Several files on the one-page editor: that page is about one episode; a separate page keeps both simple.

## Consequences

- An interrupted batch is not resumed as a batch: finished drafts stay, a draft whose upload stopped shows "Дахин оруулах" in the list as before.
- Admin e2e covers two files and one wrong file.
