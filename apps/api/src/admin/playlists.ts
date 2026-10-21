import { randomUUID } from 'node:crypto';
import type {
  AdminPlaylistDetailDto,
  AdminPlaylistDto,
  CreatePlaylistRequest,
  UpdatePlaylistRequest,
} from '@ongod/shared';
import { isUniqueViolation } from '../auth/service';
import { thumbPathOf, type MediaUrls } from '../catalog/media';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { processCover } from '../media/cover';
import { enqueuePlaylistCoverUpload, enqueueStorageDelete } from '../media/jobs';
import type { UploadDirs } from '../media/storage';
import { audit } from './audit';

/** The built-in playlist (ADR-0042): always there, always first, cannot be deleted or renamed. */
export const FEATURED_PLAYLIST_ID = 'featured';
const FEATURED_TITLE = 'Онцлох';
/** Reserved: Онцлох owns this slug. */
const FEATURED_SLUG = 'featured';

type Tx = Parameters<Parameters<Db['$transaction']>[0]>[0];

/** Admin playlists (ADR-0042): hand-picked, ordered episodes; optionally a row on the home page. */
export function createPlaylistService(deps: {
  db: Db;
  media: MediaUrls;
  dirs: UploadDirs;
  now?: (() => Date) | undefined;
}) {
  const { db, media, dirs } = deps;
  const now = deps.now ?? (() => new Date());

  const dto = (p: {
    id: string;
    title: string;
    slug: string;
    description: string;
    coverPath: string | null;
    showOnHome: boolean;
    homeOrder: number;
    isFeatured: boolean;
    _count: { items: number };
  }): AdminPlaylistDto => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    description: p.description,
    coverUrl: p.coverPath ? media.cover(p.coverPath, now()).coverUrl : null,
    showOnHome: p.showOnHome,
    homeOrder: p.homeOrder,
    isFeatured: p.isFeatured,
    episodeCount: p._count.items,
  });

  /** Creates Онцлох on first use, so production needs no seed. */
  const ensureFeatured = async () => {
    try {
      await db.playlist.upsert({
        where: { id: FEATURED_PLAYLIST_ID },
        update: {},
        create: {
          id: FEATURED_PLAYLIST_ID,
          title: FEATURED_TITLE,
          slug: FEATURED_SLUG,
          isFeatured: true,
        },
      });
    } catch (err) {
      // A parallel first call created it between our check and insert.
      if (!isUniqueViolation(err)) throw err;
    }
    // Never silent: if it is still missing, the clash was not the id race.
    const found = await db.playlist.findUnique({
      where: { id: FEATURED_PLAYLIST_ID },
      select: { id: true },
    });
    if (!found) throw new Error('The featured playlist could not be created');
  };

  const load = async (id: string): Promise<AdminPlaylistDetailDto> => {
    const row = await db.playlist.findUnique({
      where: { id },
      include: {
        _count: { select: { items: true } },
        items: {
          orderBy: [{ position: 'asc' }, { episodeId: 'asc' }],
          include: { episode: { select: { id: true, title: true, status: true } } },
        },
      },
    });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return {
      ...dto(row),
      episodes: row.items.map((i) => ({
        id: i.episode.id,
        title: i.episode.title,
        status: i.episode.status,
        position: i.position,
      })),
    };
  };

  const list = async () => {
    await ensureFeatured();
    const rows = await db.playlist.findMany({
      orderBy: [{ homeOrder: 'asc' }, { title: 'asc' }, { id: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
    // Онцлох first, whatever its homeOrder.
    return [
      ...rows.filter((r) => r.id === FEATURED_PLAYLIST_ID),
      ...rows.filter((r) => r.id !== FEATURED_PLAYLIST_ID),
    ].map(dto);
  };

  const get = async (id: string) => {
    if (id === FEATURED_PLAYLIST_ID) await ensureFeatured();
    return load(id);
  };

  /**
   * Row lock on the playlist (a no-op write): concurrent item changes wait their turn. It must be
   * the transaction's first statement: a read before it would pin a snapshot from before the
   * previous holder committed (REPEATABLE READ), and the item reads after it would be stale.
   */
  const lock = async (tx: Tx, id: string) => {
    const { count } = await tx.playlist.updateMany({
      where: { id },
      data: { homeOrder: { increment: 0 } },
    });
    if (count === 0) throw new AppError(404, 'NOT_FOUND');
  };

  /** A clash that slipped past the lock is a retryable 409, never a 500. */
  const conflictOnUnique = (err: unknown): never => {
    if (isUniqueViolation(err)) throw new AppError(409, 'PLAYLIST_CONFLICT');
    throw err;
  };

  return {
    ensureFeatured,
    list,
    get,

    async create(actor: User, input: CreatePlaylistRequest) {
      if (input.slug === FEATURED_SLUG) throw new AppError(409, 'PLAYLIST_SLUG_TAKEN');
      try {
        const id = await db.$transaction(async (tx) => {
          const playlist = await tx.playlist.create({
            data: {
              title: input.title,
              slug: input.slug,
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.showOnHome !== undefined ? { showOnHome: input.showOnHome } : {}),
            },
          });
          await audit(tx, actor.id, 'playlist.create', 'Playlist', playlist.id, {
            title: input.title,
            slug: input.slug,
          });
          return playlist.id;
        });
        return await load(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'PLAYLIST_SLUG_TAKEN');
        throw err;
      }
    },

    async update(actor: User, id: string, input: UpdatePlaylistRequest) {
      if (id === FEATURED_PLAYLIST_ID) {
        await ensureFeatured();
        if (input.title !== undefined || input.slug !== undefined) {
          throw new AppError(409, 'PLAYLIST_FEATURED');
        }
      }
      if (input.slug === FEATURED_SLUG) throw new AppError(409, 'PLAYLIST_SLUG_TAKEN');
      try {
        await db.$transaction(async (tx) => {
          if (!(await tx.playlist.findUnique({ where: { id }, select: { id: true } }))) {
            throw new AppError(404, 'NOT_FOUND');
          }
          await tx.playlist.update({
            where: { id },
            data: {
              ...(input.title !== undefined ? { title: input.title } : {}),
              ...(input.slug !== undefined ? { slug: input.slug } : {}),
              ...(input.description !== undefined ? { description: input.description } : {}),
              ...(input.showOnHome !== undefined ? { showOnHome: input.showOnHome } : {}),
            },
          });
          await audit(tx, actor.id, 'playlist.update', 'Playlist', id, input);
        });
        return await load(id);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'PLAYLIST_SLUG_TAKEN');
        throw err;
      }
    },

    /** The episodes stay (only the items go with the playlist); the stored cover goes by a job. */
    async remove(actor: User, id: string) {
      if (id === FEATURED_PLAYLIST_ID) throw new AppError(409, 'PLAYLIST_FEATURED');
      await db.$transaction(async (tx) => {
        const found = await tx.playlist.findUnique({ where: { id } });
        if (!found) throw new AppError(404, 'NOT_FOUND');
        if (found.isFeatured) throw new AppError(409, 'PLAYLIST_FEATURED');
        await tx.playlist.delete({ where: { id } });
        if (found.coverPath) {
          await enqueueStorageDelete(tx, [found.coverPath, thumbPathOf(found.coverPath)]);
        }
        await audit(tx, actor.id, 'playlist.delete', 'Playlist', id, { slug: found.slug });
      });
    },

    /**
     * Appends in the given order after the current last; episodes already in are skipped. Runs
     * inside the caller's transaction (bulk actions); the row lock is its first statement, so the
     * caller must not have read anything before it. Call `ensureFeatured` first for Онцлох.
     */
    async addItemsTx(tx: Tx, actor: User, id: string, episodeIds: string[]) {
      const wanted = [...new Set(episodeIds)];
      await lock(tx, id);
      const known = await tx.episode.findMany({
        where: { id: { in: wanted } },
        select: { id: true },
      });
      if (known.length !== wanted.length) throw new AppError(404, 'NOT_FOUND');
      const current = await tx.playlistItem.findMany({
        where: { playlistId: id },
        select: { episodeId: true, position: true },
      });
      const have = new Set(current.map((i) => i.episodeId));
      let position = current.reduce((max, i) => Math.max(max, i.position), 0);
      for (const episodeId of wanted.filter((e) => !have.has(e))) {
        position += 1;
        await tx.playlistItem.create({ data: { playlistId: id, episodeId, position } });
        await audit(tx, actor.id, 'playlist.add-item', 'Playlist', id, { episodeId, position });
      }
    },

    /** Appends in the given order after the current last; episodes already in are skipped. */
    async addItems(actor: User, id: string, episodeIds: string[]) {
      if (id === FEATURED_PLAYLIST_ID) await ensureFeatured();
      try {
        await db.$transaction((tx) => this.addItemsTx(tx, actor, id, episodeIds));
      } catch (err) {
        return conflictOnUnique(err);
      }
      return load(id);
    },

    /** Removes one episode and closes the gap, so positions stay 1..n. */
    async removeItem(actor: User, id: string, episodeId: string) {
      await db.$transaction(async (tx) => {
        await lock(tx, id);
        const key = { playlistId_episodeId: { playlistId: id, episodeId } };
        const item = await tx.playlistItem.findUnique({ where: key });
        if (!item) throw new AppError(404, 'NOT_FOUND');
        await tx.playlistItem.delete({ where: key });
        await tx.playlistItem.updateMany({
          where: { playlistId: id, position: { gt: item.position } },
          data: { position: { decrement: 1 } },
        });
        await audit(tx, actor.id, 'playlist.remove-item', 'Playlist', id, { episodeId });
      });
      return load(id);
    },

    /** `episodeIds` must be exactly the playlist's episodes, in the new order. */
    async reorder(actor: User, id: string, episodeIds: string[]) {
      if (id === FEATURED_PLAYLIST_ID) await ensureFeatured();
      try {
        await db.$transaction(async (tx) => {
          await lock(tx, id);
          const items = await tx.playlistItem.findMany({
            where: { playlistId: id },
            select: { episodeId: true },
          });
          const same =
            episodeIds.length === items.length &&
            new Set(episodeIds).size === episodeIds.length &&
            items.every((i) => episodeIds.includes(i.episodeId));
          if (!same) throw new AppError(400, 'VALIDATION_ERROR');
          for (const [index, episodeId] of episodeIds.entries()) {
            await tx.playlistItem.update({
              where: { playlistId_episodeId: { playlistId: id, episodeId } },
              data: { position: index + 1 },
            });
          }
          await audit(tx, actor.id, 'playlist.reorder', 'Playlist', id, { episodeIds });
        });
      } catch (err) {
        return conflictOnUnique(err);
      }
      return load(id);
    },

    /** Sets homeOrder 1..n in the given order. Онцлох is always first, so it is not orderable. */
    async reorderHome(actor: User, playlistIds: string[]) {
      if (
        new Set(playlistIds).size !== playlistIds.length ||
        playlistIds.includes(FEATURED_PLAYLIST_ID)
      ) {
        throw new AppError(400, 'VALIDATION_ERROR');
      }
      await db.$transaction(async (tx) => {
        const known = await tx.playlist.findMany({
          where: { id: { in: playlistIds } },
          select: { id: true },
        });
        if (known.length !== playlistIds.length) throw new AppError(404, 'NOT_FOUND');
        for (const [index, id] of playlistIds.entries()) {
          await tx.playlist.update({ where: { id }, data: { homeOrder: index + 1 } });
        }
        await audit(tx, actor.id, 'playlist.home-order', 'Playlist', playlistIds[0]!, {
          playlistIds,
        });
      });
      return list();
    },

    /** Resizes to the two covers (fast, local), then a job stores them and points the playlist at them. */
    async setCover(actor: User, id: string, image: Buffer) {
      await get(id);
      const coverId = randomUUID();
      await processCover(image, dirs, coverId);
      await db.$transaction(async (tx) => {
        await enqueuePlaylistCoverUpload(tx, id, coverId);
        await audit(tx, actor.id, 'playlist.cover', 'Playlist', id, { coverId });
      });
      return load(id);
    },
  };
}

export type PlaylistService = ReturnType<typeof createPlaylistService>;
