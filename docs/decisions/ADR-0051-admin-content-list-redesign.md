---
id: ADR-0051
title: Content list redesign (status tabs, URL filters, row tools, fixed bulk bar) and the API it needs
status: accepted
date: 2026-10-26
tags: [adr, area/design, area/admin, area/api]
---

## Context

The Контент list ([[DESIGN#Admin screens]]) read as unfinished: a status dropdown, eight filters in a row, a bulk bar that pushed the table down, broken-image icons, no way to see a stuck upload. Builds on [[ADR-0050-admin-dense-forest-sidebar|ADR-0050]] and [[ADR-0042-content-organisation-and-publish-push|ADR-0042]].

## Decision

UI (admin only, tokens only):

- Status tabs (Бүгд, Ноорог, Товлосон, Нийтэлсэн, Архивласан) with counts replace the Төлөв dropdown. Always visible: search and Ангилал; Цуврал, Шошго, Жагсаалт, Файлын төлөв and Эрэмбэ sit in a collapsible "Шүүлтүүр" panel; active filters are removable chips plus "Бүгдийг арилгах". Tab, filters, sort and page live in the URL.
- First column = 48 px thumbnail + title + "Ангилал · Цуврал". A missing or failed picture shows the brand-green tile with an audio or video icon. Media column = icon, mm:ss, status badge. Dates: within 7 days "маргааш 08:56", else the date; the full date is the tooltip. All dates go through `lib/format.ts` (YYYY.MM.DD HH:mm).
- One badge look for the whole admin: colored dot, bigger text, a visible gray border for Ноорог.
- Row tools on hover or focus: Засах, Урьдчилж харах, ⋯ (Хувилах, Архивлах; archive asks for confirmation and only works on Нийтэлсэн items, as the API does).
- Bulk bar: fixed at the bottom of the viewport (next to the sidebar), slides up when one row is selected; nothing above the table moves.
- Toasts in the admin sit at the bottom right (`ToastProvider placement="end"`; the portal keeps bottom centre) and can carry a button. Archive (one or many) offers "Буцаах".
- Sidebar user card (initials, name, role) opens a menu with Гарах only. There is no profile page, so there is no Профайл entry.
- Keyboard: "/" focuses the search, "n" starts a new item.

API:

- `MediaAsset.updatedAt` (migration `20261026090000_media_updated_at`). An UPLOADING file untouched for more than 15 minutes is shown as "Алдаатай" with "Дахин оруулах" (opens the edit page, whose uploader resumes or takes a new file). shortcut: the row is written only when an upload starts and when it ends, so a very slow upload longer than 15 minutes is also shown as stuck; upgrade when upload progress is recorded.
- `GET /admin/episodes` also returns `counts` per status, under every filter except the status.
- `POST /admin/episodes/:id/unarchive` (ARCHIVED to PUBLISHED, status precondition, keeps `publishedAt`, sends no push) is the undo of archive. `restore` stays ARCHIVED to DRAFT.

Tests: e2e `cleanUp` now also removes the series, lists, tags and categories the tests made ("E2E" in the name); `pnpm --filter @ongod/api clean:e2e` is a one-time dry-run-by-default script for old leftovers.

## Alternatives rejected

- **Tailwind (asked for in the request, "CSS variables / Tailwind theme"):** nothing here needs it; [[ADR-0025-ui-component-set|ADR-0025]] and [[ADR-0029-admin-app-implementation|ADR-0029]] stay as they are.
- **A 6 px radius and a new spacing scale:** the tokens already have 8 and 12; no new token values.
- **Undo through `restore` plus `publish`:** publish would send the push notification again and change the date.
- **A sticky bulk bar inside the page flow:** it sits in the flow below the table when the page is short; the request asked for a bar fixed to the viewport.

## Consequences

- The migration must run on every database (`pnpm --filter @ongod/api db:deploy`); the API fails on episode queries without the column.
- Tab counts and the "N бичлэг · N товлосон · N ноорог" line follow the search and the other filters, not the whole library.
- Not run in this session: the admin e2e (it needs the API serving the admin build); the new UI was checked in a browser against the dev stack.
