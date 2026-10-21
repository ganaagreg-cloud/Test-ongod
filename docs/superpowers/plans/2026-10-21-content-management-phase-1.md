# Content management, phase 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Series, playlists (incl. Онцлох), tags, a faster admin "Контент" area (filters, bulk actions, preview, duplicate, calendar), Нүүр rows from playlists, and the push on publish that SPEC G already requires.

**Architecture:** New Prisma models (Series, Playlist, PlaylistItem, Tag, EpisodeTag) plus Episode fields. Admin endpoints live in new focused service files next to `apps/api/src/admin/content.ts`; catalog reads extend `apps/api/src/catalog/service.ts`. Admin pages and mobile screens consume the shared zod schemas in `packages/shared`.

**Tech Stack:** Node 20, TypeScript, Fastify 5, Prisma 7 (MySQL 8), zod 4, Vitest; React 19 + Vite + TanStack Query/Table (admin); Expo + expo-router (mobile).

**Spec:** `docs/superpowers/specs/2026-10-21-content-management-design.md`. Phase 2 (free content) and phase 3 (stats, Медиа page) get their own plans.

## Global Constraints

- Every endpoint: zod-validated input and output, errors as `{error:{code,message}}` via `AppError`, tests for access rules (no token → 401, USER → 403, ADMIN/OWNER → ok).
- Every admin write: one `db.$transaction`, one `audit(tx, actor.id, action, targetType, targetId, data)` row per changed item.
- Portable Prisma only: no raw SQL, no engine-specific types.
- Slow work (push) only through `enqueuePush` in the same transaction as the state change.
- User-facing text only in `apps/admin/src/i18n/mn.ts`, `apps/mobile/src/i18n/mn.ts`, `apps/api/src/i18n/mn.ts`. Admin says "Контент" / "бичлэг"; mobile keeps "Анги".
- UI uses DESIGN tokens only (`packages/tokens`); `apps/mobile/test/ui-tokens-only.test.ts` and `apps/admin/test/admin-css.test.ts` must stay green.
- The mobile app shows no price, plan or payment text (`apps/mobile/test/no-payment-text.test.ts`).
- Catalog shows only `publishedWhere(now)` items, everywhere: series pages, playlists, home rows, counts.
- Code keeps the model name `Episode`.
- Slugs use the existing `slugSchema`. Names: `categoryNameSchema` rules (1–100 chars, trimmed).
- Bulk: max 100 ids per request.
- The built-in featured playlist has the fixed id `featured`, `isFeatured: true`, title "Онцлох", and cannot be deleted.

## Review Focus

1. **Unpublished items inside series/playlists:** a DRAFT, SCHEDULED or ARCHIVED item in a series or playlist must not appear (or be counted) in any catalog response. Test in Task 7.
2. **Deleting a series, playlist or tag that has items:** items survive; series delete sets `seriesId`/`seriesPart` to null. Test in Tasks 2 and 3.
3. **Bulk with one bad id or one item in the wrong state:** whole request rejected, nothing changed, no audit rows. Test in Task 5.
4. **Moving an item into a series without a part number, or onto a taken part:** no part given → next free part; taken part → 409 `SERIES_PART_TAKEN`. Test in Task 3.
5. **Scheduled video items and repeated cron ticks:** a scheduled VIDEO item publishes, and the publish push is queued once even if two ticks run. Test in Task 6.

---

### Task 1: Decisions and docs before code

**Files:**
- Create: `docs/decisions/ADR-0042-content-organisation-and-publish-push.md`
- Modify: `docs/SPEC.md` (Surfaces admin line, workflow G, Data model)
- Modify: `docs/client/changes.md` (new entry)
- Modify: `docs/00-Index.md` if it lists ADRs

- [ ] **Step 1:** Write ADR-0042 (status `proposed`) from the design's "Decided with Ganaa" and "The how" sections: Series (0..1 per item, part number), Playlist + PlaylistItem (many, ordered, `showOnHome`, `homeOrder`, built-in `featured`), Tag + EpisodeTag, Нүүр order (Онцлох → Үргэлжлүүлэх → Энэ 7 хоногт → home playlists → Шинэ → categories; `HomeResponse` only gains fields), push on publish (now, cron, bulk combined), the cron VIDEO fix. Link [[ADR-0039-phase-3-before-gate-a|ADR-0039]] and [[ADR-0038-video-episodes-bunny-stream|ADR-0038]].
- [ ] **Step 2:** Add to SPEC Data model: the five models and the Episode fields `seriesId?`, `seriesPart?`, `notifyOnPublish`, `pushText?`. Update workflow G and the admin Surfaces line (Контент, Цуврал, Жагсаалт, Шошго). Do **not** touch the free-content lines (phase 2).
- [ ] **Step 3:** Add a `changes.md` entry dated 2026-10-21 "Content management (series, playlists, tags, admin tools) and free content": In scope: no. Price: **set by Ganaa** (blank). Status: proposed. Notes: link the design doc; free content blocked on the CLAUDE.md edit.
- [ ] **Step 4:** Stop. Ganaa marks ADR-0042 accepted before Task 2 starts.
- [ ] **Step 5: Commit** `docs: ADR-0042 content organisation, SPEC and change request`

### Task 2: Schema, migration, tags API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261021090000_content_organisation/migration.sql` (via `pnpm --filter @ongod/api exec prisma migrate dev --name content_organisation`, then rename the folder timestamp if needed)
- Create: `apps/api/src/admin/tags.ts`
- Modify: `apps/api/src/routes/admin-content.ts`, `apps/api/src/app.ts` (wire services)
- Modify: `packages/shared/src/admin-content.ts`
- Test: `apps/api/test/admin-tags.test.ts`; extend `apps/api/test/catalog-helpers.ts` with `makeSeries`, `makePlaylist`, `makeTag`

**Interfaces:**
- Produces (schema):
  - `Episode`: `seriesId String?`, `seriesPart Int?`, `notifyOnPublish Boolean @default(true)`, `pushText String? @db.Text`; `@@unique([seriesId, seriesPart])`, `@@index([seriesId])`; relations `series Series? (onDelete: SetNull)`, `tags EpisodeTag[]`, `playlistItems PlaylistItem[]`.
  - `Series { id cuid, title String, slug String @unique, description String @db.Text @default(""), coverPath String?, createdAt }`.
  - `Playlist { id cuid, title, slug @unique, description @db.Text @default(""), coverPath String?, showOnHome Boolean @default(false), homeOrder Int @default(0), isFeatured Boolean @default(false), createdAt }`.
  - `PlaylistItem { playlistId, episodeId, position Int; @@id([playlistId, episodeId]); @@index([episodeId]); both relations onDelete: Cascade }`.
  - `Tag { id cuid, name String, slug String @unique }`; `EpisodeTag { episodeId, tagId; @@id([episodeId, tagId]); @@index([tagId]); both onDelete: Cascade }`.
- Produces (shared): `adminTagSchema = {id, name, slug, episodeCount}`, `AdminTagDto`, `createTagRequestSchema {name}` (slug derived server-side), `updateTagRequestSchema {name}`, `adminTagsResponseSchema {tags}`, `adminTagResponseSchema {tag}`.
- Produces (API): `createTagService({db}) → { list(), create(actor,{name}), rename(actor,id,{name}), remove(actor,id), slugOf(name): string }`. Routes: `GET/POST /v1/admin/tags`, `PATCH/DELETE /v1/admin/tags/:id`.

- [ ] **Step 1: Write failing tests** in `admin-tags.test.ts`:
  - `tags need an admin`: no token → 401, member → 403 on all four routes.
  - `create returns the tag with a slug`: POST `{name:'Сэтгэл зүй'}` → 201, `tag.name === 'Сэтгэл зүй'`, `tag.slug` matches `slugSchema`, `episodeCount === 0`.
  - `same name twice → 409 TAG_TAKEN`.
  - `delete keeps the episodes`: tag on one episode, DELETE → 204; episode still exists; `EpisodeTag` count 0; one `AuditLog` row `tag.delete`.
- [ ] **Step 2:** Run `pnpm --filter @ongod/api test -- admin-tags` → FAIL (route 404).
- [ ] **Step 3:** Schema + migration. Implement `tags.ts`; `slugOf` transliterates Mongolian Cyrillic to Latin (а→a, б→b, в→v, г→g, д→d, е→ye, ё→yo, ж→j, з→z, и→i, й→i, к→k, л→l, м→m, н→n, о→o, ө→u, п→p, р→r, с→s, т→t, у→u, ү→u, ф→f, х→kh, ц→ts, ч→ch, ш→sh, щ→sh, ъ→'', ы→y, ь→'', э→e, ю→yu, я→ya), lowercases, joins with `-`, and on a clash with another name appends `-2`, `-3`. Same name (case-insensitive) → 409 `TAG_TAKEN`. Add error codes to `apps/api/src/i18n/mn.ts`.
- [ ] **Step 4:** Run the test file → PASS; `pnpm --filter @ongod/api typecheck` → no errors.
- [ ] **Step 5: Commit** `feat(api): series/playlist/tag schema and admin tags`

### Task 3: Series API and item fields

**Files:**
- Create: `apps/api/src/admin/series.ts`
- Modify: `apps/api/src/admin/content.ts` (create/update/DTO), `apps/api/src/routes/admin-content.ts`, `packages/shared/src/admin-content.ts`
- Test: `apps/api/test/admin-series.test.ts`

**Interfaces:**
- Produces (shared): `adminSeriesSchema = {id, title, slug, description, coverUrl: string|null, episodeCount}`; `adminSeriesDetailSchema = adminSeriesSchema & {episodes: Array<{id,title,status,seriesPart}>}` (ordered by part); `createSeriesRequestSchema {title, slug, description?}`; `updateSeriesRequestSchema` (partial, non-empty); `reorderSeriesRequestSchema {episodeIds: id[] (1..500)}`.
- Extends `adminEpisodeSchema` with `series: {id,title}|null`, `seriesPart: number|null`, `tags: Array<{id,name}>`, `notifyOnPublish: boolean`, `pushText: string|null`.
- Extends `createEpisodeRequestSchema` with optional `seriesId: id|null`, `seriesPart: int 1..9999 | null`, `tagIds: id[] (max 20)`, `notifyOnPublish: boolean`, `pushText: string trim max 180 | null`. `updateEpisodeRequestSchema` stays `.partial()` of it.
- Produces (API): `createSeriesService({db, media}) → { list(), get(id), create(actor,input), update(actor,id,input), remove(actor,id), reorder(actor,id,episodeIds), setCover(actor,id,image) }`. Routes: `GET/POST /v1/admin/series`, `GET/PATCH/DELETE /v1/admin/series/:id`, `POST /v1/admin/series/:id/reorder`, `POST /v1/admin/series/:id/cover` (same multipart rules as episode cover; reuse `readCover`).

- [ ] **Step 1: Write failing tests:**
  - access rules (401/403) on every series route.
  - `create item in a series without a part gets the next part`: series with parts 1, 2 → new item `{seriesId}` → `seriesPart === 3`.
  - `taken part → 409 SERIES_PART_TAKEN`; nothing written.
  - `reorder renumbers 1..n`: `episodeIds` [c, a, b] → parts c=1, a=2, b=3; ids not exactly the series' items → 400 `VALIDATION_ERROR`.
  - `delete series keeps items`: items' `seriesId` and `seriesPart` become null; audit `series.delete`.
  - `update sets tags`: PATCH `{tagIds:[t1,t2]}` → `episode.tags` has both; PATCH `{tagIds:[]}` clears; unknown tag id → 404.
  - `episode DTO includes series, tags, notifyOnPublish true by default`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Reorder: inside the transaction first set every part to `null`, then write 1..n (avoids the unique clash). Moving to a series with no part: `max(seriesPart)+1` read inside the transaction. Map Prisma unique violation on `(seriesId, seriesPart)` to 409 `SERIES_PART_TAKEN` via `isUniqueViolation`. Tag replace = `deleteMany` + `createMany` in the same transaction.
- [ ] **Step 4:** Run tests + typecheck → PASS.
- [ ] **Step 5: Commit** `feat(api): series and item series/tags fields`

### Task 4: Playlists API (incl. Онцлох)

**Files:**
- Create: `apps/api/src/admin/playlists.ts`
- Modify: `apps/api/src/routes/admin-content.ts`, `packages/shared/src/admin-content.ts`
- Test: `apps/api/test/admin-playlists.test.ts`

**Interfaces:**
- Produces (shared): `adminPlaylistSchema = {id, title, slug, description, coverUrl|null, showOnHome, homeOrder, isFeatured, episodeCount}`; `adminPlaylistDetailSchema = adminPlaylistSchema & {episodes: Array<{id,title,status,position}>}`; `createPlaylistRequestSchema {title, slug, description?, showOnHome?}`; `updatePlaylistRequestSchema` partial non-empty; `playlistItemsRequestSchema {episodeIds: id[] 1..100}`; `reorderPlaylistRequestSchema {episodeIds}`; `reorderHomeRequestSchema {playlistIds}`.
- Produces (API): `createPlaylistService({db, media}) → { ensureFeatured(), list(), get(id), create, update, remove, addItems(actor,id,episodeIds), removeItem(actor,id,episodeId), reorder(actor,id,episodeIds), reorderHome(actor,playlistIds), setCover }`. `FEATURED_PLAYLIST_ID = 'featured'` exported. Routes: `GET/POST /v1/admin/playlists`, `GET/PATCH/DELETE /v1/admin/playlists/:id`, `POST /v1/admin/playlists/:id/items`, `DELETE /v1/admin/playlists/:id/items/:episodeId`, `POST /v1/admin/playlists/:id/reorder`, `POST /v1/admin/playlists/home-order`, `POST /v1/admin/playlists/:id/cover`.

- [ ] **Step 1: Write failing tests:**
  - access rules on every route.
  - `list always includes Онцлох first`: fresh DB → `GET` returns one playlist `{id:'featured', isFeatured:true, title:'Онцлох'}`.
  - `featured cannot be deleted → 409 PLAYLIST_FEATURED`.
  - `addItems appends in the given order, skips ones already in`: add [a,b], then [b,c] → positions a=1, b=2, c=3.
  - `reorder needs exactly the playlist's items` (else 400).
  - `home-order sets homeOrder 1..n for the given ids`; featured id in the list → 400 (featured is always first, not ordered).
  - `delete playlist keeps items`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. `ensureFeatured()` = `upsert` on id `featured` (create title "Онцлох", slug `featured`, `isFeatured: true`); call it at the start of `list()` and `get('featured')`, so prod needs no seed. Featured title is not editable (PATCH title on featured → 409 `PLAYLIST_FEATURED`).
- [ ] **Step 4:** Run tests + typecheck → PASS.
- [ ] **Step 5: Commit** `feat(api): playlists and the Онцлох playlist`

### Task 5: Admin list filters, calendar, duplicate, preview, bulk

**Files:**
- Modify: `apps/api/src/admin/content.ts`, `apps/api/src/routes/admin-content.ts`, `packages/shared/src/admin-content.ts`
- Create: `apps/api/src/admin/bulk.ts`
- Test: `apps/api/test/admin-content-tools.test.ts`

**Interfaces:**
- Extends `listAdminEpisodesQuerySchema`: `seriesId?`, `tagId?`, `playlistId?`, `mediaStatus?: mediaStatusSchema | 'NONE'`, `sort?: 'created'|'published'|'scheduled'` (default `created`, always desc), `from?`/`to?` ISO datetimes (filter on `scheduledFor` OR `publishedAt` in range, for the calendar).
- Produces: `POST /v1/admin/episodes/:id/duplicate → 201 {episode}`; `POST /v1/admin/episodes/:id/preview → {url, expiresAt, kind}` (admin-only signed URL, any status, `cache-control: no-store`); `POST /v1/admin/episodes/bulk`.
- `bulkRequestSchema = { ids: id[] 1..100, action: discriminatedUnion('type', [ {type:'setCategory', categoryId}, {type:'addToPlaylist', playlistId}, {type:'addTag', tagId}, {type:'removeTag', tagId}, {type:'publish'}, {type:'archive'} ]) }` → `{ updated: number }`.
- `createBulkService({db, content, playlists, now}) → { run(actor, ids, action) }`.

- [ ] **Step 1: Write failing tests:**
  - access rules on duplicate, preview, bulk.
  - filters: `seriesId`, `tagId`, `playlistId`, `mediaStatus=FAILED`, `mediaStatus=NONE` each return only matching items; `from/to` returns items scheduled or published in range.
  - `duplicate copies text, category, series (no part), tags, notify fields; status DRAFT; no cover, no media; title ends " (хуулбар)"`.
  - `preview works for a DRAFT with READY media and returns a signed URL; 409 MEDIA_NOT_READY without READY media`.
  - `bulk setCategory updates all and writes one audit row per item`.
  - `bulk with one unknown id → 404, nothing changed, no audit rows`.
  - `bulk publish with one item missing a cover → 409 NOT_READY_TO_PUBLISH with details.ids, nothing published`.
  - `bulk archive with one DRAFT → 409 EPISODE_STATE, nothing archived`.
  - more than 100 ids → 400.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Bulk validates everything first, then writes all in one transaction with status preconditions (`updateMany where {id, status in …}`; count mismatch → throw → rollback). Preview reuses the signers in `catalog/media.ts` (`MediaUrls`) with `PLAY_URL_TTL_MS`. Bulk publish push is added in Task 6.
- [ ] **Step 4:** Run tests + typecheck → PASS.
- [ ] **Step 5: Commit** `feat(api): admin filters, calendar range, duplicate, preview, bulk`

### Task 6: Push on publish and the scheduled-video fix

**Files:**
- Create: `apps/api/src/push/publish.ts`
- Modify: `apps/api/src/admin/content.ts` (`publish`), `apps/api/src/admin/bulk.ts`, `apps/api/src/cron/tasks.ts` (`publishScheduledEpisodes`), `apps/api/src/auth/service.ts` (`logout`), `apps/api/src/i18n/mn.ts`
- Test: `apps/api/test/publish-push.test.ts`; extend `apps/api/test/cron.test.ts`

**Interfaces:**
- Produces: `enqueuePublishPush(tx: JobWriter, episodes: Array<{id, title, pushText: string|null, notifyOnPublish: boolean}>, now: Date): Promise<number>` (returns users queued). Audience: users with `accessUntil > now`, `status: 'ACTIVE'`, and at least one `Session` with `revokedAt: null` and `expiresAt > now`. One episode → title `mn.push.newEpisode.title`, body = `pushText ?? episode.title`, `data: {episodeId}`. Several → body `mn.push.newEpisodes.body(n)` = `${n} шинэ анги нэмэгдлээ` (listeners see it, and the app says "анги"; the design's "бичлэг" wording was admin wording), `data: {}`. Items with `notifyOnPublish: false` are left out; none left → nothing queued.

- [ ] **Step 1: Write failing tests:**
  - `publish now queues one push per member with access` (2 members with access, 1 without, 1 member logged out → 2 `push.send` jobs, body = title).
  - `pushText replaces the body`; `notifyOnPublish false → no jobs`.
  - `bulk publish of 3 items → one job per member with "3 шинэ анги нэмэгдлээ"`.
  - `cron publishes a scheduled VIDEO item` (today it only matches AUDIO).
  - `two cron ticks → push queued once`.
  - `logout clears this device's pushToken`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Cron: replace `mediaAssets: { some: { kind: 'AUDIO', status: 'READY' } }` with `{ some: { status: 'READY' } }`; queue the push inside a transaction with the `updateMany` only when `count === 1`, one combined push per tick. Logout: inside its transaction, `device.updateMany({ where: { userId, deviceId: session.deviceId }, data: { pushToken: null } })`.
- [ ] **Step 4:** Run tests + typecheck → PASS.
- [ ] **Step 5: Commit** `feat(api): push on publish; scheduled video items publish`

### Task 7: Catalog: home rows, series, playlists, tags

**Files:**
- Modify: `apps/api/src/catalog/service.ts`, `apps/api/src/routes/catalog.ts`, `packages/shared/src/catalog.ts`
- Test: extend `apps/api/test/catalog.test.ts`; create `apps/api/test/catalog-collections.test.ts`

**Interfaces:**
- Extends `episodeItemSchema`: `series: {id, title, part: number|null} | null`, `tags: Array<{id, name, slug}>`.
- Extends `episodeDetailSchema`: `nextInSeries: EpisodeItem | null` (next published part).
- Extends `homeResponseSchema` (additive): `featured: EpisodeItem[]`, `playlists: Array<{id, title, slug, items: EpisodeItem[]}>` (home playlists by `homeOrder`, each max `HOME_ROW` items, empty ones omitted).
- Extends `listEpisodesQuerySchema`: `tag?: id|slug`, `series?: id|slug`.
- Produces routes (auth as today): `GET /v1/series/:id` → `{series: {id,title,slug,description,coverUrl, items: EpisodeItem[] by part}}`; `GET /v1/playlists/:id` → `{playlist: {id,title,slug,description,coverUrl, items: EpisodeItem[] by position}}`; `GET /v1/tags` → tags with ≥1 published item.

- [ ] **Step 1: Write failing tests:**
  - `home has featured items in playlist order, only published`.
  - `home playlists: only showOnHome, in homeOrder, empty ones left out`.
  - `home keeps continueListening, latest, categories, thisWeek, nextRelease` (unchanged shape).
  - `series page lists only published parts, by part; unknown or no published parts → 404`.
  - `detail nextInSeries skips a DRAFT part 2 and returns published part 3`.
  - `playlist with a DRAFT and an ARCHIVED item shows neither`.
  - `list filter by tag slug and by series id`.
  - `/tags omits a tag used only by drafts`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `publishedWhere(now)` on every query and `itemsFor` for item shape. Add `series` and `tags` to `itemInclude`.
- [ ] **Step 4:** Run the whole API suite `pnpm --filter @ongod/api test` + typecheck → PASS.
- [ ] **Step 5: Commit** `feat(api): catalog series, playlists, tags and home rows`

### Task 8: Admin UI: nav, Цуврал, Жагсаалт, Шошго pages

**Files:**
- Modify: `apps/admin/src/App.tsx`, `apps/admin/src/layout/Shell.tsx`, `apps/admin/src/api/queries.ts`, `apps/admin/src/i18n/mn.ts`, `apps/admin/src/admin.css` (tokens only)
- Create: `apps/admin/src/pages/Series.tsx`, `SeriesEdit.tsx`, `Playlists.tsx`, `PlaylistEdit.tsx`, `Tags.tsx`; `apps/admin/src/components/SortableList.tsx`
- Test: extend `apps/admin/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: Task 2–4 endpoints and shared schemas.
- Produces: routes `series`, `series/new`, `series/:id`, `playlists`, `playlists/new`, `playlists/:id`, `tags`; nav order Хяналтын самбар, Төлбөр, Хэрэглэгчид, Контент, Цуврал, Жагсаалт, Ангилал, Шошго, Үйлдлийн түүх. `SortableList<T>({items, getId, render, onReorder(ids)})`: drag plus keyboard (Up/Down buttons, like the category page's moveUp/moveDown).

- [ ] **Step 1: Write failing e2e** in `admin.spec.ts`: create a series, add two existing items, move the second up, reload and see the new order; create a playlist with "Нүүрэнд харуулах" on; try deleting Онцлох and see the error toast; create and delete a tag.
- [ ] **Step 2:** Run `pnpm --filter @ongod/admin test:e2e` → FAIL.
- [ ] **Step 3:** Implement, following `Categories.tsx` and `EpisodeEdit.tsx` patterns (TanStack Query hooks in `queries.ts`, `Modal` for confirms, `DataTable` for lists). All strings in `mn.ts` under `series`, `playlists`, `tags`.
- [ ] **Step 4:** e2e PASS; `pnpm --filter @ongod/admin typecheck` and `test` PASS.
- [ ] **Step 5: Commit** `feat(admin): series, playlists and tags pages`

### Task 9: Admin UI: Контент form, list tools, calendar, preview, duplicate, bulk

**Files:**
- Modify: `apps/admin/src/pages/Episodes.tsx`, `EpisodeEdit.tsx`, `apps/admin/src/api/queries.ts`, `apps/admin/src/i18n/mn.ts`, `apps/admin/src/admin.css`
- Create: `apps/admin/src/components/TagPicker.tsx`, `BulkBar.tsx`, `ContentCalendar.tsx`, `MediaPreview.tsx`

**Interfaces:**
- Consumes: Tasks 3, 5, 6 endpoints.
- `TagPicker({value: string[], onChange})`: type to filter, Enter creates a tag through `POST /admin/tags`.
- `BulkBar({selectedIds, onDone})`: shows when ≥1 row selected; actions per `bulkRequestSchema`; publish and archive ask for confirmation; errors list the failing items by title.
- `ContentCalendar({month})`: month grid, queries with `from/to`, chips by status color token, click → `/episodes/:id`.
- `MediaPreview({episodeId, kind})`: audio element or video element (HLS through the existing player approach in `@ongod/ui-web` if present; otherwise native `<video>` with the signed URL).

- [ ] **Step 1: Write failing e2e:** fill series + part + tags on a new item and see them after reload; filter the list by tag; select two rows and bulk-add a tag; duplicate an item and land on the copy's edit page with "(хуулбар)"; switch to calendar and see a scheduled item on its day.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement. Form fields order: Гарчиг, Тайлбар, Ангилал, Цуврал + Хэсэг, Шошго, cover, media (+ Урьдчилан харах when READY), "Мэдэгдэл илгээх" switch + Мэдэгдлийн текст, publish/schedule. List: add columns Цуврал and checkbox selection; filters in the existing filter row; list/calendar toggle kept in the URL query.
- [ ] **Step 4:** e2e, typecheck, test PASS.
- [ ] **Step 5: Commit** `feat(admin): content form, filters, bulk, calendar, preview, duplicate`

### Task 10: Mobile: Нүүр rows, series and playlist screens, tag filter

**Files:**
- Modify: `apps/mobile/app/(app)/(tabs)/home.tsx`, `apps/mobile/app/(app)/(tabs)/library.tsx`, `apps/mobile/app/(app)/player/[id].tsx`, `apps/mobile/src/api/endpoints.ts`, `apps/mobile/src/data/queries.ts`, `apps/mobile/src/i18n/mn.ts`, `apps/mobile/src/screens/navigation.ts`
- Create: `apps/mobile/app/(app)/series/[id].tsx`, `apps/mobile/app/(app)/playlist/[id].tsx`, `apps/mobile/src/screens/home/homeRows.ts`
- Test: extend `apps/mobile/test/screens.test.ts`

**Interfaces:**
- Consumes: Task 7 responses.
- Produces: `homeRows(home: HomeResponse, loggedIn: boolean): HomeRow[]` where `HomeRow = {kind:'featured'|'continue'|'thisWeek'|'playlist'|'latest'|'categories', key: string, title: string, ...}` in the order Онцлох, Үргэлжлүүлэх, Энэ 7 хоногт, playlists, Шинэ, categories, dropping empty rows.

- [ ] **Step 1: Write failing tests** in `screens.test.ts` for `homeRows`: full order; empty featured and empty playlist dropped; `loggedIn=false` drops `continue`.
- [ ] **Step 2:** Run `pnpm --filter @ongod/mobile test` → FAIL.
- [ ] **Step 3:** Implement. Featured uses the existing `HeroCarousel`; playlist rows reuse the latest-row card. Series screen: cover, title, description, parts list with "N-р хэсэг". Player: when the item finishes and `nextInSeries` exists, show "Дараагийн хэсэг" in `NextList`. Сан: tag chips via `ChipRow` from `GET /v1/tags`.
- [ ] **Step 4:** test + typecheck PASS (`ui-tokens-only` and `no-payment-text` included).
- [ ] **Step 5: Commit** `feat(mobile): home rows, series and playlist screens, tag filter`

### Task 11: Wrap-up

- [ ] **Step 1:** Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm format:check` from the repo root; all pass.
- [ ] **Step 2:** Update `docs/DESIGN.md` with the admin bulk bar, calendar and mobile series/playlist screens (tokens used), and `docs/00-Index.md` if needed.
- [ ] **Step 3:** `/log` for the day with commit hashes and test results. Say **INSTALL FIRST** to Ganaa if any dependency was added.
- [ ] **Step 4: Commit** `docs: content management phase 1 log`
