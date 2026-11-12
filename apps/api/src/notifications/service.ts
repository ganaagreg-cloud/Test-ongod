import {
  NOTIFICATIONS_PAGE,
  type NotificationDto,
  type NotificationsResponse,
} from '@ongod/shared';
import type { Db } from '../db';

/** The id of the episode a stored notification is about (its push data), else null. */
const episodeIdOf = (data: unknown): string | null => {
  const id = (data as { episodeId?: unknown } | null)?.episodeId;
  return typeof id === 'string' ? id : null;
};

/** The bell on Нүүр (ADR-0099): a member's own notifications, newest first, and "read". */
export function createNotificationService(deps: { db: Db }) {
  const { db } = deps;
  return {
    async list(userId: string): Promise<NotificationsResponse> {
      const [rows, unread] = await Promise.all([
        db.notification.findMany({
          where: { userId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: NOTIFICATIONS_PAGE,
        }),
        db.notification.count({ where: { userId, readAt: null } }),
      ]);
      const items: NotificationDto[] = rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        episodeId: episodeIdOf(n.data),
        createdAt: n.createdAt.toISOString(),
        read: n.readAt !== null,
      }));
      return { items, unread };
    },

    /** Marks all of the member's unread notifications read; running it twice changes nothing. */
    async markAllRead(userId: string, now = new Date()): Promise<void> {
      await db.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: now },
      });
    },
  };
}

export type NotificationService = ReturnType<typeof createNotificationService>;
