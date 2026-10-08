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
