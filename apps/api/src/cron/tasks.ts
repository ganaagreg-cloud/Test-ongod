import type { Db } from '../db';

const DAY_MS = 24 * 60 * 60_000;

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
  purgeDoneJobs,
];
