---
type: design
status: draft
date: 2026-10-21
tags: [design, area/admin, area/catalog]
---

# Content management and free content: design

From a brainstorm with Ganaa on 2026-10-21. Nothing here is built yet. Before code: the
[[changes]] entry, ADRs and SPEC update listed under "Process before code".

## Why

Today the admin can only manage categories; each item has just Гарчиг, Тайлбар, Ангилал, cover
and one media file. With 1 to 10 items of 40+ minutes a week, a flat list with one category gets
hard to organise, hard to feature and impossible to judge (no stats). The admin section was renamed
"Контент" (items: "бичлэг") on 2026-10-21 because it manages all audio and video, not "episodes".

Separately, the creator wants **free content as a hook**: anyone who installs the app can play
free items without paying or logging in, and sees the members-only items locked, so they want to join.

## Goals

1. Free items playable by everyone, including people who are not logged in.
2. Members-only items visible to everyone, locked unless the user has active access.
3. Organise content by category, series, playlists and tags; feature items on Нүүр.
4. An admin that makes day-to-day management fast: filters, bulk actions, preview, duplicate, calendar.
5. Know what works: per-item stats, top content, and whether free items turn listeners into members.
6. Control pushes per item; see and fix failed media.

## Non-goals

- Transcripts, show notes/links, chapters/timestamps (Ganaa: not now).
- Any payment, price, plan or "join on the website" text in the mobile app (unchanged).
- Free content in the web portal: the portal stays the payment and account site. (Claude's call.)
- Push notifications to people who never logged in. (Claude's call: their devices are not
  registered; registering anonymous devices is a later add-on.)
- Multiple creators, comments, offline downloads (still out of scope per SPEC).

## Anti-goals (would be a failure even if it works)

- A members-only file is playable without active access through any path (API, signed URL, admin preview link reuse).
- A draft, scheduled or archived item is visible or playable outside the admin.
- The iOS or Android app shows a price, plan, bank or payment step, or tells users to pay on the
  web (outside the US storefront). Verified: [[R-apple-no-payment-ui]] (3.1.1, 3.1.3(a)).
- Admin bulk actions that half-apply or skip the audit log.

## Constraints

- Everything in `CLAUDE.md`: zod on every endpoint, error shape `{error:{code,message}}`,
  access-rule tests, Mongolian text in per-app `mn.ts`, DESIGN tokens only, portable Prisma (no raw
  SQL besides the job claim), slow work through the Job table, access changes in transactions with a
  status precondition.
- One media file per item, audio or video ([[ADR-0038-video-episodes-bunny-stream|ADR-0038]]).
- Store rules: Онгод relies on App Review 3.1.3(a) "Reader" apps, which allow free tiers
  ([[R-apple-no-payment-ui]], VERIFIED 2026-10-21). 5.1.1(v): features that need no account must
  work without login, which free playback satisfies.
- Code keeps the model name `Episode` (no rename churn). Only user-facing admin text says
  Контент / бичлэг; the mobile app keeps "Анги". (Claude's call.)

## Decided with Ganaa

### Free and members-only

- Each item has **Үнэгүй** (free) or **Гишүүдэд** (members only, default).
- Free items play for everyone, logged in or not.
- Members-only items are listed for everyone with cover, title, description and duration. Tapping
  one opens the locked screen "Гишүүдэд зориулсан" (extends the Phase 3 no-access screen) with a
  **Нэвтрэх** button for people who already paid. No price, no join link.
- Free items get an "Үнэгүй" badge in lists.
- A series can mix free and members-only parts (e.g. part 1 free).

### Organising

| Concept | Per item | Ordered | Purpose |
|---|---|---|---|
| Ангилал (category) | exactly one | categories ordered (existing) | where it lives |
| Цуврал (series) | zero or one, with a part number | by part number | "part 3 of 12"; series page; "next part" after finishing |
| Жагсаалт (playlist) | any number | admin drag order | curated lists, e.g. "Шилдэг 10" |
| Шошго (tags) | any number | no | topics; search and filters |
| Онцлох (featured) | via a built-in playlist | admin drag order | top row of Нүүр |

Онцлох is a built-in playlist that cannot be deleted, not a separate feature (Claude's proposal,
accepted).

### Нүүр (Claude's call, accepted)

Top to bottom: Онцлох → Үргэлжлүүлэх (logged-in only) → Энэ 7 хоногт card (existing,
[[ADR-0039-phase-3-before-gate-a|ADR-0039]]) → playlists with "Нүүрэнд харуулах" on, in admin
order → Шинэ (newest published) → categories (existing). Logged-out users get the same without
Үргэлжлүүлэх. Existing rows stay; `HomeResponse` gains fields, nothing is removed. (Claude's call.)

### Admin

- Nav: Хяналтын самбар, Төлбөр, Хэрэглэгчид, **Контент**, **Цуврал**, **Жагсаалт**, Ангилал,
  **Шошго**, **Медиа**, Үйлдлийн түүх.
- Item form: Гарчиг, Тайлбар, Ангилал, Цуврал + хэсгийн дугаар, Шошго (type to add or create),
  Үнэгүй/Гишүүдэд, cover, media, publish/schedule, push switch and optional push text.
- Content list: search; filters for category, series, tag, free/members, status, media status;
  sort by created, published or scheduled date; pagination; list/calendar toggle.
- Bulk actions on selected rows: move category, add to playlist, add tag, remove tag, set
  free/members, publish now, archive. All-or-nothing.
- Preview: play the item's audio/video in the admin, in any status.
- Duplicate: new DRAFT with title (plus " (хуулбар)"), description, category, series (no part
  number), tags, free/members. No cover, no media.
- Calendar: month view of scheduled and published items; click opens the item.
- Series and playlist pages: create, edit (title, description, cover), add existing items, drag
  to reorder, remove. Playlists also have "Нүүрэнд харуулах" and home order.
- Шошго page: rename, delete (removes the tag from items).

### Logged-out app (Claude's call)

- Tabs: Нүүр, Сан and the player work. Хадгалсан and Профайл show a short "Нэвтэрч орно уу" panel
  with a Нэвтрэх button. Тохиргоо keeps device-only settings. No notification inbox.
- Saving an item prompts login. Position in a free item is kept on the device only; the progress
  and save endpoints stay login-only.

### Push

- Per item: "Мэдэгдэл илгээх" (default on) and optional custom text; default text is the title.
- On publish: free item → every logged-in user; members-only → users with active access.
  "Logged-in" = a user with a non-revoked session; logout clears that device's push token. (Claude's call.)
- SPEC G already requires a push on publish but it is not built; it is built in Phase 1, for both
  "publish now" and the scheduled-publish cron. (Claude's call.)
- A bulk publish sends one combined push per audience ("N шинэ бичлэг нэмэгдлээ"), not one per item.
  Switching free/members on a published item sends no push. (Claude's call.)

### Stats

- Per item: plays, unique listeners, completion rate, saves; free items also "became members".
- Dashboard: "Шилдэг контент" for the last 7 and 30 days, free and members-only separately.
- Media health page (Медиа): failed or stuck media with the reason and retry; total storage used.

## The how, as far as decided (rest left to the builder)

**Data model (additions; final shape for the ADR):**

- `Episode`: `isFree Boolean @default(false)`, `seriesId String?`, `seriesPart Int?`,
  `notifyOnPublish Boolean @default(true)`, `pushText String?`.
- `Series(id, title, slug unique, description, coverPath?, createdAt)`; unique `(seriesId, seriesPart)` on Episode.
- `Playlist(id, title, slug unique, description?, coverPath?, showOnHome, homeOrder, isFeatured, createdAt)`;
  exactly one `isFeatured` row, seeded, cannot be deleted.
- `PlaylistItem(playlistId, episodeId, position)`, pk `(playlistId, episodeId)`.
- `Tag(id, name, slug unique)`, `EpisodeTag(episodeId, tagId)`.
- `PlayEvent(id, episodeId, userId?, installId, createdAt)`: one row per play start. `installId`
  is a random id the app creates on first launch (the existing device id is fine if it is created
  before login). It counts anonymous plays and links them to a user who later logs in on that install.

**Access:** the catalog endpoints accept an optional login. Logged-out callers get published items
only and can play only free ones. The play endpoint's signed Bunny URL rule becomes: published AND
(free OR active access). Logged-out play is rate-limited per IP and installId. Admin preview uses a
separate admin endpoint that signs a short-lived URL for any status.

**"Became members":** a user counts for a free item if they played it (logged in, or on an
installId later linked to them) before the start of their first ACTIVE subscription.

**Media health:** "stuck" = UPLOADING or PROCESSING longer than 2 hours (Claude's call). Storage
used = sum of `MediaAsset.sizeBytes` for non-failed assets (Claude's call; no Bunny API call).

**Bulk actions:** at most 100 items per request, one DB transaction, one audit row per item.

**Left to the builder:** endpoint names and payloads, admin page layout within DESIGN tokens,
calendar component, cursor vs offset pagination, how the app stores the installId, index choices,
test structure, and the order of the phases below if dependencies allow.

## Suggested phases

1. **Organise + admin management:** series, playlists (incl. Онцлох), tags, list filters, bulk
   actions, preview, duplicate, calendar, Нүүр rows. Mobile: series page, playlist rows, tag filter.
2. **Free content:** `isFree`, optional-login catalog, logged-out mode in the app, locked screen,
   badges, rate limits, access tests.
3. **Insight + ops:** PlayEvent, per-item stats, top content, conversion, push control, Медиа page.

## Process before code

The plan covers all three phases. Its first tasks are the docs below. Phase 1 does not conflict
with the current rules and may start once its ADR is accepted. **Phase 2 code waits** until Ganaa
has set the price in [[changes]] and edited the "no free episodes" line in CLAUDE.md.

- [[changes]]: entry "Free content + content management" with in-scope no, price set by Ganaa.
- ADRs: free content and logged-out access (changes SPEC "no free episodes"); content organisation
  (series, playlists, tags, featured); play events and stats.
- SPEC: Product, Surfaces, workflow G, data model, out-of-scope list. CLAUDE.md line "No free users,
  no free episodes" needs Ganaa's edit.
- DESIGN: locked state, free badge, admin calendar and bulk bar (tokens only).
