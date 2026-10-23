import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { backoffMs } from '../src/jobs/backoff';
import { enqueue } from '../src/jobs/queue';
import { defineJob, JobRegistry, PermanentJobError } from '../src/jobs/registry';
import { JobWorker, type WorkerOptions } from '../src/jobs/worker';
import { testDb } from './helpers';

const log = pino({ level: 'silent' });
const backoff = { baseMs: 1000, maxMs: 60_000 };

function makeWorker(registry: JobRegistry, opts: WorkerOptions = {}) {
  return new JobWorker(testDb, registry, log, { backoff, ...opts });
}

/** A job whose handler records each run and fails while `failures` > 0. */
function recordingJob(type = 'test.record', failures = 0) {
  const runs: string[] = [];
  let remaining = failures;
  const def = defineJob({
    type,
    schema: z.object({ n: z.number() }),
    async handle(_payload, ctx) {
      runs.push(ctx.jobId);
      if (remaining-- > 0) throw new Error('temporary failure');
    },
  });
  return { def, runs };
}

describe('backoffMs', () => {
  it('doubles per attempt and caps at max', () => {
    expect([1, 2, 3, 4].map((a) => backoffMs(a, backoff))).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffMs(20, backoff)).toBe(60_000);
  });
});

describe('JobWorker', () => {
  it('runs a due job to DONE with its validated payload', async () => {
    const seen: unknown[] = [];
    const def = defineJob({
      type: 'test.echo',
      schema: z.object({ n: z.number() }),
      handle: async (payload) => void seen.push(payload),
    });
    const job = await enqueue(testDb, def, { n: 7 });

    expect(await makeWorker(new JobRegistry().register(def)).runOnce()).toBe(1);

    expect(seen).toEqual([{ n: 7 }]);
    const after = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(after).toMatchObject({ status: 'DONE', attempts: 1, lockedAt: null, lastError: null });
  });

  it('does not claim jobs scheduled in the future', async () => {
    const { def, runs } = recordingJob();
    await enqueue(testDb, def, { n: 1 }, { runAt: new Date(Date.now() + 60_000) });

    expect(await makeWorker(new JobRegistry().register(def)).runOnce()).toBe(0);
    expect(runs).toHaveLength(0);
  });

  it('retries with exponential backoff, then fails after maxAttempts', async () => {
    const { def, runs } = recordingJob('test.flaky', Infinity);
    const job = await enqueue(testDb, def, { n: 1 }, { maxAttempts: 3 });
    let clock = Date.now();
    const worker = makeWorker(new JobRegistry().register(def), { now: () => new Date(clock) });

    // Attempt 1 fails -> QUEUED, retry after 1 s.
    await worker.runOnce();
    let row = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 1, lockedAt: null });
    expect(row.runAt.getTime()).toBe(clock + 1000);
    expect(row.lastError).toContain('temporary failure');

    // Not due yet: nothing happens.
    expect(await worker.runOnce()).toBe(0);

    // Attempt 2 fails -> retry after 2 s.
    clock += 1000;
    await worker.runOnce();
    row = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'QUEUED', attempts: 2 });
    expect(row.runAt.getTime()).toBe(clock + 2000);

    // Attempt 3 = maxAttempts -> FAILED, never claimed again.
    clock += 2000;
    await worker.runOnce();
    row = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: 3, lockedAt: null });

    clock += 60 * 60_000;
    expect(await worker.runOnce()).toBe(0);
    expect(runs).toHaveLength(3);
  });

  it('succeeds on a retry after a temporary failure', async () => {
    const { def, runs } = recordingJob('test.recovers', 1);
    const job = await enqueue(testDb, def, { n: 1 });
    let clock = Date.now();
    const worker = makeWorker(new JobRegistry().register(def), { now: () => new Date(clock) });

    await worker.runOnce();
    clock += 1000;
    await worker.runOnce();

    expect(runs).toHaveLength(2);
    expect(await testDb.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'DONE',
      attempts: 2,
      lastError: null,
    });
  });

  it('fails permanently, without retries, for unknown types, bad payloads and PermanentJobError', async () => {
    const permanent = defineJob({
      type: 'test.permanent',
      schema: z.object({}),
      handle: async () => {
        throw new PermanentJobError('cannot ever succeed');
      },
    });
    const strict = defineJob({
      type: 'test.strict',
      schema: z.object({ n: z.number() }),
      handle: async () => {},
    });
    const report: unknown[] = [];
    const worker = makeWorker(new JobRegistry().register(permanent, strict), {
      report: (err) => report.push(err),
    });

    await testDb.job.create({ data: { type: 'test.nobody-handles-this', payload: '{}' } });
    await testDb.job.create({ data: { type: 'test.strict', payload: '{"n":"not a number"}' } });
    await testDb.job.create({ data: { type: 'test.strict', payload: 'not json' } });
    await enqueue(testDb, permanent, {});

    expect(await worker.runOnce()).toBe(4);
    const rows = await testDb.job.findMany();
    expect(rows.map((r) => [r.status, r.attempts])).toEqual(Array(4).fill(['FAILED', 1]));
    expect(report).toHaveLength(4);
  });

  it('never claims the same job twice under concurrent claims', async () => {
    const def = defineJob({
      type: 'test.noop',
      schema: z.object({ n: z.number() }),
      handle: async () => {},
    });
    const total = 60;
    for (let n = 0; n < total; n++) await enqueue(testDb, def, { n });

    const worker = makeWorker(new JobRegistry().register(def));
    // 12 concurrent claimers on separate pooled connections, 7 jobs each (84 > 60).
    const batches = await Promise.all(Array.from({ length: 12 }, () => worker.claim(7)));
    const ids = batches.flat().map((j) => j.id);

    expect(ids).toHaveLength(total);
    expect(new Set(ids).size).toBe(total);
    expect(await testDb.job.count({ where: { status: 'RUNNING', attempts: 1 } })).toBe(total);
  });

  it('runs each job exactly once with several workers running at the same time', async () => {
    const { def, runs } = recordingJob('test.once');
    const total = 40;
    for (let n = 0; n < total; n++) await enqueue(testDb, def, { n });

    const registry = new JobRegistry().register(def);
    const workers = Array.from({ length: 4 }, () => makeWorker(registry, { batchSize: 3 }));
    await Promise.all(workers.map((w) => w.drain(15_000)));

    expect(runs).toHaveLength(total);
    expect(new Set(runs).size).toBe(total);
    expect(await testDb.job.count({ where: { status: 'DONE' } })).toBe(total);
  });

  it('reclaims a job whose worker died, and ignores the dead worker finishing late', async () => {
    const { def, runs } = recordingJob('test.stale');
    const job = await enqueue(testDb, def, { n: 1 });
    let clock = Date.now();
    const registry = new JobRegistry().register(def);
    const worker = makeWorker(registry, { lockTimeoutMs: 60_000, now: () => new Date(clock) });

    // Worker A claims and then "dies" (never finishes).
    const [claimedByA] = await worker.claim();
    expect(claimedByA?.id).toBe(job.id);

    // Before the lock times out nobody else can take it.
    expect(await worker.claim()).toHaveLength(0);

    // After the timeout, worker B reclaims it and completes it.
    clock += 61_000;
    expect(await worker.runOnce()).toBe(1);
    expect(runs).toEqual([job.id]);
    const done = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(done).toMatchObject({ status: 'DONE', attempts: 2 });

    // Worker A finishing late (with its old lock) must not change anything.
    const late = await testDb.job.updateMany({
      where: { id: job.id, status: 'RUNNING', lockedAt: claimedByA!.lockedAt },
      data: { status: 'FAILED' },
    });
    expect(late.count).toBe(0);
  });

  it('fails a stale job that has used all attempts instead of looping forever', async () => {
    const { def, runs } = recordingJob('test.poison');
    const job = await enqueue(testDb, def, { n: 1 }, { maxAttempts: 1 });
    let clock = Date.now();
    const worker = makeWorker(new JobRegistry().register(def), {
      lockTimeoutMs: 60_000,
      now: () => new Date(clock),
    });

    await worker.claim(); // claimed (attempt 1 of 1), then the process "crashes"
    clock += 61_000;
    expect(await worker.runOnce()).toBe(0);

    expect(runs).toHaveLength(0);
    const row = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'FAILED', attempts: 1, lockedAt: null });
    expect(row.lastError).toContain('Lock timed out');
  });
});

// ADR-0045 item 2: a job's lock starts when the job starts, the batch runs in parallel, the lock
// timeout is long enough for a big video upload, and a job failed by lock timeout runs its hook.
describe('JobWorker locks (ADR-0045)', () => {
  /** A promise and its opener, to hold a handler until the test lets it go. */
  function gate() {
    let open!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    return { open, opened };
  }
  /** The test clock starts a second ahead, so jobs enqueued just now are already due. */
  const startClock = () => Date.now() + 1000;
  const lockOf = async (id: string) =>
    (await testDb.job.findUniqueOrThrow({ where: { id } })).lockedAt!.getTime();

  it('moves each job lock to its own start, so a recovery meanwhile does not requeue it', async () => {
    let clock = startClock();
    const now = () => new Date(clock);
    const bStarted = gate();
    const releaseB = gate();
    const runs: string[] = [];
    const locks: Record<string, number> = {};
    const a = defineJob({
      type: 'test.a',
      schema: z.object({}),
      async handle(_p, ctx) {
        runs.push('a');
        locks.a = await lockOf(ctx.jobId);
        await bStarted.opened;
        // 80 s after the claim but 30 s after the jobs started: stale only if the lock still
        // pointed at the claim. A fresh worker (the cron tick) runs the recovery.
        clock += 30_000;
        expect(await makeWorker(registry, { lockTimeoutMs: 60_000, now }).claim()).toHaveLength(0);
        releaseB.open();
      },
    });
    const b = defineJob({
      type: 'test.b',
      schema: z.object({}),
      async handle(_p, ctx) {
        runs.push('b');
        locks.b = await lockOf(ctx.jobId);
        bStarted.open();
        await releaseB.opened;
      },
    });
    const registry = new JobRegistry().register(a, b);
    await enqueue(testDb, a, {});
    await enqueue(testDb, b, {});
    const worker = makeWorker(registry, { lockTimeoutMs: 60_000, now });

    const claimAt = clock;
    const jobs = await worker.claim(2);
    expect(jobs).toHaveLength(2);
    clock += 50_000; // the batch starts 50 s after the claim
    await worker.run(jobs);

    expect(runs.sort()).toEqual(['a', 'b']);
    expect(locks.a).toBeGreaterThanOrEqual(claimAt + 50_000);
    expect(locks.b).toBeGreaterThanOrEqual(claimAt + 50_000);
    expect(await testDb.job.count({ where: { status: 'DONE' } })).toBe(2);
  });

  it('does not reclaim a job that runs longer than 15 minutes but shorter than the timeout', async () => {
    let clock = startClock();
    const now = () => new Date(clock);
    const runs: string[] = [];
    const def = defineJob({
      type: 'test.long',
      schema: z.object({}),
      async handle(_p, ctx) {
        runs.push(ctx.jobId);
        clock += 20 * 60_000;
        // Another worker (the cron tick) with the default timeout finds nothing to recover.
        expect(await makeWorker(registry, { now }).claim()).toHaveLength(0);
      },
    });
    const registry = new JobRegistry().register(def);
    const job = await enqueue(testDb, def, {});

    expect(await makeWorker(registry, { now }).runOnce()).toBe(1);
    expect(runs).toEqual([job.id]);
    expect(await testDb.job.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({
      status: 'DONE',
      attempts: 1,
    });
  });

  it('runs a claimed batch in parallel', async () => {
    const started: number[] = [];
    const bothStarted = gate();
    const def = defineJob({
      type: 'test.parallel',
      schema: z.object({ n: z.number() }),
      async handle({ n }) {
        started.push(n);
        if (started.length === 2) bothStarted.open();
        // Each waits for the other to start: a one-by-one batch never gets past this.
        await Promise.race([
          bothStarted.opened,
          new Promise((_, reject) => setTimeout(() => reject(new Error('not parallel')), 3000)),
        ]);
      },
    });
    await enqueue(testDb, def, { n: 1 });
    await enqueue(testDb, def, { n: 2 });

    expect(await makeWorker(new JobRegistry().register(def)).runOnce()).toBe(2);
    expect(started.sort()).toEqual([1, 2]);
    expect(await testDb.job.count({ where: { status: 'DONE' } })).toBe(2);
  });

  it('skips a job whose lock was taken by someone else between claim and start', async () => {
    const { def, runs } = recordingJob('test.lost');
    const job = await enqueue(testDb, def, { n: 1 });
    const worker = makeWorker(new JobRegistry().register(def));

    const jobs = await worker.claim();
    expect(jobs).toHaveLength(1);
    // Reclaimed and restarted elsewhere meanwhile: the lock is now someone else's.
    const theirs = new Date(Date.now() + 5000);
    await testDb.job.update({ where: { id: job.id }, data: { lockedAt: theirs } });
    await worker.run(jobs);

    expect(runs).toHaveLength(0);
    const row = await testDb.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(row).toMatchObject({ status: 'RUNNING', lockedAt: theirs });
  });

  it('runs every queued email once while a slow job runs and the cron tick drains too', async () => {
    let clock = startClock();
    const now = () => new Date(clock);
    const emails: string[] = [];
    const slowRuns: string[] = [];
    const email = defineJob({
      type: 'test.email',
      schema: z.object({ n: z.number() }),
      async handle(_p, ctx) {
        await new Promise((r) => setTimeout(r, 20));
        emails.push(ctx.jobId);
      },
    });
    const slow = defineJob({
      type: 'test.video',
      schema: z.object({}),
      async handle(_p, ctx) {
        slowRuns.push(ctx.jobId);
        clock += 20 * 60_000; // a 20-minute upload
        await cronWorker.drain(5000); // the cron tick arrives meanwhile
      },
    });
    const registry = new JobRegistry().register(email, slow);
    const loopWorker = makeWorker(registry, { now });
    const cronWorker = makeWorker(registry, { now });
    await enqueue(testDb, slow, {}, { runAt: new Date(Date.now() - 1000) });
    for (let n = 0; n < 4; n++) await enqueue(testDb, email, { n });

    await Promise.all([loopWorker.runOnce(), cronWorker.drain(5000)]);

    expect(slowRuns).toHaveLength(1);
    expect(emails).toHaveLength(4);
    expect(new Set(emails).size).toBe(4);
    expect(await testDb.job.count({ where: { status: 'DONE' } })).toBe(5);
  });

  it('runs the give-up hook of each job failed by recovery, even when one hook throws', async () => {
    const hooked: unknown[] = [];
    const bad = defineJob({
      type: 'test.bad-hook',
      schema: z.object({ n: z.number() }),
      handle: async () => {},
      onGiveUp: async () => {
        throw new Error('hook broke');
      },
    });
    const good = defineJob({
      type: 'test.good-hook',
      schema: z.object({ n: z.number() }),
      handle: async () => {},
      onGiveUp: async (payload, ctx) => void hooked.push([payload, ctx.jobId, ctx.reason]),
    });
    let clock = startClock();
    const worker = makeWorker(new JobRegistry().register(bad, good), {
      lockTimeoutMs: 60_000,
      now: () => new Date(clock),
    });
    const j1 = await enqueue(testDb, good, { n: 1 }, { maxAttempts: 1 });
    const j2 = await enqueue(testDb, bad, { n: 2 }, { maxAttempts: 1 });
    const j3 = await enqueue(testDb, good, { n: 3 }, { maxAttempts: 1 });
    // Still has an attempt left: requeued, no hook.
    const j4 = await enqueue(testDb, good, { n: 4 }, { maxAttempts: 2 });

    // Claimed one by one, a second apart, so recovery handles them in this order: the throwing
    // hook is in the middle. Then the process "crashes".
    for (const id of [j1.id, j2.id, j3.id, j4.id]) {
      await testDb.job.updateMany({
        where: { id: { not: id }, status: 'QUEUED' },
        data: { runAt: new Date(clock + 3_600_000) },
      });
      await testDb.job.update({ where: { id }, data: { runAt: new Date(clock - 1000) } });
      expect((await worker.claim(1)).map((j) => j.id)).toEqual([id]);
      clock += 1000;
    }
    clock += 61_000;
    expect(await worker.claim(0)).toHaveLength(0); // only the recovery

    const rows = await testDb.job.findMany({ where: { id: { in: [j1.id, j2.id, j3.id, j4.id] } } });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    for (const j of [j1, j2, j3]) {
      expect(byId[j.id]).toMatchObject({ status: 'FAILED', lockedAt: null });
      expect(byId[j.id]!.lastError).toContain('Lock timed out');
    }
    expect(byId[j4.id]).toMatchObject({ status: 'QUEUED', lockedAt: null });
    expect(hooked).toEqual([
      [{ n: 1 }, j1.id, 'lock-timeout'],
      [{ n: 3 }, j3.id, 'lock-timeout'],
    ]);
  });

  it('runs the give-up hook once when a job fails for good, never on a retry', async () => {
    const hooked: unknown[] = [];
    const flaky = defineJob({
      type: 'test.giveup-flaky',
      schema: z.object({ n: z.number() }),
      handle: async () => {
        throw new Error('temporary');
      },
      onGiveUp: async (payload, ctx) => void hooked.push([payload, ctx.reason]),
    });
    const permanent = defineJob({
      type: 'test.giveup-permanent',
      schema: z.object({ n: z.number() }),
      handle: async () => {
        throw new PermanentJobError('never');
      },
      onGiveUp: async (payload, ctx) => void hooked.push([payload, ctx.reason]),
    });
    let clock = startClock();
    const worker = makeWorker(new JobRegistry().register(flaky, permanent), {
      now: () => new Date(clock),
    });
    const f = await enqueue(testDb, flaky, { n: 1 }, { maxAttempts: 2 });

    await worker.runOnce(); // attempt 1 of 2: retried, no hook
    expect((await testDb.job.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('QUEUED');
    expect(hooked).toEqual([]);
    clock += 60_000;
    await worker.runOnce(); // attempt 2 of 2: gives up
    expect((await testDb.job.findUniqueOrThrow({ where: { id: f.id } })).status).toBe('FAILED');
    expect(hooked).toEqual([[{ n: 1 }, 'failed']]);

    await enqueue(testDb, permanent, { n: 2 });
    await worker.runOnce();
    expect(hooked).toEqual([
      [{ n: 1 }, 'failed'],
      [{ n: 2 }, 'failed'],
    ]);
  });
});

// ADR-0045 review: the loop keeps free slots busy instead of waiting for its slowest job.
describe('JobWorker loop (ADR-0045)', () => {
  function gate() {
    let open!: () => void;
    const opened = new Promise<void>((r) => (open = r));
    return { open, opened };
  }
  /** Polls until `check` is true or the time is up. */
  async function waitFor(check: () => Promise<boolean> | boolean, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await check()) return true;
      await new Promise((r) => setTimeout(r, 25));
    }
    return false;
  }
  const statusOf = async (id: string) =>
    (await testDb.job.findUniqueOrThrow({ where: { id } })).status;

  it('finishes a queued email while a slow job is still in flight', async () => {
    const slowStarted = gate();
    const releaseSlow = gate();
    const slow = defineJob({
      type: 'test.slow',
      schema: z.object({}),
      async handle() {
        slowStarted.open();
        await releaseSlow.opened;
      },
    });
    const email = defineJob({ type: 'test.mail', schema: z.object({}), handle: async () => {} });
    const worker = makeWorker(new JobRegistry().register(slow, email), {
      batchSize: 2,
      pollIntervalMs: 50,
    });
    const slowJob = await enqueue(testDb, slow, {});
    worker.start();
    try {
      await slowStarted.opened;
      const mail = await enqueue(testDb, email, {});
      expect(await waitFor(async () => (await statusOf(mail.id)) === 'DONE')).toBe(true);
      expect(await statusOf(slowJob.id)).toBe('RUNNING');
    } finally {
      releaseSlow.open();
      await worker.stop();
    }
    expect(await statusOf(slowJob.id)).toBe('DONE');
  });

  it('never has more than batchSize jobs in flight, and runs each once', async () => {
    let inFlight = 0;
    let max = 0;
    const runs: string[] = [];
    const def = defineJob({
      type: 'test.busy',
      schema: z.object({ n: z.number() }),
      async handle(_p, ctx) {
        inFlight++;
        max = Math.max(max, inFlight);
        await new Promise((r) => setTimeout(r, 30 + Math.random() * 50));
        runs.push(ctx.jobId);
        inFlight--;
      },
    });
    for (let n = 0; n < 8; n++) await enqueue(testDb, def, { n });
    const worker = makeWorker(new JobRegistry().register(def), {
      batchSize: 3,
      pollIntervalMs: 20,
    });
    worker.start();
    expect(
      await waitFor(async () => (await testDb.job.count({ where: { status: 'DONE' } })) === 8),
    ).toBe(true);
    await worker.stop();
    expect(max).toBeLessThanOrEqual(3);
    expect(runs).toHaveLength(8);
    expect(new Set(runs).size).toBe(8);
  });

  it('stop() waits for the jobs in flight', async () => {
    const started = gate();
    let finished = false;
    const def = defineJob({
      type: 'test.stop',
      schema: z.object({}),
      async handle() {
        started.open();
        await new Promise((r) => setTimeout(r, 200));
        finished = true;
      },
    });
    const job = await enqueue(testDb, def, {});
    const worker = makeWorker(new JobRegistry().register(def), { pollIntervalMs: 20 });
    worker.start();
    await started.opened;
    await worker.stop();
    expect(finished).toBe(true);
    expect(await statusOf(job.id)).toBe('DONE');
  });

  it('keeps running after a job throws and after finish() fails', async () => {
    const boom = defineJob({
      type: 'test.boom',
      schema: z.object({}),
      handle: async () => {
        throw new PermanentJobError('boom');
      },
    });
    const ok = defineJob({ type: 'test.ok', schema: z.object({}), handle: async () => {} });
    const db = Object.create(testDb) as typeof testDb;
    // finish() fails twice in a row (DONE, then the retry's QUEUED: the database dropped the
    // connection), so the error escapes execute().
    let failures = 2;
    let victim = '';
    const realJob = testDb.job;
    Object.defineProperty(db, 'job', {
      value: new Proxy(realJob, {
        get(target, prop, receiver) {
          if (prop === 'updateMany') {
            return (args: { where: { id?: unknown }; data: { status?: string } }) => {
              if (failures > 0 && args.where.id === victim && args.data.status !== undefined) {
                failures--;
                return Promise.reject(new Error('connection lost'));
              }
              return target.updateMany(args as never);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
    });
    const worker = new JobWorker(db, new JobRegistry().register(boom, ok), log, {
      backoff,
      batchSize: 1,
      pollIntervalMs: 20,
    });
    const b = await enqueue(testDb, boom, {});
    const first = await enqueue(testDb, ok, {}, { runAt: new Date(Date.now() - 500) });
    victim = first.id;
    worker.start();
    try {
      expect(await waitFor(async () => (await statusOf(b.id)) === 'FAILED')).toBe(true);
      const second = await enqueue(testDb, ok, {});
      expect(await waitFor(async () => (await statusOf(second.id)) === 'DONE')).toBe(true);
    } finally {
      await worker.stop();
    }
    // The job whose finish() failed stays RUNNING until the lock timeout frees it.
    expect(await statusOf(first.id)).toBe('RUNNING');
  });
});
