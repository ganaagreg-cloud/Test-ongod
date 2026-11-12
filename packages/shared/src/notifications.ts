import { z } from 'zod';

// GET /v1/me/notifications (the bell on Нүүр, ADR-0099). Every push a member is sent is also kept
// here, so the list works without the system permission and shows what was missed.

/** What the list returns at most (newest first). */
export const NOTIFICATIONS_PAGE = 50;
/** Notifications are kept this long. */
export const NOTIFICATION_KEEP_DAYS = 90;

export const notificationSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  /** The episode a "new episode" notification is about; null for the others. */
  episodeId: z.string().nullable(),
  createdAt: z.iso.datetime(),
  read: z.boolean(),
});
export type NotificationDto = z.infer<typeof notificationSchema>;

export const notificationsResponseSchema = z.object({
  items: z.array(notificationSchema),
  /** Unread ones in total, for the dot on the bell. */
  unread: z.number().int().nonnegative(),
});
export type NotificationsResponse = z.infer<typeof notificationsResponseSchema>;
