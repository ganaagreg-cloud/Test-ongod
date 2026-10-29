---
id: ADR-0068
title: Admin episode page: upload starts from the file, leaving asks, a small "Файл солих", one save
status: accepted
date: '2026-10-29'
supersedes: [ADR-0052 (only when the draft is made, the notify setting's own save, and the drop zone after a file is in)]
tags: [adr, area/admin, area/design]
---

## Context

Ganaa asked whether the admin upload flow is production-ready and easy to understand, compared with creator platforms (YouTube Studio, Vimeo, Uscreen, Patreon, Spotify for Creators; general product knowledge, not a dated research note). A walk through the real admin found: the upload waited for a typed title and "Үүсгэх"; leaving during an upload or with unsaved edits gave no warning; after an upload the big empty drop zone stayed on screen; the push setting had its own save button next to "Хадгалах", and the publish confirmation always said a push would go out, even when it was switched off.

## Decision

1. Picking a file on a new page fills an empty title from the file name (no extension, "_" as spaces) and the category with the one last used on this browser (or the only one). When both are there, the draft is made at once and the upload starts, without "Үүсгэх". Otherwise the file waits, as in [[ADR-0052-episode-one-page-editor|ADR-0052]], and the draft is made by itself as soon as a category is picked or the title field is left. The remembered category is a browser convenience (localStorage), never needed.
2. While a file is going up, or the page has unsaved edits, a link inside the admin asks first ("Файл оруулж байна" / "Хадгалаагүй өөрчлөлт байна", Болих / Гарах), and closing or reloading the tab gets the browser's own question. The admin now uses a data router (`createBrowserRouter`, one catch-all route) so the page can use `useBlocker`. Leaving still pauses the upload; coming back and picking the same file continues it.
3. Once an episode has a file that has not failed, the big drop zone becomes a small "Файл солих" target (same file input, same replace confirmation).
4. The push setting ("Нийтлэхэд гишүүдэд мэдэгдэл илгээх" and its text) is part of the page and saved with "Хадгалах". "Одоо нийтлэх" and "Товлох" save pending edits first. The publish confirmation names the push text, or says no push will be sent.
5. A form the admin has not touched takes fresh server data (a refetch, a bulk change made from the list); edits in progress are kept.

## Alternatives rejected

- Let the upload keep running while the admin moves to other pages (YouTube): needs the uploader moved out of the page into an app-wide upload manager with its own indicator. Possible later; asking before leaving covers the risk now.
- Make the category optional for drafts: an API and schema change for a small gain; the remembered category covers the usual case.

## Consequences

- Admin-only change, no API or schema change. Unit tests for the title and starting category; admin e2e covers the auto-start, the leave question and the small "Файл солих".
- Still to do, by priority: the cover from the video's own frame, several files at once (see the 2026-10-29 log).
- [[DESIGN]] "Episode editor" is updated.
