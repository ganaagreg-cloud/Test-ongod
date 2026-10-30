---
id: ADR-0075
title: Player comments are a small card; the list and the writing box open in a tall sheet
status: accepted
date: '2026-10-31'
supersedes: [ADR-0066]
tags: [adr, area/mobile, area/design, area/api]
---

## Context

[[ADR-0066-comments-flat-in-player|ADR-0066]] put the whole list and the writing box open on the Player page. On a phone the last comment ran into "Дараагийн" and the keyboard covered the box (Ganaa, 2026-10-30). The YouTube phone app solves it with one small card and a tall sheet.

## Decision

1. The page shows one card: "Сэтгэгдэл" and the total, then the newest comment on one or two lines (or "Сэтгэгдэл нэмэх..." when there are none). The whole card is one button. Same top hairline as before, so it stays apart from "Дараагийн".
2. Tapping it opens a nearly full-height Modal (`CommentsSheet`): title with the total and a close button, the list (`FlatList`, "Цааш үзэх" paging) and the writing box pinned at the bottom inside a `KeyboardAvoidingView` (iOS padding, Android height) with the bottom safe-area inset. The box is there only when the user may post. The support line shows under the card and at the end of the list.
3. Report, block, edit and delete are unchanged; their menu `Sheet` opens from inside the comments Modal (a nested Modal).
4. API: `GET /v1/episodes/:id/comments` returns `total` on every page: the count of VISIBLE comments, minus authors the viewer blocked (same filter as the list). `commentsPageSchema` in `packages/shared` gets `total`.
5. Colors, tokens, texts and rules from [[ADR-0061-episode-comments|ADR-0061]] and [[ADR-0062-comments-without-contact-gate|ADR-0062]] are unchanged.

## Consequences

- New: `CommentsSheet.tsx`; `CommentsSection.tsx` is now only the card. A second `useComments` observer shares the same cache.
- Old app builds ignore `total`; new builds need the new API (the field is required in the schema).
- Needs a phone check: keyboard behaviour in the Modal and the nested menu Sheet on iOS and Android ([[DEVICE_SMOKE]]).
- Writing a comment is not covered by the mobile e2e: its seed has no free episode and the member has no access.
