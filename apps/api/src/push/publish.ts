import type { JobWriter } from '../jobs/queue';
import { mn } from '../i18n/mn';
import { enqueuePush } from './index';

export interface PublishedEpisode {
  id: string;
  title: string;
  pushText: string | null;
  notifyOnPublish: boolean;
}

/**
 * Who hears about a new episode: members with active access (ADR-0042) who are signed in on at
 * least one device. The one place that decides the audience, so widening it (free content,
 * phase 2) is a change here only.
 */
export async function publishAudience(db: JobWriter, now: Date): Promise<string[]> {
  const users = await db.user.findMany({
    where: {
      status: 'ACTIVE',
      accessUntil: { gt: now },
      sessions: { some: { revokedAt: null, expiresAt: { gt: now } } },
    },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  return users.map((u) => u.id);
}

/**
 * Queues the "new episode" push for the episodes published together (one push per member: the
 * episode's own text for one, a count for several). Call it inside the transaction that
 * published them. Returns how many users were queued.
 */
export async function enqueuePublishPush(
  db: JobWriter,
  episodes: PublishedEpisode[],
  now: Date,
): Promise<number> {
  const notify = episodes.filter((e) => e.notifyOnPublish);
  const [first] = notify;
  if (!first) return 0;

  const message =
    notify.length === 1
      ? {
          title: mn.push.newEpisode.title,
          body: first.pushText ?? first.title,
          data: { episodeId: first.id },
        }
      : {
          title: mn.push.newEpisode.title,
          body: mn.push.newEpisodes.body(notify.length),
          data: {},
        };

  const userIds = await publishAudience(db, now);
  for (const userId of userIds) await enqueuePush(db, { userId, ...message });
  return userIds.length;
}
