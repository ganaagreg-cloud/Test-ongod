import type { FastifyBaseLogger } from 'fastify';
import { ZodError } from 'zod';
import type { Db } from '../db';
import type { Job } from '../generated/prisma/client';
import { backoffMs, defaultBackoff, type BackoffOptions } from './backoff';
import { PermanentJobError, type JobRegistry } from './registry';

export interface WorkerOptions {
  /** Jobs claimed per round. */
  batchSize?: number;
  pollIntervalMs?: number;
  /** A RUNNING job locked longer than this is assumed dead and claimed again. */
  lockTimeoutMs?: number;
  backoff?: BackoffOptions;
  now?: () => Date;
  /** Called for jobs that end FAILED (e.g. Sentry). */
  report?: (err: unknown, job: Job) => void;
}

const MAX_ERROR_LENGTH = 2000;

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
  private lastRecoveryAt: number | undefined;

  constructor(
    private readonly db: Db,
    private readonly registry: JobRegistry,
    private readonly log: FastifyBaseLogger,
    private readonly opts: WorkerOptions = {},
  ) {
    this.batchSize = opts.batchSize ?? 5;
    this.pollIntervalMs = opts.pollIntervalMs ?? 2000;
    this.lockTimeoutMs = opts.lockTimeoutMs ?? 15 * 60_000;
    this.backoff = opts.backoff ?? defaultBackoff;
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Jobs still RUNNING after the lock timeout belong to a worker that died. Requeue them,
   * or fail them if they have used all attempts (so a job that crashes the process cannot
   * loop forever). The dead worker can no longer finish them: see finish().
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
    try {
      const [exhausted, requeued] = await this.db.$transaction(
        [
          this.db.job.updateMany({
            where: { ...stale, attempts: { gte: this.db.job.fields.maxAttempts } },
            data: {
              status: 'FAILED',
              lockedAt: null,
              lastError: 'Lock timed out (worker stopped?)',
            },
          }),
          this.db.job.updateMany({
            where: stale,
            data: { status: 'QUEUED', lockedAt: null, runAt: now },
          }),
        ],
        { isolationLevel: 'ReadCommitted' },
      );
      if (exhausted.count + requeued.count > 0) {
        this.log.warn(
          { failed: exhausted.count, requeued: requeued.count },
          'recovered stale jobs',
        );
      }
    } catch (err) {
      this.log.warn({ err }, 'stale job recovery skipped');
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
    for (const job of jobs) await this.execute(job);
    return jobs.length;
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

  private async execute(job: Job): Promise<void> {
    const log = this.log.child({ jobId: job.id, jobType: job.type, attempt: job.attempts });
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
        await this.finish(job, { status: 'FAILED', lockedAt: null, lastError });
        log.error({ err }, 'job failed permanently');
        this.opts.report?.(err, job);
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

  start(): void {
    if (this.running) return;
    this.running = true;
    const tick = async () => {
      let processed = 0;
      try {
        processed = await this.runOnce();
      } catch (err) {
        this.log.error({ err }, 'job worker round failed');
      }
      if (!this.running) return;
      // A full batch probably means more work is waiting: go again immediately.
      this.timer = setTimeout(
        () => (this.loop = tick()),
        processed >= this.batchSize ? 0 : this.pollIntervalMs,
      );
    };
    this.loop = tick();
  }

  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await this.loop;
  }
}
