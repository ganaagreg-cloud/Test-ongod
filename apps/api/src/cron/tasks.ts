import { REMINDER_DAYS_BEFORE_END } from '@ongod/shared';
import { lockUser } from '../auth/service';
import type { Db } from '../db';
import { enqueueEmail } from '../email';
import { mn } from '../i18n/mn';
import { DAY_MS, ubDate } from '../lib/dates';
import { enqueuePush } from '../push';

export interface CronTaskContext {
  db: Db;
  now: Date;
}

/**
 * A scheduled task run by POST /v1/cron/tick. Every task must be idempotent: running it
 * twice (or concurrently) must not change the outcome. Use status preconditions in `where`.
 */
export interface CronTask {
  name: string;
  run(ctx: CronTaskContext): Promise<{ affected: number }>;
}

/** SPEC D: PENDING_PAYMENT expires after 7 days. */
export const expirePendingPayments: CronTask = {
  name: 'expirePendingPayments',
  async run({ db, now }) {
    const { count } = await db.subscription.updateMany({
      where: { status: 'PENDING_PAYMENT', createdAt: { lt: new Date(now.getTime() - 7 * DAY_MS) } },
      data: { status: 'EXPIRED' },
    });
    return { affected: count };
  },
};

/** SPEC F: at the end of the period the subscription is EXPIRED (playback checks accessUntil). */
export const expireEndedSubscriptions: CronTask = {
  name: 'expireEndedSubscriptions',
  async run({ db, now }) {
    const { count } = await db.subscription.updateMany({
      where: { status: 'ACTIVE', endsAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    return { affected: count };
  },
};

const REMINDER_BATCH = 200;

/**
 * SPEC F: 14 days before access ends -> email + push, once. `Subscription.reminderSentAt` is the
 * flag: it is set in the same transaction that queues the jobs, with a precondition on it still
 * being empty, so concurrent or repeated ticks queue exactly one reminder. A period that was
 * already extended by a later ACTIVE one gets no reminder (that later period gets its own).
 */
export const sendAccessEndingReminders: CronTask = {
  name: 'sendAccessEndingReminders',
  async run({ db, now }) {
    const due = await db.subscription.findMany({
      where: {
        status: 'ACTIVE',
        reminderSentAt: null,
        endsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_DAYS_BEFORE_END * DAY_MS) },
      },
      select: { id: true, userId: true },
      orderBy: { endsAt: 'asc' },
      take: REMINDER_BATCH,
    });

    let queued = 0;
    for (const { id, userId } of due) {
      const done = await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const sub = await tx.subscription.findUnique({ where: { id }, include: { user: true } });
        if (!sub || sub.status !== 'ACTIVE' || sub.reminderSentAt || !sub.endsAt) return false;
        if (sub.user.status !== 'ACTIVE') return false;
        const renewed = await tx.subscription.count({
          where: { userId, status: 'ACTIVE', endsAt: { gt: sub.endsAt } },
        });
        if (renewed > 0) return false;

        const claimed = await tx.subscription.updateMany({
          where: { id, status: 'ACTIVE', reminderSentAt: null },
          data: { reminderSentAt: now },
        });
        if (claimed.count !== 1) return false;

        const until = ubDate(sub.endsAt);
        await enqueueEmail(tx, sub.user.email, 'accessEnding', {
          firstName: sub.user.firstName,
          endsAt: until,
        });
        await enqueuePush(tx, {
          userId,
          title: mn.push.accessEnding.title,
          body: mn.push.accessEnding.body({ endsAt: until }),
          data: { type: 'access_ending' },
        });
        return true;
      });
      if (done) queued++;
    }
    return { affected: queued };
  },
};

const PUBLISH_BATCH = 100;

/**
 * SPEC G: a SCHEDULED episode goes live when its time has come, provided it has a cover and
 * READY audio (otherwise it waits until it does). The status is the precondition of the update,
 * so repeated or parallel ticks publish an episode once. `publishedAt` is the planned time, so
 * the library orders episodes by when they were meant to appear.
 */
export const publishScheduledEpisodes: CronTask = {
  name: 'publishScheduledEpisodes',
  async run({ db, now }) {
    const due = await db.episode.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledFor: { lte: now },
        coverPath: { not: '' },
        mediaAssets: { some: { kind: 'AUDIO', status: 'READY' } },
      },
      select: { id: true, scheduledFor: true },
      orderBy: { scheduledFor: 'asc' },
      take: PUBLISH_BATCH,
    });
    let published = 0;
    for (const episode of due) {
      const done = await db.episode.updateMany({
        where: { id: episode.id, status: 'SCHEDULED' },
        data: { status: 'PUBLISHED', publishedAt: episode.scheduledFor ?? now, scheduledFor: null },
      });
      published += done.count;
    }
    return { affected: published };
  },
};

/** Removes resumable uploads that were never finished (older than 7 days). */
export const cleanupAbandonedUploads = (cleanUp: () => Promise<number>): CronTask => ({
  name: 'cleanupAbandonedUploads',
  async run() {
    return { affected: await cleanUp() };
  },
});

/** Keeps the Job table small. FAILED jobs are kept for inspection. */
export const purgeDoneJobs: CronTask = {
  name: 'purgeDoneJobs',
  async run({ db, now }) {
    const { count } = await db.job.deleteMany({
      where: { status: 'DONE', runAt: { lt: new Date(now.getTime() - 30 * DAY_MS) } },
    });
    return { affected: count };
  },
};

export const cronTasks: CronTask[] = [
  expirePendingPayments,
  expireEndedSubscriptions,
  sendAccessEndingReminders,
  publishScheduledEpisodes,
  purgeDoneJobs,
];
