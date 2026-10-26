---
id: ADR-0052
title: Episode editor is one page: cover and file first, a sticky publish panel, a drop zone and a schedule picker
status: accepted
date: 2026-10-26
tags: [adr, area/design, area/admin]
---

## Context

Making an episode took two screens: a form (title, category) that created the record, then an edit page with more fields, the cover on the right, a plain browser file field and a plain date-time box. It looked unfinished and the split felt arbitrary to the owner. Builds on [[ADR-0050-admin-dense-forest-sidebar|ADR-0050]] and [[ADR-0051-admin-content-list-redesign|ADR-0051]]. No API change.

## Decision

- `/episodes/new` and `/episodes/:id` are one route and one page. The cover (16:9, brand green when empty) and the audio or video drop zone come first, then the details; the right column is a sticky Нийтлэх panel (status, checklist of title/cover/file, notify setting, Одоо or Товлох, the button).
- The API still needs an episode id before a file can be attached (the tus upload and the cover upload are per episode, ADR-0029). So a file picked on the new page is kept in the browser (cover with a preview), and the draft is created, quietly, as soon as there is a title and a category: right away if they are already filled in, otherwise on Үүсгэх. The URL then moves to the new id without remounting the page, so the kept files keep going. The server-filled series part is copied into the form.
- An unsaved page leaves no draft behind: nothing is created until there is a title and a category. A draft that exists can be deleted from its page (drafts only), as before.
- `DropZone`: the real file input covers the whole area, so the browser does the picking and the dropping. Used for the cover and the media file; the input keeps the old label, so it stays a normal file field for the keyboard and screen readers.
- `SchedulePicker`: day chips (today, tomorrow, the next days by name), a grid of usual times (a time already past today is disabled) and plain date and time fields under "Өөр өдөр, цаг". It produces the same `YYYY-MM-DDTHH:mm` Ulaanbaatar value as before, so the schedule conversion is unchanged ([[ADR-0029-admin-app-implementation|ADR-0029]] point 8).
- The old "what is missing before publishing" notice is the checklist now.

## Alternatives rejected

- **Create the draft the moment a file is picked, with a placeholder title:** it would leave untitled drafts behind.
- **Two routes with a redirect:** a new mount would drop the files picked before the draft existed.
- **A custom calendar popover:** more code for little gain; chips cover the usual cases and the native fields cover the rest.

## Consequences

- e2e: the "missing" text check became the checklist; a new test covers files picked before the draft exists; toasts for two quick creations are matched with `.first()`.
- The Notify settings still save separately (the button appears when something changed) because publishing reads the saved values.
- Not done: replacing the native date and time fields in "Өөр өдөр, цаг", and the checkbox look.
