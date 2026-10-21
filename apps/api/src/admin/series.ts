import { randomUUID } from 'node:crypto';
import type {
  AdminSeriesDetailDto,
  AdminSeriesDto,
  CreateSeriesRequest,
  UpdateSeriesRequest,
} from '@ongod/shared';
import { isUniqueViolation } from '../auth/service';
import { thumbPathOf, type MediaUrls } from '../catalog/media';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { processCover } from '../media/cover';
import { enqueueSeriesCoverUpload, enqueueStorageDelete } from '../media/jobs';
import type { UploadDirs } from '../media/storage';
import { audit } from './audit';

/** Admin series (ADR-0042): an ordered run of episodes with its own title, slug and cover. */
export function createSeriesService(deps: {
  db: Db;
  media: MediaUrls;
  dirs: UploadDirs;
  now?: (() => Date) | undefined;
}) {
  const { db, media, dirs } = deps;
  const now = deps.now ?? (() => new Date());

  const dto = (s: {
    id: string;
    title: string;
    slug: string;
    description: string;
    coverPath: string | null;
    _count: { episodes: number };
  }): AdminSeriesDto => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    description: s.description,
    coverUrl: s.coverPath ? media.cover(s.coverPath, now()).coverUrl : null,
    episodeCount: s._count.episodes,
  });

  const load = async (id: string): Promise<AdminSeriesDetailDto> => {
    const row = await db.series.findUnique({
      where: { id },
      include: {
        _count: { select: { episodes: true } },
        episodes: {
          select: { id: true, title: true, status: true, seriesPart: true },
          orderBy: [{ seriesPart: 'asc' }, { id: 'asc' }],
        },
      },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return { ...dto(row), episodes: row.episodes };
  };

  return {
    async list() {
      const rows = await db.series.findMany({
        orderBy: [{ title: 'asc' }, { id: 'asc' }],
        include: { _count: { select: { episodes: true } } },
      });
      return rows.map(dto);
    },

    get: load,

    async create(actor: User, input: CreateSeriesRequest) {
      try {
        const id = await db.$transaction(async (tx) => {
          const series = await tx.series.create({
            data: {
              title: input.title,
              slug: input.slug,
              ...(input.description !== undefined ? { description: input.description } : {}),
            },
          });
          await audit(tx, actor.id, 'series.create', 'Series', series.id, {
            title: input.title,
            slug: input.slug,
          });
          return series.id;
        });
        return await load(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'SLUG_TAKEN');
        throw err;
      }
    },

    async update(actor: User, id: string, input: UpdateSeriesRequest) {
      try {
        await db.$transaction(async (tx) => {
          if (!(await tx.series.findUnique({ where: { id }, select: { id: true } }))) {
            throw new AppError(404, 'NOT_FOUND');
          }
          await tx.series.update({
            where: { id },
            data: {
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.slug !== undefined ? { slug: input.slug } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
            },
          });
          await audit(tx, actor.id, 'series.update', 'Series', id, input);
        });
        return await load(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'SLUG_TAKEN');
        throw err;
      }
    },

    /** The episodes stay, without a series or part; the stored cover goes by a job. */
    async remove(actor: User, id: string) {
      await db.$transaction(async (tx) => {
        const found = await tx.series.findUnique({ where: { id } });
        if (!found) throw new AppError(404, 'NOT_FOUND');
        // The foreign key only clears seriesId; the part must go with it.
        await tx.episode.updateMany({
          where: { seriesId: id },
          data: { seriesId: null, seriesPart: null },
        });
        await tx.series.delete({ where: { id } });
        if (found.coverPath) {
          await enqueueStorageDelete(tx, [found.coverPath, thumbPathOf(found.coverPath)]);
        }
        await audit(tx, actor.id, 'series.delete', 'Series', id, { slug: found.slug });
      });
    },

    /** `episodeIds` must be exactly the series' episodes, in the new order: parts become 1..n. */
    async reorder(actor: User, id: string, episodeIds: string[]) {
      await db.$transaction(async (tx) => {
        if (!(await tx.series.findUnique({ where: { id }, select: { id: true } }))) {
          throw new AppError(404, 'NOT_FOUND');
        }
        const items = await tx.episode.findMany({ where: { seriesId: id }, select: { id: true } });
        const same =
          episodeIds.length === items.length &&
          new Set(episodeIds).size === episodeIds.length &&
          items.every((e) => episodeIds.includes(e.id));
        if (!same) throw new AppError(400, 'VALIDATION_ERROR');
        // Free every part first so the (series, part) unique key never clashes mid-way.
        await tx.episode.updateMany({ where: { seriesId: id }, data: { seriesPart: null } });
        for (const [index, episodeId] of episodeIds.entries()) {
          await tx.episode.update({ where: { id: episodeId }, data: { seriesPart: index + 1 } });
        }
        await audit(tx, actor.id, 'series.reorder', 'Series', id, { episodeIds });
      });
      return load(id);
    },

    /** Resizes to the two covers (fast, local), then a job stores them and points the series at them. */
    async setCover(actor: User, id: string, image: Buffer) {
      await load(id);
      const coverId = randomUUID();
      await processCover(image, dirs, coverId);
      await db.$transaction(async (tx) => {
        await enqueueSeriesCoverUpload(tx, id, coverId);
        await audit(tx, actor.id, 'series.cover', 'Series', id, { coverId });
      });
      return load(id);
    },
  };
}

export type SeriesService = ReturnType<typeof createSeriesService>;
