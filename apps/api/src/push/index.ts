import { z } from 'zod';
import type { Db } from '../db';
import type { Env } from '../env';
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
  /**
   * Returns the tokens the push service says are dead (the app was uninstalled, etc.) and the
   * ones whose message it refused for another reason (rate limit, etc.), which are tried again.
   */
  send(messages: PushMessage[]): Promise<{ deadTokens: string[]; failedTokens?: string[] }>;
}

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request ([[R-expo-push-api]]). */
const EXPO_BATCH = 100;
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;
/** A refused message is tried again this many times, 1, 2, then 4 minutes later. */
const PUSH_RETRY_ROUNDS = 3;
const PUSH_RETRY_BASE_MS = 60_000;

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
      const failedTokens: string[] = [];
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
          if (t.status !== 'error') return;
          const to = batch[idx]!.to;
          if (t.details?.error === 'DeviceNotRegistered') deadTokens.push(to);
          else failedTokens.push(to);
        });
      }
      return { deadTokens, failedTokens };
    },
  };
}

const pushPayloadSchema = z.object({
  userId: z.string().min(1),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.record(z.string(), z.unknown()).optional(),
  /** A retry: only these devices of the user (the ones whose message was refused). */
  tokens: z.array(z.string().min(1)).min(1).max(100).optional(),
  round: z.number().int().min(0).max(PUSH_RETRY_ROUNDS).default(0),
});

const pushJobSpec = { type: 'push.send', schema: pushPayloadSchema, maxAttempts: 5 };

/** The push job: sends to every device of the user that has a push token. Pushes never run in a request. */
export function createPushJob(db: Db, sender: PushSender) {
  return defineJob({
    ...pushJobSpec,
    async handle({ userId, title, body, data, tokens: only, round }, { log }) {
      const devices = await db.device.findMany({
        where: { userId, pushToken: only ? { in: only } : { not: null } },
        select: { pushToken: true },
      });
      const tokens = devices.map((d) => d.pushToken!).filter((t) => EXPO_TOKEN.test(t));
      if (tokens.length === 0) return;

      const { deadTokens, failedTokens = [] } = await sender.send(
        tokens.map((to) => ({ to, title, body, data })),
      );
      if (deadTokens.length > 0) {
        await db.device.updateMany({
          where: { pushToken: { in: deadTokens } },
          data: { pushToken: null },
        });
      }
      // Refused tickets (a rate limit, etc.) are not an HTTP error, so the job would end DONE: the
      // refused devices get their own later job. Not the whole job again: the others already have it.
      if (failedTokens.length > 0 && round < PUSH_RETRY_ROUNDS) {
        await enqueue(
          db,
          pushJobSpec,
          { userId, title, body, data, tokens: failedTokens, round: round + 1 },
          { runAt: new Date(Date.now() + PUSH_RETRY_BASE_MS * 2 ** round) },
        );
      } else if (failedTokens.length > 0) {
        log.warn({ failed: failedTokens.length }, 'push refused, out of retries');
      }
      log.info(
        { sent: tokens.length, dead: deadTokens.length, failed: failedTokens.length, round },
        'push sent',
      );
    },
  });
}

/** Queues a push to one user. Pass a transaction client to send only if the change commits. */
export function enqueuePush(
  db: JobWriter,
  payload: z.input<typeof pushPayloadSchema>,
  opts?: EnqueueOptions,
) {
  return enqueue(db, pushJobSpec, payload, opts);
}
