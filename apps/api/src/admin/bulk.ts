import type { BulkAction } from '@ongod/shared';
import { isUniqueViolation } from '../auth/service';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { audit } from './audit';
import { missingOf, type ContentService } from './content';
import { FEATURED_PLAYLIST_ID, type PlaylistService } from './playlists';

const OPEN_STATES = ['DRAFT', 'SCHEDULED'];

/**
 * Bulk actions on episodes (max 100 ids). Everything is checked first; then every change runs in
 * one transaction with the same status preconditions as the single actions, so a request either
 * changes all of its episodes or none (nothing is half done, no audit rows on failure).
 */
export function createBulkService(deps: {
  db: Db;
  content: ContentService;
  playlists: PlaylistService;
  now?: (() => Date) | undefined;
}) {
  const { db, content, playlists } = deps;
  const now = deps.now ?? (() => new Date());

  const failOn = (status: number, code: string, ids?: string[]): never => {
    throw new AppError(status, code, undefined, ids ? { ids } : undefined);
  };

  async function run(actor: User, requested: string[], action: BulkAction) {
    const ids = [...new Set(requested)];
    const rows = await db.episode.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        status: true,
        coverPath: true,
        mediaAssets: { orderBy: { id: 'desc' }, take: 1, select: { status: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const unknown = ids.filter((id) => !byId.has(id));
    if (unknown.length > 0) failOn(404, 'NOT_FOUND', unknown);
    const of = (id: string) => byId.get(id)!;

    switch (action.type) {
      case 'setCategory':
        if (!(await db.category.findUnique({ where: { id: action.categoryId } }))) failOn(404, 'NOT_FOUND');
        break;
      case 'addTag':
      case 'removeTag':
        if (!(await db.tag.findUnique({ where: { id: action.tagId } }))) failOn(404, 'NOT_FOUND');
        break;
      case 'addToPlaylist':
        if (action.playlistId === FEATURED_PLAYLIST_ID) await playlists.ensureFeatured();
        if (!(await db.playlist.findUnique({ where: { id: action.playlistId } }))) {
          failOn(404, 'NOT_FOUND');
        }
        break;
      case 'publish': {
        const notReady = ids.filter((id) => missingOf(of(id).coverPath, of(id).mediaAssets[0]).length > 0);
        if (notReady.length > 0) failOn(409, 'NOT_READY_TO_PUBLISH', notReady);
        const closed = ids.filter((id) => !OPEN_STATES.includes(of(id).status));
        if (closed.length > 0) failOn(409, 'EPISODE_STATE', closed);
        break;
      }
      case 'archive': {
        const notLive = ids.filter((id) => of(id).status !== 'PUBLISHED');
        if (notLive.length > 0) failOn(409, 'EPISODE_STATE', notLive);
        break;
      }
    }

    const at = now();
    try {
      await runWrites(actor, ids, action, at);
    } catch (err) {
      // A playlist-position clash that slipped past the row lock: retryable, never a 500.
      if (isUniqueViolation(err)) throw new AppError(409, 'PLAYLIST_CONFLICT');
      throw err;
    }
    return { updated: ids.length };
  }

  async function runWrites(actor: User, ids: string[], action: BulkAction, at: Date) {
    await db.$transaction(async (tx) => {
      // addToPlaylist: the playlist's row lock must be the first statement of the transaction.
      if (action.type === 'addToPlaylist') {
        await playlists.addItemsTx(tx, actor, action.playlistId, ids);
        return;
      }
      for (const id of ids) {
        switch (action.type) {
          case 'setCategory': {
            const done = await tx.episode.updateMany({
              where: { id },
              data: { categoryId: action.categoryId },
            });
            if (done.count !== 1) throw new AppError(404, 'NOT_FOUND');
            await audit(tx, actor.id, 'episode.update', 'Episode', id, {
              categoryId: action.categoryId,
            });
            break;
          }
          case 'addTag':
            await tx.episodeTag.createMany({
              data: [{ episodeId: id, tagId: action.tagId }],
              skipDuplicates: true,
            });
            await audit(tx, actor.id, 'episode.tag-add', 'Episode', id, { tagId: action.tagId });
            break;
          case 'removeTag':
            await tx.episodeTag.deleteMany({ where: { episodeId: id, tagId: action.tagId } });
            await audit(tx, actor.id, 'episode.tag-remove', 'Episode', id, { tagId: action.tagId });
            break;
          case 'publish':
            await content.tx.publish(tx, actor, id, at);
            break;
          case 'archive':
            await content.tx.transition(tx, actor, id, 'PUBLISHED', 'ARCHIVED', 'episode.archive');
            break;
        }
      }
    });
  }

  return { run };
}

export type BulkService = ReturnType<typeof createBulkService>;
