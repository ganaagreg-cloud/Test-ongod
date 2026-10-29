import { lockUser } from '../auth/service';
import {
  COMMENT_AUTO_HIDE_REPORTS,
  type AdminCommentDto,
  type CommentDto,
  type CommentReportReason,
  type CommentsPage,
  type ListAdminCommentsQuery,
} from '@ongod/shared';
import { audit } from '../admin/audit';
import { tokens } from '../admin/queries';
import { publishedWhere } from '../catalog/service';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { Comment, Episode, User } from '../generated/prisma/client';
import { mn } from '../i18n/mn';
import { escapeLike } from '../lib/like';
import { isRejected } from './filter';

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const PER_MINUTE = 5;
const PER_DAY = 40;

type Author = Pick<User, 'id' | 'firstName' | 'lastName' | 'status'>;

/** "Бат Э.": never the username (it can be the email) or any contact detail. */
export const displayName = (u: Author): string =>
  u.status === 'DELETED'
    ? mn.comments.deletedUser
    : `${u.firstName} ${[...u.lastName.trim()][0] ?? ''}.`.trim();

/** Comments on episodes (SPEC L, ADR-0061): read, post, edit, delete, report, block and the admin side. */
export function createCommentService(deps: {
  db: Db;
  bannedWords: readonly string[];
  now?: (() => Date) | undefined;
}) {
  const { db, bannedWords } = deps;
  const now = deps.now ?? (() => new Date());

  const toDto = (c: Comment & { author: Author }, viewerId: string): CommentDto => ({
    id: c.id,
    authorName: displayName(c.author),
    authorId: c.authorId,
    body: c.body,
    mine: c.authorId === viewerId,
    edited: c.editedAt !== null,
    createdAt: c.createdAt.toISOString(),
  });

  /** Posting needs what playing needs (active access, or a free episode) and not being muted. */
  const canPost = (user: User, episode: Pick<Episode, 'isFree'>, at: Date) =>
    user.commentMutedAt === null &&
    ((user.accessUntil !== null && user.accessUntil.getTime() > at.getTime()) || episode.isFree);

  const publishedEpisode = async (episodeId: string, at: Date) => {
    const ep = await db.episode.findFirst({
      where: { AND: [publishedWhere(at), { id: episodeId }] },
      select: { id: true, isFree: true },
    });
    if (!ep) throw new AppError(404, 'NOT_FOUND');
    return ep;
  };

  const checkBody = (body: string) => {
    if (isRejected(body, bannedWords)) throw new AppError(422, 'COMMENT_REJECTED');
  };

  return {
    /** Newest first, without hidden or deleted comments and without authors the viewer blocked. */
    async list(
      user: User,
      episodeId: string,
      query: { cursor?: string | undefined; limit: number },
    ): Promise<CommentsPage> {
      const at = now();
      const episode = await publishedEpisode(episodeId, at);
      const blocked = await db.commentBlock.findMany({
        where: { blockerId: user.id },
        select: { blockedId: true },
      });
      const rows = await db.comment.findMany({
        where: {
          episodeId,
          status: 'VISIBLE',
          ...(blocked.length > 0 ? { authorId: { notIn: blocked.map((b) => b.blockedId) } } : {}),
        },
        include: { author: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const page = rows.slice(0, query.limit);
      return {
        items: page.map((c) => toDto(c, user.id)),
        nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
        canComment: canPost(user, episode, at),
      };
    },

    async create(user: User, episodeId: string, body: string): Promise<CommentDto> {
      const at = now();
      const episode = await publishedEpisode(episodeId, at);
      if (!canPost(user, episode, at)) throw new AppError(403, 'COMMENT_FORBIDDEN');
      checkBody(body);
      // Count and insert under the user's row lock, so parallel posts cannot slip past the limits
      // together (audit F05).
      const created = await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        const [lastMinute, lastDay] = await Promise.all([
          tx.comment.count({
            where: { authorId: user.id, createdAt: { gt: new Date(at.getTime() - MINUTE_MS) } },
          }),
          tx.comment.count({
            where: { authorId: user.id, createdAt: { gt: new Date(at.getTime() - DAY_MS) } },
          }),
        ]);
        if (lastMinute >= PER_MINUTE || lastDay >= PER_DAY) {
          throw new AppError(429, 'RATE_LIMITED');
        }
        return tx.comment.create({
          data: { episodeId, authorId: user.id, body, createdAt: at },
          include: { author: true },
        });
      });
      return toDto(created, user.id);
    },

    /** Own, visible comments only. The status precondition keeps an admin's hide from being undone. */
    async update(user: User, id: string, body: string): Promise<CommentDto> {
      if (user.commentMutedAt !== null) throw new AppError(403, 'COMMENT_FORBIDDEN');
      checkBody(body);
      const { count } = await db.comment.updateMany({
        where: { id, authorId: user.id, status: 'VISIBLE' },
        data: { body, editedAt: now() },
      });
      if (count !== 1) throw new AppError(404, 'NOT_FOUND');
      return toDto(
        await db.comment.findUniqueOrThrow({ where: { id }, include: { author: true } }),
        user.id,
      );
    },

    /** Own comments, visible or hidden; deleting again is fine. */
    async remove(user: User, id: string): Promise<void> {
      const own = await db.comment.findFirst({
        where: { id, authorId: user.id },
        select: { status: true },
      });
      if (!own) throw new AppError(404, 'NOT_FOUND');
      await db.comment.updateMany({
        where: { id, authorId: user.id, status: { in: ['VISIBLE', 'HIDDEN'] } },
        data: { status: 'DELETED' },
      });
    },

    /**
     * One report per user and comment (repeating it changes nothing). The third distinct report
     * hides a visible comment until an admin looks (Apple: timely action on reports).
     */
    async report(user: User, id: string, reason: CommentReportReason): Promise<void> {
      await db.$transaction(async (tx) => {
        const comment = await tx.comment.findUnique({ where: { id } });
        if (!comment || comment.status !== 'VISIBLE') throw new AppError(404, 'NOT_FOUND');
        if (comment.authorId === user.id) throw new AppError(403, 'COMMENT_FORBIDDEN');
        await tx.commentReport.upsert({
          where: { commentId_reporterId: { commentId: id, reporterId: user.id } },
          create: { commentId: id, reporterId: user.id, reason },
          update: {},
        });
        const reports = await tx.commentReport.count({ where: { commentId: id } });
        if (reports >= COMMENT_AUTO_HIDE_REPORTS) {
          await tx.comment.updateMany({
            where: { id, status: 'VISIBLE' },
            data: { status: 'HIDDEN', hiddenBy: 'reports' },
          });
        }
      });
    },

    /** Blocks the author of a comment: their comments vanish from this user's lists. */
    async blockAuthorOf(user: User, commentId: string): Promise<void> {
      const comment = await db.comment.findUnique({
        where: { id: commentId },
        select: { authorId: true },
      });
      if (!comment) throw new AppError(404, 'NOT_FOUND');
      if (comment.authorId === user.id) throw new AppError(403, 'COMMENT_FORBIDDEN');
      await db.commentBlock.upsert({
        where: { blockerId_blockedId: { blockerId: user.id, blockedId: comment.authorId } },
        create: { blockerId: user.id, blockedId: comment.authorId },
        update: {},
      });
    },

    async blocks(user: User) {
      const rows = await db.commentBlock.findMany({
        where: { blockerId: user.id },
        include: { blocked: true },
        orderBy: { createdAt: 'desc' },
      });
      return rows.map((b) => ({ id: b.blockedId, name: displayName(b.blocked) }));
    },

    async unblock(user: User, blockedId: string): Promise<void> {
      await db.commentBlock.deleteMany({ where: { blockerId: user.id, blockedId } });
    },

    // ---- admin ----

    async adminList(query: ListAdminCommentsQuery) {
      const byFilter: Prisma.CommentWhereInput =
        query.filter === 'REPORTED'
          ? // Reported and still visible, or hidden by the reports themselves (it needs a look:
            // restore or keep hidden). Hidden by an admin is done (audit F06).
            {
              reports: { some: {} },
              OR: [{ status: 'VISIBLE' }, { status: 'HIDDEN', hiddenBy: 'reports' }],
            }
          : { status: query.filter };
      const where: Prisma.CommentWhereInput = {
        ...byFilter,
        AND: tokens(query.q).map((t) => {
          const c = { contains: escapeLike(t) };
          return {
            OR: [
              { body: c },
              { episode: { title: c } },
              { author: { OR: [{ username: c }, { firstName: c }, { lastName: c }] } },
            ],
          };
        }),
      };
      const [rows, total] = await Promise.all([
        db.comment.findMany({
          where,
          include: { author: true, episode: { select: { id: true, title: true } }, reports: true },
          orderBy:
            query.filter === 'REPORTED'
              ? [{ reports: { _count: 'desc' } }, { createdAt: 'desc' }]
              : [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.comment.count({ where }),
      ]);
      const items: AdminCommentDto[] = rows.map((c) => ({
        id: c.id,
        body: c.body,
        status: c.status,
        episode: c.episode,
        author: {
          id: c.author.id,
          username: c.author.username,
          name: `${c.author.lastName} ${c.author.firstName}`.trim(),
          muted: c.author.commentMutedAt !== null,
        },
        reportCount: c.reports.length,
        reasons: [...new Set(c.reports.map((r) => r.reason))],
        hiddenBy: c.hiddenBy,
        edited: c.editedAt !== null,
        createdAt: c.createdAt.toISOString(),
      }));
      return { items, total, page: query.page, limit: query.limit };
    },

    /**
     * hide: VISIBLE (or HIDDEN by reports, "keep hidden") -> HIDDEN by the admin. restore: HIDDEN -> VISIBLE (its reports are cleared, so the next
     * report counts from zero). dismiss: reports on a VISIBLE comment are cleared. delete: VISIBLE
     * or HIDDEN -> DELETED. Each is one transaction with a status precondition and an audit row.
     */
    async adminAct(
      actor: User,
      id: string,
      action: 'hide' | 'restore' | 'dismiss' | 'delete',
    ): Promise<void> {
      await db.$transaction(async (tx) => {
        const found = await tx.comment.findUnique({ where: { id } });
        if (!found) throw new AppError(404, 'NOT_FOUND');
        let changed: number;
        if (action === 'hide') {
          changed =
            // Also "keep hidden" for a comment the reports hid: it then leaves the reported queue.
            (
              await tx.comment.updateMany({
                where: {
                  id,
                  OR: [{ status: 'VISIBLE' }, { status: 'HIDDEN', hiddenBy: 'reports' }],
                },
                data: { status: 'HIDDEN', hiddenBy: 'admin' },
              })
            ).count;
        } else if (action === 'restore') {
          changed = (
            await tx.comment.updateMany({
              where: { id, status: 'HIDDEN' },
              data: { status: 'VISIBLE', hiddenBy: null },
            })
          ).count;
          if (changed === 1) await tx.commentReport.deleteMany({ where: { commentId: id } });
        } else if (action === 'dismiss') {
          changed = (await tx.comment.count({ where: { id, status: 'VISIBLE' } })) === 1 ? 1 : 0;
          if (changed === 1) await tx.commentReport.deleteMany({ where: { commentId: id } });
        } else {
          changed = (
            await tx.comment.updateMany({
              where: { id, status: { in: ['VISIBLE', 'HIDDEN'] } },
              data: { status: 'DELETED' },
            })
          ).count;
        }
        if (changed !== 1) throw new AppError(409, 'COMMENT_STATE');
        await audit(tx, actor.id, `comment.${action}`, 'Comment', id, {
          authorId: found.authorId,
          episodeId: found.episodeId,
          from: found.status,
        });
      });
    },

    /** An admin stops a user from posting (SPEC L); not for admins and owners. */
    async adminMute(actor: User, userId: string, muted: boolean): Promise<boolean> {
      await db.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id: userId } });
        if (!target) throw new AppError(404, 'NOT_FOUND');
        if (target.role !== 'USER') throw new AppError(403, 'FORBIDDEN');
        const wasMuted = target.commentMutedAt !== null;
        if (wasMuted === muted) return;
        await tx.user.update({
          where: { id: userId },
          data: { commentMutedAt: muted ? now() : null },
        });
        await audit(
          tx,
          actor.id,
          muted ? 'user.comment_mute' : 'user.comment_unmute',
          'User',
          userId,
          {},
        );
      });
      return muted;
    },
  };
}

export type CommentService = ReturnType<typeof createCommentService>;
