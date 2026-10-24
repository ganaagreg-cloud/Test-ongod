import { PENDING_PAYMENT_TTL_DAYS, REMINDER_DAYS_BEFORE_END } from '@ongod/shared';
import { lockUser } from '../auth/service';
import type { Db } from '../db';
import { enqueueEmail } from '../email';
import { mn } from '../i18n/mn';
import type { PaymentService } from '../payments/service';
import { DAY_MS, ubDate } from '../lib/dates';
import { enqueuePush } from '../push';
import { enqueuePublishPush, type PublishedEpisode } from '../push/publish';

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

/** A request that expired a few days ago may still have been paid on its last day. */
const SYNC_WINDOW_DAYS = PENDING_PAYMENT_TTL_DAYS + 3;

export interface SyncWaitingPaymentsOptions {
  /** Requests asked about per tick. Default 50. */
  limit?: number;
  /** No new Wire call starts after this much time in the tick (WIRE_SYNC_BUDGET_MS). */
  budgetMs?: number;
  /** One call is abandoned for this tick after this long. Default 10 s. */
  callTimeoutMs?: number;
}

/** Resolves true when `work` settles (either way), false when `ms` passes first. */
async function settlesWithin(work: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), ms);
  });
  try {
    // Both outcomes are handled here, so a late rejection of abandoned work is never unhandled.
    return await Promise.race([
      work.then(
        () => true,
        () => true,
      ),
      timedOut,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * ADR-0047 (supersedes ADR-0045 item 3): asks Wire about waiting QPay requests, so a payment
 * whose webhook was lost is granted within one tick. Newest first, so abandoned old checkouts
 * cannot starve a recent payer; time-boxed, so a hanging Wire cannot stall the rest of the tick.
 * Runs before expirePendingPayments. Granting goes through the payment service (one transaction,
 * status precondition), so repeated or parallel ticks grant once. A Wire error is logged by
 * sync() and only skips that request.
 */
export const syncWaitingPayments = (
  payments: Pick<PaymentService, 'sync'>,
  opts: SyncWaitingPaymentsOptions = {},
): CronTask => ({
  name: 'syncWaitingPayments',
  async run({ db, now }) {
    const budgetMs = opts.budgetMs ?? 20_000;
    const callTimeoutMs = opts.callTimeoutMs ?? 10_000;
    const startedAt = Date.now();
    const waiting = await db.subscription.findMany({
      where: {
        paymentProvider: 'WIRE',
        wirePaymentIntentId: { not: null },
        status: { in: ['PENDING_PAYMENT', 'EXPIRED'] },
        // Never granted: a request that was paid and then ran out is EXPIRED too (ADR-0047).
        startsAt: null,
        createdAt: { gte: new Date(now.getTime() - SYNC_WINDOW_DAYS * DAY_MS) },
      },
      include: { plan: true },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 50,
    });
    let granted = 0;
    for (const sub of waiting) {
      if (Date.now() - startedAt >= budgetMs) break; // the rest wait for the next tick
      if (!(await settlesWithin(payments.sync(sub), callTimeoutMs))) continue; // abandoned
      const after = await db.subscription.findUnique({
        where: { id: sub.id },
        select: { status: true },
      });
      if (after?.status === 'ACTIVE') granted++;
    }
    return { affected: granted };
  },
});

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
        // Audio or video (ADR-0038): any READY media file.
        mediaAssets: { some: { status: 'READY' } },
      },
      select: {
        id: true,
        title: true,
        pushText: true,
        notifyOnPublish: true,
        scheduledFor: true,
      },
      orderBy: { scheduledFor: 'asc' },
      take: PUBLISH_BATCH,
    });
    if (due.length === 0) return { affected: 0 };

    // One transaction: the status changes and the one combined push for the episodes this tick
    // really published (count === 1) commit together, so a repeated tick never pushes twice.
    const published = await db.$transaction(async (tx) => {
      const won: PublishedEpisode[] = [];
      for (const episode of due) {
        const done = await tx.episode.updateMany({
          where: { id: episode.id, status: 'SCHEDULED' },
          data: {
            status: 'PUBLISHED',
            publishedAt: episode.scheduledFor ?? now,
            scheduledFor: null,
          },
        });
        if (done.count === 1) won.push(episode);
      }
      await enqueuePublishPush(tx, won, now);
      return won.length;
    });
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
