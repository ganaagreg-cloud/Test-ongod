import { randomUUID } from 'node:crypto';
import type { AdminCategoryDto, AdminEpisodeDto, ListAdminEpisodesQuery } from '@ongod/shared';
import { thumbPathOf, type MediaUrls } from '../catalog/media';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { isUniqueViolation, lockUser } from '../auth/service';
import { escapeLike } from '../lib/like';
import { enqueueAudioUpload, enqueueCoverUpload, enqueueStorageDelete } from '../media/jobs';
import { coverFiles, processCover } from '../media/cover';
import type { UploadDirs } from '../media/storage';
import { audit } from './audit';

const episodeInclude = {
  category: { select: { id: true, name: true } },
  // The newest audio file decides what the admin sees (a re-upload replaces the older one).
  mediaAssets: { where: { kind: 'AUDIO' }, orderBy: { id: 'desc' }, take: 1 },
} satisfies Prisma.EpisodeInclude;
type EpisodeRow = Prisma.EpisodeGetPayload<{ include: typeof episodeInclude }>;

const OPEN_STATES = ['DRAFT', 'SCHEDULED'] as const;

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
    const missing: AdminEpisodeDto['missing'] = [];
    if (!row.coverPath) missing.push('cover');
    if (asset?.status !== 'READY') missing.push('audio');
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
        status: asset.status,
        failReason: asset.failReason,
        sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
        durationSec: asset.durationSec,
      },
      missing,
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
    _count: { episodes: number };
  }): AdminCategoryDto => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sortOrder,
    episodeCount: c._count.episodes,
  });

  const loadCategory = async (id: string) => {
    const row = await db.category.findUnique({
      where: { id },
      include: { _count: { select: { episodes: true } } },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return categoryDto(row);
  };

  return {
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
        await audit(tx, actor.id, 'category.delete', 'Category', id, { slug: found.slug });
      });
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
      const where: Prisma.EpisodeWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.categoryId ? { categoryId: query.categoryId } : {}),
        ...(query.q ? { title: { contains: escapeLike(query.q) } } : {}),
      };
      const [rows, total] = await Promise.all([
        db.episode.findMany({
          where,
          include: episodeInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.episode.count({ where }),
      ]);
      return { items: rows.map(toEpisodeDto), total, page: query.page, limit: query.limit };
    },

    async getEpisode(id: string) {
      return toEpisodeDto(await loadEpisode(id));
    },

    async createEpisode(
      actor: User,
      input: { title: string; description: string; categoryId: string },
    ) {
      const category = await db.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw new AppError(404, 'NOT_FOUND');
      const id = await db.$transaction(async (tx) => {
        // coverPath is '' until a cover is stored.
        const episode = await tx.episode.create({ data: { ...input, coverPath: '' } });
        await audit(tx, actor.id, 'episode.create', 'Episode', episode.id, {
          title: input.title,
          categoryId: input.categoryId,
        });
        return episode.id;
      });
      return this.getEpisode(id);
    },

    async updateEpisode(
      actor: User,
      id: string,
      input: { title?: string; description?: string; categoryId?: string },
    ) {
      if (
        input.categoryId &&
        !(await db.category.findUnique({ where: { id: input.categoryId } }))
      ) {
        throw new AppError(404, 'NOT_FOUND');
      }
      await db.$transaction(async (tx) => {
        if (!(await tx.episode.findUnique({ where: { id }, select: { id: true } }))) {
          throw new AppError(404, 'NOT_FOUND');
        }
        await tx.episode.update({ where: { id }, data: input });
        await audit(tx, actor.id, 'episode.update', 'Episode', id, input);
      });
      return this.getEpisode(id);
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
      const dto = toEpisodeDto(row);
      if (dto.missing.length > 0) {
        throw new AppError(409, 'NOT_READY_TO_PUBLISH', undefined, { missing: dto.missing });
      }
      const at = now();
      await db.$transaction(async (tx) => {
        const done = await tx.episode.updateMany({
          where: { id, status: { in: [...OPEN_STATES] } },
          data: { status: 'PUBLISHED', publishedAt: at, scheduledFor: null },
        });
        if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
        await audit(tx, actor.id, 'episode.publish', 'Episode', id, {});
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
      from: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED',
      to: 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'ARCHIVED',
      action: string,
      extra: Prisma.EpisodeUpdateManyMutationInput = {},
    ) {
      await loadEpisode(id);
      await db.$transaction(async (tx) => {
        const done = await tx.episode.updateMany({
          where: { id, status: from },
          data: { status: to, ...extra },
        });
        if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
        await audit(tx, actor.id, action, 'Episode', id, { from, to });
      });
    },

    /** Only drafts can be deleted; the stored files are removed by a job. */
    async deleteEpisode(actor: User, id: string) {
      await db.$transaction(async (tx) => {
        const row = await tx.episode.findUnique({
          where: { id },
          include: { mediaAssets: { select: { id: true, path: true } } },
        });
        if (!row) throw new AppError(404, 'NOT_FOUND');
        if (row.status !== 'DRAFT') throw new AppError(409, 'EPISODE_STATE');
        const paths = row.mediaAssets.map((a) => a.path);
        if (row.coverPath) paths.push(row.coverPath, thumbPathOf(row.coverPath));
        await tx.episode.delete({ where: { id } });
        await enqueueStorageDelete(tx, paths);
        await audit(tx, actor.id, 'episode.delete', 'Episode', id, { title: row.title });
      });
    },

    /** FAILED -> PROCESSING again, with the same file that is still waiting on our disk. */
    async retryMedia(actor: User, id: string) {
      const row = await loadEpisode(id);
      const asset = row.mediaAssets[0];
      if (!asset || asset.status !== 'FAILED') throw new AppError(409, 'EPISODE_STATE');
      await db.$transaction(async (tx) => {
        const done = await tx.mediaAsset.updateMany({
          where: { id: asset.id, status: 'FAILED' },
          data: { status: 'PROCESSING', failReason: null },
        });
        if (done.count !== 1) throw new AppError(409, 'EPISODE_STATE');
        await enqueueAudioUpload(tx, asset.id);
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
