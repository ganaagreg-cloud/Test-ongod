import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { Db } from '../src/db';
import type { Mailer } from '../src/email/mailer';
import { enqueue } from '../src/jobs/queue';
import { defineJob, JobRegistry, PermanentJobError } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import { ALERT_JOB_TYPE, createAlertJob, createAlerts } from '../src/monitoring/alerts';
import { testApp, testDb } from './helpers';

const log = pino({ level: 'silent' });
const OWNER = 'owner@example.com';

function makeAlerts(opts: { to?: string[]; now?: () => Date; db?: Db } = {}) {
  return createAlerts({ db: testDb, log, to: [OWNER], throttleMinutes: 60, ...opts });
}

const alertJobs = () => testDb.job.findMany({ where: { type: ALERT_JOB_TYPE } });
const payloadOf = (job: { payload: string }) => JSON.parse(job.payload);

describe('alert emails', () => {
  it('queues an alert for a 5xx with the request id and route pattern, not for 4xx', async () => {
    const alerts = makeAlerts();
    // Reporting is fire-and-forget in the app; collect the promises so the test can await them.
    const pending: Promise<void>[] = [];
    const app = await testApp({
      report: (err, info) => void pending.push(alerts.httpError(err, info)),
    });
    app.get('/boom/:id', async () => {
      throw new Error('kaboom');
    });
    app.get('/missing', async (_req, reply) => reply.callNotFound());

    const res = await app.inject({ url: '/boom/42?email=someone@example.com' });
    expect(res.statusCode).toBe(500);
    await app.inject({ url: '/missing' });
    expect(pending).toHaveLength(1); // only the 5xx was reported
    await Promise.all(pending);

    const jobs = await alertJobs();
    expect(jobs).toHaveLength(1);
    const payload = payloadOf(jobs[0]!);
    expect(payload).toMatchObject({
      to: [OWNER],
      kind: 'http',
      requestId: res.headers['x-request-id'],
    });
    expect(payload.summary).toContain('GET /boom/:id');
    expect(payload.summary).toContain('kaboom');
    expect(payload.summary).not.toContain('someone@example.com');
  });

  it('sends the same error at most once per throttle window, even after a restart', async () => {
    let clock = Date.now();
    const now = () => new Date(clock);
    const info = { requestId: 'r1', method: 'GET', route: '/v1/x' };

    await makeAlerts({ now }).httpError(new Error('a'), info);
    await makeAlerts({ now }).httpError(new Error('b'), info); // new process, same key
    expect(await alertJobs()).toHaveLength(1);

    await makeAlerts({ now }).httpError(new Error('c'), { ...info, route: '/v1/y' }); // other key
    expect(await alertJobs()).toHaveLength(2);

    clock += 61 * 60_000; // window passed
    await makeAlerts({ now }).httpError(new Error('d'), info);
    expect(await alertJobs()).toHaveLength(3);
  });

  it('does nothing when ALERT_EMAILS is empty', async () => {
    await makeAlerts({ to: [] }).httpError(new Error('x'), {
      requestId: 'r',
      method: 'GET',
      route: '/',
    });
    expect(await alertJobs()).toHaveLength(0);
  });

  it('never throws, even when the database is down', async () => {
    const brokenDb = {
      job: { findFirst: () => Promise.reject(new Error('db down')) },
    } as unknown as Db;
    await expect(
      makeAlerts({ db: brokenDb }).httpError(new Error('x'), {
        requestId: 'r',
        method: 'GET',
        route: '/',
      }),
    ).resolves.toBeUndefined();
  });

  it('alerts when a job fails permanently, but never for a failed alert job', async () => {
    const alerts = makeAlerts();
    const pending: Promise<void>[] = [];
    const broken = defineJob({
      type: 'test.broken',
      schema: z.object({}),
      handle: async () => {
        throw new PermanentJobError('cannot');
      },
    });
    const failingMailer: Mailer = { send: () => Promise.reject(new Error('smtp down')) };
    const worker = new JobWorker(
      testDb,
      new JobRegistry().register(broken, createAlertJob(failingMailer)),
      log,
      { report: (err, job) => void pending.push(alerts.jobFailed(err, job)) },
    );

    await enqueue(testDb, broken, {});
    await worker.runOnce();
    await Promise.all(pending);

    const [alert] = await alertJobs();
    expect(payloadOf(alert!)).toMatchObject({ kind: 'job' });
    expect(payloadOf(alert!).summary).toContain('test.broken');

    // The alert job itself fails (SMTP down) until it runs out of attempts: no new alert.
    await testDb.job.update({ where: { id: alert!.id }, data: { maxAttempts: 1 } });
    await worker.runOnce();
    await Promise.all(pending);
    const after = await alertJobs();
    expect(after).toHaveLength(1);
    expect(after[0]!.status).toBe('FAILED');
  });

  it('sends a Mongolian alert email to all recipients', async () => {
    const sent: { to: string; subject: string; text: string }[] = [];
    const mailer: Mailer = { send: async (to, email) => void sent.push({ to, ...email }) };
    const alerts = makeAlerts({ to: [OWNER, 'admin@example.com'] });
    await alerts.httpError(new Error('kaboom'), {
      requestId: 'req-1',
      method: 'POST',
      route: '/v1/x',
    });

    const worker = new JobWorker(testDb, new JobRegistry().register(createAlertJob(mailer)), log);
    expect(await worker.runOnce()).toBe(1);

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe(`${OWNER}, admin@example.com`);
    expect(sent[0]!.subject).toContain('алдаа');
    expect(sent[0]!.text).toContain('req-1');
    expect(sent[0]!.text).toContain('Улаанбаатар');
  });
});
