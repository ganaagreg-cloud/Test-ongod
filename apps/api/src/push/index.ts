import { z } from 'zod';
import type { Db } from '../db';
import type { Env } from '../env';
import { mn } from '../i18n/mn';
import { enqueue, type EnqueueOptions, type JobWriter } from '../jobs/queue';
import { defineJob } from '../jobs/registry';

/** One push message to one Expo push token. */
export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface PushSender {
  /** Returns the tokens the push service says are dead (the app was uninstalled, etc.). */
  send(messages: PushMessage[]): Promise<{ deadTokens: string[] }>;
}

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request ([[R-expo-push-api]]). */
const EXPO_BATCH = 100;
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

const expoTicketsSchema = z.object({
  data: z.array(
    z.object({
      status: z.enum(['ok', 'error']),
      message: z.string().optional(),
      details: z.object({ error: z.string().optional() }).optional(),
    }),
  ),
});

/** Sends through the Expo push service. Throws on HTTP errors so the job is retried. */
export function createExpoPushSender(
  env: Pick<Env, 'EXPO_ACCESS_TOKEN'>,
  fetchFn: typeof fetch = fetch,
): PushSender {
  return {
    async send(messages) {
      const deadTokens: string[] = [];
      for (let i = 0; i < messages.length; i += EXPO_BATCH) {
        const batch = messages.slice(i, i + EXPO_BATCH);
        const res = await fetchFn(EXPO_SEND_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          body: JSON.stringify(batch),
        });
        if (!res.ok) throw new Error(`Expo push failed: HTTP ${res.status}`);
        const tickets = expoTicketsSchema.parse(await res.json()).data;
        tickets.forEach((t, idx) => {
          if (t.status === 'error' && t.details?.error === 'DeviceNotRegistered') {
            deadTokens.push(batch[idx]!.to);
          }
        });
      }
      return { deadTokens };
    },
  };
}

const pushPayloadSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.record(z.string(), z.unknown()).optional(),
});

const pushJobSpec = { type: 'push.send', schema: pushPayloadSchema, maxAttempts: 5 };

/** The push job: sends to every device of the user that has a push token. Pushes never run in a request. */
export function createPushJob(db: Db, sender: PushSender) {
  return defineJob({
    ...pushJobSpec,
    async handle({ userId, title, body, data }, { log }) {
      const devices = await db.device.findMany({
        where: { userId, pushToken: { not: null } },
        select: { pushToken: true },
      });
      const tokens = devices.map((d) => d.pushToken!).filter((t) => EXPO_TOKEN.test(t));
      if (tokens.length === 0) return;

      const { deadTokens } = await sender.send(tokens.map((to) => ({ to, title, body, data })));
      if (deadTokens.length > 0) {
        await db.device.updateMany({
          where: { pushToken: { in: deadTokens } },
          data: { pushToken: null },
        });
      }
      log.info({ sent: tokens.length, dead: deadTokens.length }, 'push sent');
    },
  });
}

const newEpisodePayloadSchema = z.object({ episodeId: z.string().min(1) });
const newEpisodeJobSpec = {
  type: 'push.new-episode',
  schema: newEpisodePayloadSchema,
  maxAttempts: 5,
};
const NEW_EPISODE_PAGE = 500;

/**
 * SPEC G: "Push to all active users on publish". One job per published episode (queued in the
 * same transaction as the status change, so it exists exactly once). It pages through the devices
 * of users whose access is active and sends in batches; it never runs inside a request. A crash
 * mid-way repeats the push for the pages already sent (at-least-once, ADR-0010).
 */
export function createNewEpisodePushJob(db: Db, sender: PushSender) {
  return defineJob({
    ...newEpisodeJobSpec,
    async handle({ episodeId }, { log }) {
      const episode = await db.episode.findUnique({
        where: { id: episodeId },
        select: { title: true, status: true },
      });
      // Archived or deleted since: nothing to announce.
      if (!episode || episode.status !== 'PUBLISHED') return;

      const now = new Date();
      let cursor: string | undefined;
      let sent = 0;
      for (;;) {
        const devices = await db.device.findMany({
          where: {
            pushToken: { not: null },
            user: { status: 'ACTIVE', accessUntil: { gt: now } },
          },
          select: { id: true, pushToken: true },
          orderBy: { id: 'asc' },
          take: NEW_EPISODE_PAGE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        if (devices.length === 0) break;
        cursor = devices[devices.length - 1]!.id;
        const tokens = devices.map((d) => d.pushToken!).filter((t) => EXPO_TOKEN.test(t));
        if (tokens.length > 0) {
          const { deadTokens } = await sender.send(
            tokens.map((to) => ({
              to,
              title: mn.push.newEpisode.title,
              body: mn.push.newEpisode.body({ title: episode.title }),
              data: { type: 'new-episode', episodeId },
            })),
          );
          if (deadTokens.length > 0) {
            await db.device.updateMany({
              where: { pushToken: { in: deadTokens } },
              data: { pushToken: null },
            });
          }
          sent += tokens.length;
        }
        if (devices.length < NEW_EPISODE_PAGE) break;
      }
      log.info({ episodeId, sent }, 'new episode push sent');
    },
  });
}

/** Queues the "new episode" push. Call it in the transaction that publishes the episode. */
export function enqueueNewEpisodePush(db: JobWriter, episodeId: string, opts?: EnqueueOptions) {
  return enqueue(db, newEpisodeJobSpec, { episodeId }, opts);
}

/** Queues a push to one user. Pass a transaction client to send only if the change commits. */
export function enqueuePush(
  db: JobWriter,
  payload: z.input<typeof pushPayloadSchema>,
  opts?: EnqueueOptions,
) {
  return enqueue(db, pushJobSpec, payload, opts);
}
