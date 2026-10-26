import { randomUUID } from 'node:crypto';
import type {
  AdminCategoryDto,
  AdminEpisodeDto,
  CreateEpisodeRequest,
  ListAdminEpisodesQuery,
  PreviewResponse,
  UpdateEpisodeRequest,
} from '@ongod/shared';
import { PLAY_URL_TTL_MS, thumbPathOf, type MediaUrls } from '../catalog/media';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { isUniqueViolation, lockUser } from '../auth/service';
import { escapeLike } from '../lib/like';
import {
  enqueueCategoryCoverUpload,
  enqueueCoverUpload,
  enqueueMediaUpload,
  enqueueStorageDelete,
  enqueueStreamDelete,
  PENDING_PATH,
  splitStored,
} from '../media/jobs';
import { coverFiles, processCover } from '../media/cover';
import type { UploadDirs } from '../media/storage';
import { enqueuePublishPush, type PublishedEpisode } from '../push/publish';
import { audit } from './audit';

const episodeInclude = {
  category: { select: { id: true, name: true } },
  series: { select: { id: true, title: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
  // The newest media file, audio or video, decides what the admin sees (a re-upload replaces
  // the older one, ADR-0038).
  mediaAssets: { orderBy: { id: 'desc' }, take: 1 },
} satisfies Prisma.EpisodeInclude;
type EpisodeRow = Prisma.EpisodeGetPayload<{ include: typeof episodeInclude }>;

const OPEN_STATES = ['DRAFT', 'SCHEDULED'] as const;
type EpisodeState = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED';

/** What an episode still lacks before it can be published (the same rule for one and for bulk). */
export function missingOf(
  coverPath: string,
  newestMedia: { status: string } | null | undefined,
): AdminEpisodeDto['missing'] {
  const missing: AdminEpisodeDto['missing'] = [];
  if (!coverPath) missing.push('cover');
  if (newestMedia?.status !== 'READY') missing.push('media');
  return missing;
}

export const DUPLICATE_SUFFIX = ' (хуулбар)';

/** Admin side of SPEC G: categories, episodes and their media. */
export function createContentService(deps: {
  db: Db;
  media: MediaUrls;
  dirs: UploadDirs;
  now?: (() => Date) | undefined;
}) {
  const { db, media, dirs } = deps;
  const now = deps.now ?? (() => new Date());

  // ---------- DTOs ----------

  function toEpisodeDto(row: EpisodeRow): AdminEpisodeDto {
    const asset = row.mediaAssets[0] ?? null;
    const covers = row.coverPath ? media.cover(row.coverPath, now()) : null;
    const missing = missingOf(row.coverPath, asset);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      status: row.status,
      category: row.category,
      coverUrl: covers?.coverUrl ?? null,
      thumbUrl: covers?.thumbUrl ?? null,
      hasCover: row.coverPath !== '',
      scheduledFor: row.scheduledFor?.toISOString() ?? null,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      media: asset && {
        id: asset.id,
        kind: asset.kind,
        status: asset.status,
        failReason: asset.failReason,
        sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
        durationSec: asset.durationSec,
        updatedAt: asset.updatedAt.toISOString(),
      },
      missing,
      series: row.series,
      seriesPart: row.seriesPart,
      tags: row.tags.map((t) => t.tag).sort((a, b) => a.name.localeCompare(b.name)),
      notifyOnPublish: row.notifyOnPublish,
      isFree: row.isFree,
      pushText: row.pushText,
    };
  }

  const loadEpisode = async (id: string) => {
    const row = await db.episode.findUnique({ where: { id }, include: episodeInclude });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return row;
  };

  const categoryDto = (c: {
    id: string;
    name: string;
    slug: string;
    sortOrder: number;
    coverPath: string | null;
    _count: { episodes: number };
  }): AdminCategoryDto => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sortOrder,
    episodeCount: c._count.episodes,
    coverUrl: c.coverPath ? media.cover(c.coverPath, now()).coverUrl : null,
  });

  const loadCategory = async (id: string) => {
    const row = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { episodes: true } } },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return categoryDto(row);
  };

  /**
   * The part an episode gets in `seriesId`: the one asked for, the one it already has in that same
   * series, or the next free number (read inside the transaction). No series means no part.
   */
  async function placeInSeries(
    tx: Prisma.TransactionClient,
    seriesId: string | null,
    wanted: number | null,
    current: { seriesId: string | null; seriesPart: number | null } | null,
  ): Promise<number | null> {
    if (seriesId === null) {
      if (wanted !== null) throw new AppError(400, 'VALIDATION_ERROR');
      return null;
    }
    const found = await tx.series.findUnique({ where: { id: seriesId }, select: { title: true } });
    if (!found) throw new AppError(404, 'NOT_FOUND');
    // Row lock on the series (a no-op write): placements into one series queue up.
    await tx.series.update({ where: { id: seriesId }, data: { title: found.title } });
    if (wanted !== null) return wanted;
    if (current && current.seriesId === seriesId && current.seriesPart !== null) {
      return current.seriesPart;
    }
    const last = await tx.episode.aggregate({ where: { seriesId }, _max: { seriesPart: true } });
    return (last._max.seriesPart ?? 0) + 1;
  }

  /**
   * Runs `attempt`; a unique violation on a part the caller did not ask for (taken by a concurrent
   * request between our read and write) retries on a fresh snapshot, and only a part the caller
   * chose is reported as SERIES_PART_TAKEN.
   */
  async function withPartRetry<T>(chosenPart: boolean, attempt: () => Promise<T>): Promise<T> {
    for (let n = 1; ; n++) {
      try {
        return await attempt();
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        if (chosenPart || n >= 5) throw new AppError(409, 'SERIES_PART_TAKEN');
      }
    }
  }

  async function assertTagsExist(tx: Prisma.TransactionClient, tagIds: string[]) {
    const unique = [...new Set(tagIds)];
    if (unique.length === 0) return;
    const found = await tx.tag.count({ where: { id: { in: unique } } });
    if (found !== unique.length) throw new AppError(404, 'NOT_FOUND');
  }

  /** Replaces the episode's tags (ids already checked). */
  async function setTags(tx: Prisma.TransactionClient, episodeId: string, tagIds: string[]) {
    await tx.episodeTag.deleteMany({ where: { episodeId } });
    const unique = [...new Set(tagIds)];
    if (unique.length > 0) {
      await tx.episodeTag.createMany({ data: unique.map((tagId) => ({ episodeId, tagId })) });
    }
  }

  /** DRAFT/SCHEDULED -> PUBLISHED inside the caller's transaction (single and bulk publish). */
  async function publishTx(
    tx: Prisma.TransactionClient,
    actor: User,
    id: string,
    at: Date,
  ): Promise<PublishedEpisode> {
    const done = await tx.episode.updateMany({
      where: { id, status: { in: [...OPEN_STATES] } },
      data: { status: 'PUBLISHED', publishedAt: at, scheduledFor: null },
    });
    if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
    await audit(tx, actor.id, 'episode.publish', 'Episode', id, {});
    // The caller queues the push (one per transaction, so a bulk publish sends one message).
    return tx.episode.findUniqueOrThrow({
      where: { id },
      select: { id: true, title: true, pushText: true, notifyOnPublish: true },
    });
  }

  /** `from` -> `to` with a status precondition inside the caller's transaction. */
  async function transitionTx(
    tx: Prisma.TransactionClient,
    actor: User,
    id: string,
    from: EpisodeState,
    to: EpisodeState,
    action: string,
    extra: Prisma.EpisodeUpdateManyMutationInput = {},
  ) {
    const done = await tx.episode.updateMany({
      where: { id, status: from },
      data: { status: to, ...extra },
    });
    if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
    await audit(tx, actor.id, action, 'Episode', id, { from, to });
  }

  return {
    /** Writes that join the caller's transaction, for bulk actions. */
    tx: { publish: publishTx, transition: transitionTx },

    // ---------- Categories ----------

    async listCategories() {
      const rows = await db.category.findMany({
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { episodes: true } } },
      });
      return rows.map(categoryDto);
    },

    async createCategory(actor: User, input: { name: string; slug: string }) {
      try {
        const id = await db.$transaction(async (tx) => {
          const last = await tx.category.aggregate({ _max: { sortOrder: true } });
          const category = await tx.category.create({
            data: { ...input, sortOrder: (last._max.sortOrder ?? 0) + 1 },
          });
          await audit(tx, actor.id, 'category.create', 'Category', category.id, input);
          return category.id;
        });
        return loadCategory(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'SLUG_TAKEN');
        throw err;
      }
    },

    async updateCategory(actor: User, id: string, input: { name?: string; slug?: string }) {
      try {
        await db.$transaction(async (tx) => {
          const found = await tx.category.findUnique({ where: { id } });
          if (!found) throw new AppError(404, 'NOT_FOUND');
          await tx.category.update({ where: { id }, data: input });
          await audit(tx, actor.id, 'category.update', 'Category', id, input);
        });
        return loadCategory(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'SLUG_TAKEN');
        throw err;
      }
    },

    /** Only an empty category can go: its episodes would lose their category. */
    async deleteCategory(actor: User, id: string) {
      await db.$transaction(async (tx) => {
        const found = await tx.category.findUnique({
          where: { id },
          include: { _count: { select: { episodes: true } } },
        });
        if (!found) throw new AppError(404, 'NOT_FOUND');
        if (found._count.episodes > 0) throw new AppError(409, 'CATEGORY_NOT_EMPTY');
        await tx.category.delete({ where: { id } });
        if (found.coverPath) {
          await enqueueStorageDelete(tx, [found.coverPath, thumbPathOf(found.coverPath)]);
        }
        await audit(tx, actor.id, 'category.delete', 'Category', id, { slug: found.slug });
      });
    },

    /** Resizes to the two covers (fast, local), then a job stores them and points the category at them. */
    async setCategoryCover(actor: User, id: string, image: Buffer) {
      await loadCategory(id);
      const coverId = randomUUID();
      await processCover(image, dirs, coverId);
      await db.$transaction(async (tx) => {
        await enqueueCategoryCoverUpload(tx, id, coverId);
        await audit(tx, actor.id, 'category.cover', 'Category', id, { coverId });
      });
      return loadCategory(id);
    },

    /** `ids` must be every category, in the new order. */
    async reorderCategories(actor: User, ids: string[]) {
      await db.$transaction(async (tx) => {
        const all = await tx.category.findMany({ select: { id: true } });
        const same =
          ids.length === all.length &&
          new Set(ids).size === ids.length &&
          all.every((c) => ids.includes(c.id));
        if (!same) throw new AppError(400, 'VALIDATION_ERROR');
        for (const [index, id] of ids.entries()) {
          await tx.category.update({ where: { id }, data: { sortOrder: index + 1 } });
        }
        await audit(tx, actor.id, 'category.reorder', 'Category', 'all', { ids });
      });
      return this.listCategories();
    },

    // ---------- Episodes ----------

    async listEpisodes(query: ListAdminEpisodesQuery) {
      // Every filter but the status: the tab counts use it as it is.
      const withoutStatus: Prisma.EpisodeWhereInput = {
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.seriesId ? { seriesId: query.seriesId } : {}),
        ...(query.tagId ? { tags: { some: { tagId: query.tagId } } } : {}),
        ...(query.playlistId ? { playlistItems: { some: { playlistId: query.playlistId } } } : {}),
        ...(query.mediaStatus === 'NONE'
          ? { mediaAssets: { none: {} } }
          : query.mediaStatus
            ? { mediaAssets: { some: { status: query.mediaStatus } } }
            : {}),
        ...(query.from && query.to
          ? {
              OR: [
                { scheduledFor: { gte: new Date(query.from), lt: new Date(query.to) } },
                { publishedAt: { gte: new Date(query.from), lt: new Date(query.to) } },
              ],
            }
          : {}),
        ...(query.q ? { title: { contains: escapeLike(query.q) } } : {}),
      };
      const where: Prisma.EpisodeWhereInput = {
        ...withoutStatus,
        ...(query.status ? { status: query.status } : {}),
      };
      const sortField = (
        { created: 'createdAt', published: 'publishedAt', scheduled: 'scheduledFor' } as const
      )[query.sort];
      const [rows, total, grouped] = await Promise.all([
        db.episode.findMany({
          where,
          include: episodeInclude,
          orderBy: [{ [sortField]: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.episode.count({ where }),
        db.episode.groupBy({ by: ['status'], where: withoutStatus, _count: { _all: true } }),
      ]);
      const counts = { DRAFT: 0, SCHEDULED: 0, PUBLISHED: 0, ARCHIVED: 0 };
      for (const group of grouped) counts[group.status] = group._count._all;
      return {
        items: rows.map(toEpisodeDto),
        total,
        counts,
        page: query.page,
        limit: query.limit,
      };
    },

    async getEpisode(id: string) {
      return toEpisodeDto(await loadEpisode(id));
    },

    async createEpisode(actor: User, input: CreateEpisodeRequest) {
      const category = await db.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new AppError(404, 'NOT_FOUND');
      return withPartRetry(input.seriesPart != null, async () => {
        const id = await db.$transaction(async (tx) => {
          const seriesId = input.seriesId ?? null;
          const seriesPart = await placeInSeries(tx, seriesId, input.seriesPart ?? null, null);
          await assertTagsExist(tx, input.tagIds ?? []);
          // coverPath is '' until a cover is stored.
          const episode = await tx.episode.create({
            data: {
              title: input.title,
              description: input.description,
              categoryId: input.categoryId,
              coverPath: '',
              seriesId,
              seriesPart,
              ...(input.notifyOnPublish !== undefined
                ? { notifyOnPublish: input.notifyOnPublish }
                : {}),
              ...(input.isFree !== undefined ? { isFree: input.isFree } : {}),
              pushText: input.pushText ?? null,
            },
          });
          await setTags(tx, episode.id, input.tagIds ?? []);
          await audit(tx, actor.id, 'episode.create', 'Episode', episode.id, {
            title: input.title,
            categoryId: input.categoryId,
            ...(seriesId ? { seriesId, seriesPart } : {}),
          });
          return episode.id;
        });
        return await this.getEpisode(id);
      });
    },

    async updateEpisode(actor: User, id: string, input: UpdateEpisodeRequest) {
      if (
        input.categoryId &&
        !(await db.category.findUnique({ where: { id: input.categoryId } }))
      ) {
        throw new AppError(404, 'NOT_FOUND');
      }
      return withPartRetry(input.seriesPart != null, async () => {
        await db.$transaction(async (tx) => {
          const current = await tx.episode.findUnique({
            where: { id },
            select: { seriesId: true, seriesPart: true },
          });
          if (!current) throw new AppError(404, 'NOT_FOUND');

          const data: Prisma.EpisodeUncheckedUpdateInput = {};
          if (input.title !== undefined) data.title = input.title;
          if (input.description !== undefined) data.description = input.description;
          if (input.categoryId !== undefined) data.categoryId = input.categoryId;
          if (input.notifyOnPublish !== undefined) data.notifyOnPublish = input.notifyOnPublish;
          if (input.isFree !== undefined) data.isFree = input.isFree;
          if (input.pushText !== undefined) data.pushText = input.pushText;
          if (input.seriesId !== undefined || input.seriesPart !== undefined) {
            const seriesId = input.seriesId === undefined ? current.seriesId : input.seriesId;
            data.seriesId = seriesId;
            data.seriesPart = await placeInSeries(tx, seriesId, input.seriesPart ?? null, current);
          }
          if (input.tagIds !== undefined) {
            await assertTagsExist(tx, input.tagIds);
            await setTags(tx, id, input.tagIds);
          }
          if (Object.keys(data).length > 0) await tx.episode.update({ where: { id }, data });
          await audit(tx, actor.id, 'episode.update', 'Episode', id, input);
        });
        return await this.getEpisode(id);
      });
    },

    /**
     * Resizes the uploaded image to the two square covers (a fast local step), then queues the
     * job that sends them to storage and points the episode at them.
     */
    async setCover(actor: User, id: string, image: Buffer) {
      await loadEpisode(id);
      const coverId = randomUUID();
      await processCover(image, dirs, coverId);
      await db.$transaction(async (tx) => {
        await enqueueCoverUpload(tx, id, coverId);
        await audit(tx, actor.id, 'episode.cover', 'Episode', id, { coverId });
      });
      return this.getEpisode(id);
    },

    /** DRAFT or SCHEDULED -> PUBLISHED, but only with a cover and READY audio. */
    async publish(actor: User, id: string) {
      const row = await loadEpisode(id);
      const missing = missingOf(row.coverPath, row.mediaAssets[0]);
      if (missing.length > 0) {
        throw new AppError(409, 'NOT_READY_TO_PUBLISH', undefined, { missing });
      }
      const at = now();
      await db.$transaction(async (tx) => {
        const published = await publishTx(tx, actor, id, at);
        await enqueuePublishPush(tx, [published], at);
      });
      return this.getEpisode(id);
    },

    /** DRAFT or SCHEDULED -> SCHEDULED for a time in the future. The cron publishes it when due. */
    async schedule(actor: User, id: string, scheduledFor: Date) {
      if (scheduledFor.getTime() <= now().getTime()) throw new AppError(400, 'VALIDATION_ERROR');
      await loadEpisode(id);
      await db.$transaction(async (tx) => {
        const done = await tx.episode.updateMany({
          where: { id, status: { in: [...OPEN_STATES] } },
          data: { status: 'SCHEDULED', scheduledFor },
        });
        if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
        await audit(tx, actor.id, 'episode.schedule', 'Episode', id, {
          scheduledFor: scheduledFor.toISOString(),
        });
      });
      return this.getEpisode(id);
    },

    async unschedule(actor: User, id: string) {
      await this.transition(actor, id, 'SCHEDULED', 'DRAFT', 'episode.unschedule', {
        scheduledFor: null,
      });
      return this.getEpisode(id);
    },

    /** PUBLISHED -> ARCHIVED: gone from the library, kept in admin. */
    async archive(actor: User, id: string) {
      await this.transition(actor, id, 'PUBLISHED', 'ARCHIVED', 'episode.archive');
      return this.getEpisode(id);
    },

    /**
     * ARCHIVED -> PUBLISHED: the undo of `archive`. It keeps publishedAt and sends no push (that
     * only happens in `publish`), so the item is back in the library exactly as it was.
     */
    async unarchive(actor: User, id: string) {
      await this.transition(actor, id, 'ARCHIVED', 'PUBLISHED', 'episode.unarchive');
      return this.getEpisode(id);
    },

    /** ARCHIVED -> DRAFT, to edit and publish again. */
    async restore(actor: User, id: string) {
      await this.transition(actor, id, 'ARCHIVED', 'DRAFT', 'episode.restore', {
        publishedAt: null,
      });
      return this.getEpisode(id);
    },

    async transition(
      actor: User,
      id: string,
      from: EpisodeState,
      to: EpisodeState,
      action: string,
      extra: Prisma.EpisodeUpdateManyMutationInput = {},
    ) {
      await loadEpisode(id);
      await db.$transaction((tx) => transitionTx(tx, actor, id, from, to, action, extra));
    },

    /**
     * A new DRAFT with the text, category, series (without a part), tags and notify settings of
     * `id`. No cover and no media: those are per recording.
     */
    async duplicate(actor: User, id: string) {
      const copyId = await db.$transaction(async (tx) => {
        const source = await tx.episode.findUnique({
          where: { id },
          include: { tags: { select: { tagId: true } } },
        });
        if (!source) throw new AppError(404, 'NOT_FOUND');
        const copy = await tx.episode.create({
          data: {
            title: source.title.slice(0, 200 - DUPLICATE_SUFFIX.length) + DUPLICATE_SUFFIX,
            description: source.description,
            categoryId: source.categoryId,
            coverPath: '',
            seriesId: source.seriesId,
            seriesPart: null,
            notifyOnPublish: source.notifyOnPublish,
            pushText: source.pushText,
          },
        });
        await setTags(
          tx,
          copy.id,
          source.tags.map((t) => t.tagId),
        );
        await audit(tx, actor.id, 'episode.duplicate', 'Episode', copy.id, { from: id });
        return copy.id;
      });
      return this.getEpisode(copyId);
    },

    /**
     * A signed play link for the admin to check the recording, whatever the episode's status:
     * no member access or device checks (the caller is an admin).
     */
    async preview(id: string): Promise<PreviewResponse> {
      const row = await loadEpisode(id);
      const asset = row.mediaAssets[0];
      if (asset?.status !== 'READY') throw new AppError(409, 'MEDIA_NOT_READY');
      if (!media.enabled || (asset.kind === 'VIDEO' && !media.videoEnabled)) {
        throw new AppError(503, 'SERVICE_UNAVAILABLE');
      }
      const expiresAt = new Date(now().getTime() + PLAY_URL_TTL_MS);
      return {
        kind: asset.kind,
        url:
          asset.kind === 'VIDEO'
            ? media.video(asset.path, expiresAt)
            : media.audio(asset.path, expiresAt),
        expiresAt: expiresAt.toISOString(),
      };
    },

    /** Only drafts can be deleted; the stored files are removed by a job. */
    async deleteEpisode(actor: User, id: string) {
      await db.$transaction(async (tx) => {
        const row = await tx.episode.findUnique({
          where: { id },
          include: { mediaAssets: { select: { id: true, provider: true, path: true } } },
        });
        if (!row) throw new AppError(404, 'NOT_FOUND');
        if (row.status !== 'DRAFT') throw new AppError(409, 'EPISODE_STATE');
        const { paths, videoIds } = splitStored(row.mediaAssets);
        if (row.coverPath) paths.push(row.coverPath, thumbPathOf(row.coverPath));
        await tx.episode.delete({ where: { id } });
        await enqueueStorageDelete(tx, paths);
        await enqueueStreamDelete(tx, videoIds);
        await audit(tx, actor.id, 'episode.delete', 'Episode', id, { title: row.title });
      });
    },

    /**
     * FAILED -> PROCESSING again, with the same file that is still waiting on our disk. A video
     * that reached Bunny gets a fresh Stream video (the failed one is deleted by a job).
     */
    async retryMedia(actor: User, id: string) {
      const row = await loadEpisode(id);
      const asset = row.mediaAssets[0];
      if (!asset || asset.status !== 'FAILED') throw new AppError(409, 'EPISODE_STATE');
      await db.$transaction(async (tx) => {
        const freshVideo = asset.provider === 'BUNNY_STREAM' && asset.path !== PENDING_PATH;
        const done = await tx.mediaAsset.updateMany({
          where: { id: asset.id, status: 'FAILED' },
          data: {
            status: 'PROCESSING',
            failReason: null,
            ...(freshVideo ? { path: PENDING_PATH } : {}),
          },
        });
        if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
        if (freshVideo) await enqueueStreamDelete(tx, [asset.path]);
        await enqueueMediaUpload(tx, asset.kind, asset.id);
        await audit(tx, actor.id, 'episode.media_retry', 'Episode', id, { assetId: asset.id });
      });
      return this.getEpisode(id);
    },

    // ---------- Users ----------

    /** An admin removes one of a user's devices (lost phone): its sessions end at once. */
    async removeDevice(actor: User, userId: string, deviceId: string) {
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const device = await tx.device.findFirst({ where: { id: deviceId, userId } });
        if (!device) throw new AppError(404, 'NOT_FOUND');
        await tx.device.delete({ where: { id: device.id } });
        await tx.session.updateMany({
          where: { userId, deviceId: device.deviceId, revokedAt: null },
          data: { revokedAt: now() },
        });
        await audit(tx, actor.id, 'device.remove', 'User', userId, {
          platform: device.platform,
          model: device.model,
        });
      });
    },
  };
}

export type ContentService = ReturnType<typeof createContentService>;

/** Used by the tests and the cron task. */
export { coverFiles };
