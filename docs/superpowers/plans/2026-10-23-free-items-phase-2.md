# Free items, phase 2: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can mark an item free; any logged-in user can play a free item without active access; paid items stay paid and, for a user without access, look blurred and tell them to activate their package.

**Architecture:** One new column `Episode.isFree`. The catalog item DTO carries `isFree`; `play()` skips the access check for a published free item and keeps every other check (device, media, published). Admin gets a per-item switch. Mobile blurs the cover of a paid item when the user has no active access and shows one plain text line in the no-access sheet.

**Tech Stack:** Node 20, TypeScript, Fastify 5, Prisma 7 (MySQL 8), zod 4, Vitest; React 19 + Vite (admin); Expo + expo-router + expo-blur (mobile, `node:test` via tsx).

**Spec:** No separate spec doc. Decisions: [[ADR-0043-allow-free-users-and-free-content|ADR-0043]], [[ADR-0044-free-items-and-activate-message-in-app|ADR-0044]] (`docs/decisions/`); [[SPEC]] (intro, workflow G, data model) and [[DESIGN]] (no-access state, "Do not") already describe the result.

## Global Constraints

- Free items need a login. There is no logged-out playback and no logged-out endpoint.
- Free is per item (`Episode.isFree`). No series-level or playlist-level switch.
- The 2-device limit and `DEVICE_NOT_REGISTERED` apply to free and paid plays alike.
- Every endpoint: zod input and output, errors as `{error:{code,message}}` via `AppError`, tests for access rules.
- Admin writes: one `db.$transaction`, one `audit(...)` row per changed item.
- Portable Prisma only: no raw SQL, no engine-specific types.
- User-facing text only in the per-app `mn.ts` files. The activate text is exactly: `Онгод Premium, та багцаа идэвхжүүлнэ үү` (owner to confirm spelling).
- Mobile: no price, plan name, link, button or bank text. The activate text is plain text only. No lock icon (blur only).
- UI uses DESIGN tokens only; `apps/mobile/test/ui-tokens-only.test.ts` and `apps/admin/test/admin-css.test.ts` stay green.
- `apps/api/test/docs.test.ts` stays green (the API docs list the new field).

## Review Focus

1. **Expired user plays a free item:** `min(now + TTL, accessUntil)` with a past `accessUntil` would issue an already-expired URL. A free play by a user without active access must expire at `now + PLAY_URL_TTL_MS`. Test in Task 2.
2. **Unpublished free item:** a DRAFT, SCHEDULED or ARCHIVED item marked free must not play for a user without access (still `NO_ACCESS`, as before). Test in Task 2.
3. **Duplicate of a free item:** the copy starts paid (`isFree: false`); an accidental free copy is the worse mistake. Test in Task 1.
4. **Free play on an unregistered device:** `DEVICE_NOT_REGISTERED` still wins for a user without access on a free item. Test in Task 2.
5. **Lock boundary on the phone:** `accessUntil` equal to now is locked (the server uses `<=`); `null` is locked; a free item is never locked. Test in Task 4.

---

### Task 1: `isFree` on the episode (schema, shared, admin API)

**Files:**

- Modify: `apps/api/prisma/schema.prisma` (Episode, next to `notifyOnPublish`)
- Create: `apps/api/prisma/migrations/20261023100000_episode_is_free/migration.sql`
- Modify: `packages/shared/src/admin-content.ts` (`adminEpisodeSchema`, `createEpisodeRequestSchema`)
- Modify: `apps/api/src/admin/content.ts` (DTO near line 95, create near 363, update near 400, duplicate near 517), `apps/api/src/dev/doc-schemas.ts` if `docs.test.ts` needs it
- Modify: `apps/api/test/catalog-helpers.ts` (`makeEpisode` takes `isFree?: boolean`)
- Test: `apps/api/test/admin-content-tools.test.ts`

**Interfaces:**

- Produces: column `Episode.isFree Boolean @default(false)`; `AdminEpisodeDto.isFree: boolean`; `CreateEpisodeRequest.isFree?: boolean` and the same on update (the update schema is `.partial()` of create); `makeEpisode({ isFree })`.

- [ ] **Step 1: Write the failing tests** in `admin-content-tools.test.ts`, describe `free items`: `creates an item as paid by default` (POST without `isFree` → `episode.isFree === false`); `an admin marks an item free and back` (PATCH `{ isFree: true }` → true, then `{ isFree: false }` → false, one audit row per change); `a USER cannot set isFree` (403); `duplicate starts paid` (source `isFree: true` → copy `isFree === false`).
- [ ] **Step 2: Run** `pnpm --filter @ongod/api exec vitest run test/admin-content-tools.test.ts -t "free items"`. Expected: FAIL (unknown field).
- [ ] **Step 3: Implement** the column and migration (`ALTER TABLE \`Episode\` ADD COLUMN \`isFree\` BOOLEAN NOT NULL DEFAULT false;`), the two shared schemas (`isFree: z.boolean()`on the DTO,`z.boolean().optional()`on create), and pass it through create, update (same`!== undefined`pattern as`notifyOnPublish`) and the DTO mapper. Duplicate sets nothing, so it takes the default. Run `pnpm --filter @ongod/api db:deploy`and`db:generate`.
- [ ] **Step 4: Run** the same command plus `pnpm --filter @ongod/api typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): Episode.isFree and admin set/unset (ADR-0043)`.

### Task 2: Catalog item `isFree` and the play rule

**Files:**

- Modify: `packages/shared/src/catalog.ts` (`episodeItemSchema`: `isFree: z.boolean()`)
- Modify: `apps/api/src/catalog/service.ts` (item mapper near line 133: `isFree: ep.isFree`, and make sure every select that feeds it includes `isFree`; `play()` near line 443)
- Test: `apps/api/test/play.test.ts`, `apps/api/test/catalog.test.ts`

**Interfaces:**

- Consumes: Task 1 column and `makeEpisode({ isFree })`.
- Produces: `EpisodeItem.isFree: boolean` in every list and detail response; `play()` behavior below.

- [ ] **Step 1: Write the failing tests.** `catalog.test.ts`: `episode list items carry isFree` (one free, one paid; both values appear in `GET /v1/episodes`). `play.test.ts`, describe `free items`: `a user with no access plays a published free item` (200, url present, `expiresAt === now + 4h`); `a user with expired access gets a url that expires at now + 4h, not in the past` (`accessUntil` = now − DAY; `Date.parse(expiresAt) > now`); `a user with no access is refused a paid item` (403 `NO_ACCESS`); `a draft free item is refused` (403 `NO_ACCESS`); `an archived free item is refused` (403 `NO_ACCESS`); `a free item on an unregistered device` (403 `DEVICE_NOT_REGISTERED`); `a member still gets min(4h, accessUntil)` on a free item (accessUntil = now + 1h → expiresAt = now + 1h); `an anonymous request is 401`.
- [ ] **Step 2: Run** `pnpm --filter @ongod/api exec vitest run test/play.test.ts test/catalog.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In `play()` keep the order device → media → episode lookup as it is for paid items. Replace the first check with: `const hasAccess = user.accessUntil != null && user.accessUntil.getTime() > now.getTime()`; if not `hasAccess`, look up `db.episode.findFirst({ where: { AND: [publishedWhere(now), { id: episodeId, isFree: true }] }, select: { id: true } })` and throw `AppError(403, 'NO_ACCESS')` when it is null. `expiresAt` = `hasAccess ? min(now + TTL, accessUntil) : now + TTL`. Update the doc comment above `play()` (SPEC G, ADR-0043). Add `isFree` to the field list in `apps/api/src/dev/doc-schemas.ts` if `docs.test.ts` requires it.
- [ ] **Step 4: Run** the Step 2 command, then `pnpm --filter @ongod/api test` (full suite, all green; it takes about 20 minutes) and typecheck.
- [ ] **Step 5: Commit** `feat(api): free items play without access (ADR-0043)`.

### Task 3: Admin switch

**Files:**

- Modify: `apps/admin/src/pages/EpisodeEdit.tsx` (a checkbox in the details form), `apps/admin/src/pages/Episodes.tsx` (a "Үнэгүй" badge column, `ui-badge` info tone), `apps/admin/src/i18n/mn.ts` (`episodes.free: 'Үнэгүй'`, `episodes.freeHint: 'Нэвтэрсэн бүх хэрэглэгч сонсож болно'`)
- Test: `apps/admin/e2e/admin.spec.ts`

**Interfaces:**

- Consumes: `AdminEpisodeDto.isFree`, `UpdateEpisodeRequest.isFree` (Task 1).

- [ ] **Step 1: Write the failing e2e** `free: mark an item free, see the badge, mark it paid again`: open an episode, tick `mn.episodes.free`, save, assert the toast and the badge in the list, untick, save, badge gone.
- [ ] **Step 2: Run** (API started as in `apps/admin/playwright.config.ts`, after `pnpm build`): `pnpm --filter @ongod/admin test:e2e -g "free:"`. Expected: FAIL.
- [ ] **Step 3: Implement** the checkbox with the existing `Input`/checkbox pattern of the page, saved with the other fields in one PATCH; the badge uses the existing `ui-badge` classes and CSS variables only.
- [ ] **Step 4: Run** the e2e and `pnpm --filter @ongod/admin test`, typecheck, lint, prettier. Expected: PASS.
- [ ] **Step 5: Commit** `feat(admin): free switch and badge per item (ADR-0043)`.

### Task 4: Mobile — blurred cover and the activate text

**Files:**

- Modify: `apps/mobile/src/lib/episode.ts` (add `isLocked`)
- Modify: `apps/mobile/src/ui/EpisodeThumb.tsx` (`locked?: boolean` prop: a `BlurView` over the picture, same intensity constant as `ui/Glass.tsx`, no icon), and pass it through `ui/EpisodeRow.tsx`, `ui/EpisodeCard.tsx`, `screens/home/ContinueCard.tsx`, `screens/player/NextList.tsx`, plus the Home hero and the Player picture wherever an `EpisodeItem` cover is drawn (search `EpisodeThumb` and `Artwork` usages with an episode)
- Modify: `apps/mobile/src/i18n/mn.ts` (`noAccess.activate`), `apps/mobile/src/screens/NoAccessSheet.tsx` (one plain `<Text>` line above the existing text)
- Modify: `apps/mobile/test/no-payment-text.test.ts`
- Test: `apps/mobile/test/screens.test.ts`

**Interfaces:**

- Consumes: `EpisodeItem.isFree` (Task 2); `useAuth().user.accessUntil` and `accessState` from `lib/episode.ts`.
- Produces: `isLocked(item: Pick<EpisodeItem, 'isFree'>, accessUntil: string | null | undefined, now: Date): boolean` — true when the item is not free and access is not active.

- [ ] **Step 1: Write the failing tests.** `screens.test.ts`: `isLocked is false for a free item whatever the access`; `isLocked is true for a paid item with null access`; `isLocked is true when accessUntil equals now`; `isLocked is false for a paid item with access until tomorrow`. `no-payment-text.test.ts`: the approved activate string is removed from the checked code before the patterns run; add `the activate text is the only allowed hit` (it appears exactly once, in `src/i18n/mn.ts`, and equals `Онгод Premium, та багцаа идэвхжүүлнэ үү`) and keep `the check does catch payment text` green (the sample list still fails the patterns).
- [ ] **Step 2: Run** `pnpm --filter @ongod/mobile test`. Expected: FAIL.
- [ ] **Step 3: Implement** `isLocked` using `accessState(...).active`; thread `locked` into the thumbs from the screens that already read `useAuth()`; the sheet shows `mn.noAccess.activate` as a `Text` with token colors only. Add rows to `docs/runbooks/DEVICE_SMOKE.md`: a paid item blurred for a no-access account, a free item playable, the sheet text.
- [ ] **Step 4: Run** `pnpm --filter @ongod/mobile test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): blurred paid items and the activate text (ADR-0044)`.

### Task 5: Docs, full verification, log

**Files:**

- Modify: `docs/SPEC.md` (data model Episode: add `isFree`; workflow G: one line on free items), `docs/DESIGN.md` (admin screens: the free switch and badge), `docs/client/changes.md` (the 2026-10-21 entry: free content now included, price still blank for Ganaa), `docs/log/2026-10-23.md` or the day's log via `/log`

- [ ] **Step 1:** Make the SPEC/DESIGN/`changes.md` edits above (no new decision; they restate ADR-0043/0044).
- [ ] **Step 2:** From the repo root run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm --filter @ongod/api test`, `pnpm --filter @ongod/mobile test`, admin unit and e2e, portal e2e. Expected: all pass; record the counts.
- [ ] **Step 3:** Run `/log` with commit hashes and test counts; push only when Ganaa says so.
