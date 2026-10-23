import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from '../db';
import type { Job } from '../generated/prisma/client';
import { backoffMs, defaultBackoff, type BackoffOptions } from './backoff';
import { PermanentJobError, type GiveUpContext, type JobRegistry } from './registry';

export interface WorkerOptions {
  /** Jobs claimed per round. */
  batchSize?: number;
  pollIntervalMs?: number;
  /**
   * A RUNNING job whose lock (set when the job starts) is older than this is assumed dead and
   * claimed again. Long enough for a big video upload (ADR-0045). Defaults to 2 hours.
   */
  lockTimeoutMs?: number;
  backoff?: BackoffOptions;
  now?: () => Date;
  /** Called for jobs that end FAILED (e.g. Sentry). */
  report?: (err: unknown, job: Job) => void;
}

const MAX_ERROR_LENGTH = 2000;
const safeJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
const DEFAULT_LOCK_TIMEOUT_MS = 2 * 60 * 60_000;
/** Jobs failed one by one per recovery round (the rest wait for the next round). */
const MAX_FAILED_PER_RECOVERY = 100;
const LOCK_TIMED_OUT = 'Lock timed out (worker stopped?)';

/**
 * In-process worker for the Job table. Safe to run in several processes at once:
 * claiming uses SELECT ... FOR UPDATE SKIP LOCKED, so a job is never claimed twice.
 */
export class JobWorker {
  private readonly batchSize: number;
  private readonly pollIntervalMs: number;
  private readonly lockTimeoutMs: number;
  private readonly backoff: BackoffOptions;
  private readonly now: () => Date;
  private running = false;
  private timer: NodeJS.Timeout | undefined;
  private loop: Promise<void> | undefined;
  /** Jobs the loop (start()) has started and not yet finished. */
  private readonly inFlight = new Set<Promise<void>>();
  private lastRecoveryAt: number | undefined;

  constructor(
    private readonly db: Db,
    private readonly registry: JobRegistry,
    private readonly log: FastifyBaseLogger,
    private readonly opts: WorkerOptions = {},
  ) {
    this.batchSize = opts.batchSize ?? 5;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.lockTimeoutMs = opts.lockTimeoutMs ?? DEFAULT_LOCK_TIMEOUT_MS;
    this.backoff = opts.backoff ?? defaultBackoff;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Jobs still RUNNING after the lock timeout belong to a worker that died. Requeue them, or fail
   * them if they have used all attempts (so a job that crashes the process cannot loop forever).
   * A job failed here runs its definition's onGiveUp hook (e.g. the media it was sending is
   * marked FAILED, ADR-0045). The dead worker can no longer finish them: see finish().
   *
   * Throttled and best-effort: it runs at most once per interval, in READ COMMITTED (no gap
   * locks, so it cannot deadlock with claims), and a failure only skips this round.
   */
  private async recoverStaleJobs(now: Date): Promise<void> {
    const interval = Math.min(60_000, this.lockTimeoutMs / 2);
    if (this.lastRecoveryAt && now.getTime() - this.lastRecoveryAt < interval) return;
    this.lastRecoveryAt = now.getTime();

    const stale = {
      status: 'RUNNING' as const,
      lockedAt: { lt: new Date(now.getTime() - this.lockTimeoutMs) },
    };
    const readCommitted = { isolationLevel: 'ReadCommitted' as const };
    try {
      const exhausted = await this.db.job.findMany({
        where: { ...stale, attempts: { gte: this.db.job.fields.maxAttempts } },
        orderBy: { lockedAt: 'asc' },
        take: MAX_FAILED_PER_RECOVERY,
      });
      let failed = 0;
      for (const job of exhausted) {
        // Only the recovery that actually fails the job (same lock) runs the hook.
        const [res] = await this.db.$transaction(
          [
            this.db.job.updateMany({
              where: { id: job.id, status: 'RUNNING', lockedAt: job.lockedAt },
              data: { status: 'FAILED', lockedAt: null, lastError: LOCK_TIMED_OUT },
            }),
          ],
          readCommitted,
        );
        if (res.count === 0) continue;
        failed++;
        await this.giveUp(job, 'lock-timeout');
      }

      const [requeued] = await this.db.$transaction(
        [
          this.db.job.updateMany({
            where: { ...stale, attempts: { lt: this.db.job.fields.maxAttempts } },
            data: { status: 'QUEUED', lockedAt: null, runAt: now },
          }),
        ],
        readCommitted,
      );
      if (failed + requeued.count > 0) {
        this.log.warn({ failed, requeued: requeued.count }, 'recovered stale jobs');
      }
    } catch (err) {
      this.log.warn({ err }, 'stale job recovery skipped');
    }
  }

  /**
   * Runs the job type's onGiveUp hook after the job was marked FAILED for good. Never throws: a
   * broken hook must not block the recovery of other jobs or the worker loop.
   */
  private async giveUp(job: Job, reason: GiveUpContext['reason']): Promise<void> {
    const log = this.log.child({ jobId: job.id, jobType: job.type, attempt: job.attempts });
    try {
      const def = this.registry.get(job.type);
      if (!def?.onGiveUp) return;
      const parsed = def.schema.safeParse(safeJson(job.payload));
      if (!parsed.success) return; // nothing to act on
      await def.onGiveUp(parsed.data, {
        db: this.db,
        log,
        jobId: job.id,
        attempt: job.attempts,
        reason,
      });
    } catch (err) {
      log.error({ err }, 'give-up hook failed');
    }
  }

  /** Atomically moves up to `limit` due jobs to RUNNING and returns them. */
  async claim(limit = this.batchSize): Promise<Job[]> {
    const now = this.now();
    await this.recoverStaleJobs(now);

    return this.db.$transaction(
      async (tx) => {
        // The only raw SQL allowed in the codebase (CLAUDE.md): Prisma has no SKIP LOCKED.
        // Kept to a plain range on the (status, runAt) index so MySQL reads rows in order
        // and stops at LIMIT, locking only the rows it returns.
        const rows = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM Job
          WHERE status = 'QUEUED' AND runAt <= ${now}
          ORDER BY runAt
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED`;
        if (rows.length === 0) return [];

        const ids = rows.map((r) => r.id);
        await tx.job.updateMany({
          where: { id: { in: ids } },
          data: { status: 'RUNNING', lockedAt: now, attempts: { increment: 1 } },
        });
        return tx.job.findMany({ where: { id: { in: ids } }, orderBy: { runAt: 'asc' } });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Claims one batch and runs it. Returns the number of jobs processed. */
  async runOnce(): Promise<number> {
    const jobs = await this.claim();
    await this.run(jobs);
    return jobs.length;
  }

  /**
   * Runs claimed jobs in parallel, so a long job (a video upload) does not hold back the rest of
   * its batch. Never throws.
   */
  async run(jobs: Job[]): Promise<void> {
    const results = await Promise.allSettled(jobs.map((job) => this.execute(job)));
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        this.log.error({ err: r.reason, jobId: jobs[i]!.id }, 'job run failed');
      }
    });
  }

  /** Processes due jobs until none are left or the time budget is used up (cron tick). */
  async drain(budgetMs: number): Promise<number> {
    const deadline = Date.now() + budgetMs;
    let total = 0;
    while (Date.now() < deadline) {
      const n = await this.runOnce();
      total += n;
      if (n === 0) break;
    }
    return total;
  }

  /**
   * Moves the lock to this moment (the timeout counts from the job's own start, not from the
   * claim of its batch), then runs the job. A job whose lock was taken meanwhile is skipped.
   */
  private async execute(claimed: Job): Promise<void> {
    const log = this.log.child({
      jobId: claimed.id,
      jobType: claimed.type,
      attempt: claimed.attempts,
    });
    // At least 1 ms later than the claim, so the update always changes the row (DATETIME(3)).
    const startedAt = new Date(
      Math.max(this.now().getTime(), (claimed.lockedAt?.getTime() ?? 0) + 1),
    );
    const moved = await this.db.job.updateMany({
      where: { id: claimed.id, status: 'RUNNING', lockedAt: claimed.lockedAt },
      data: { lockedAt: startedAt },
    });
    if (moved.count === 0) {
      log.warn('job lock lost before start, skipped');
      return;
    }
    const job: Job = { ...claimed, lockedAt: startedAt };
    try {
      const def = this.registry.get(job.type);
      if (!def) throw new PermanentJobError(`Unknown job type: ${job.type}`);
      const payload = def.schema.parse(JSON.parse(job.payload));
      await def.handle(payload, { db: this.db, log, jobId: job.id, attempt: job.attempts });
      await this.finish(job, { status: 'DONE', lockedAt: null, lastError: null });
      log.info('job done');
    } catch (err) {
      const permanent =
        err instanceof PermanentJobError || err instanceof ZodError || err instanceof SyntaxError;
      const lastError = String(err instanceof Error ? (err.stack ?? err.message) : err).slice(
        0,
        MAX_ERROR_LENGTH,
      );

      if (permanent || job.attempts >= job.maxAttempts) {
        const failed = await this.finish(job, { status: 'FAILED', lockedAt: null, lastError });
        log.error({ err }, 'job failed permanently');
        this.opts.report?.(err, job);
        // Only the run that still owned the job marks it FAILED, so the hook runs once.
        if (failed.count === 1) await this.giveUp(job, 'failed');
      } else {
        const runAt = new Date(this.now().getTime() + backoffMs(job.attempts, this.backoff));
        await this.finish(job, { status: 'QUEUED', lockedAt: null, lastError, runAt });
        log.warn({ err, retryAt: runAt }, 'job failed, will retry');
      }
    }
  }

  /**
   * Updates only if we still own the lock, so a worker whose job was reclaimed after a
   * lock timeout cannot overwrite the newer run's result.
   */
  private finish(
    job: Job,
    data: {
      status: 'DONE' | 'FAILED' | 'QUEUED';
      lockedAt: null;
      lastError: string | null;
      runAt?: Date;
    },
  ) {
    return this.db.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockedAt: job.lockedAt },
      data,
    });
  }

  /** Starts a job without waiting for it; it leaves the in-flight set when it settles. */
  private launch(job: Job): void {
    const run: Promise<void> = this.execute(job)
      .catch((err: unknown) => this.log.error({ err, jobId: job.id }, 'job run failed'))
      .finally(() => this.inFlight.delete(run));
    this.inFlight.add(run);
  }

  /**
   * The in-process loop. Each poll claims only as many jobs as there are free slots (batchSize
   * minus the jobs still running) and starts them without waiting, so a long upload does not hold
   * back a login email (ADR-0045). drain() (the cron tick) claims and awaits its own batches; the
   * claim's SKIP LOCKED keeps the two from running the same job.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      let filled = false;
      try {
        const free = this.batchSize - this.inFlight.size;
        if (free > 0) {
          const jobs = await this.claim(free);
          for (const job of jobs) this.launch(job);
          filled = jobs.length === free;
        }
      } catch (err) {
        this.log.error({ err }, 'job worker round failed');
      }
      if (!this.running) return;
      // Every free slot was filled: more work is probably waiting, so look again at once.
      this.timer = setTimeout(() => (this.loop = tick()), filled ? 0 : this.pollIntervalMs);
    };
    this.loop = tick();
  }

  /** Stops polling and waits for the jobs that are still running. */
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.loop;
    await Promise.allSettled([...this.inFlight]);
  }
}
