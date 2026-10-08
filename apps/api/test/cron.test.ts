import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { enqueue } from '../src/jobs/queue';
import { defineJob, JobRegistry } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import { CRON_SECRET, testApp, testDb } from './helpers';

const DAY = 24 * 60 * 60_000;

async function seedSubscriptions() {
  const user = await testDb.user.create({
    data: { username: 'u1', email: 'u1@example.com', firstName: 'А', lastName: 'Б', phone: '1' },
  });
  const plan = await testDb.plan.create({
    data: { name: 'Жилийн эрх', durationDays: 365, priceMnt: 100000 },
  });
  const base = { userId: user.id, planId: plan.id, amountMnt: 100000 };
  await testDb.subscription.createMany({
    data: [
      {
        ...base,
        referenceCode: 'ONG-AAAAA',
        status: 'PENDING_PAYMENT',
        createdAt: new Date(Date.now() - 8 * DAY),
      },
      {
        ...base,
        referenceCode: 'ONG-BBBBB',
        status: 'PENDING_PAYMENT',
        createdAt: new Date(Date.now() - 1 * DAY),
      },
      {
        ...base,
        referenceCode: 'ONG-CCCCC',
        status: 'ACTIVE',
        endsAt: new Date(Date.now() - 1000),
      },
      { ...base, referenceCode: 'ONG-DDDDD', status: 'ACTIVE', endsAt: new Date(Date.now() + DAY) },
    ],
  });
}

const statusOf = async (referenceCode: string) =>
  (await testDb.subscription.findUniqueOrThrow({ where: { referenceCode } })).status;

describe('POST /v1/cron/tick', () => {
  it('refuses requests without the secret', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'POST', url: '/v1/cron/tick' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  it('refuses a wrong secret', async () => {
    const app = await testApp();
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: { 'x-cron-secret': `${CRON_SECRET}x` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('accepts any request body or content type (cron services vary)', async () => {
    const app = await testApp({ cronTasks: [] });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: {
        'x-cron-secret': CRON_SECRET,
        'content-type': 'application/x-www-form-urlencoded',
      },
      payload: 'a=1',
    });
    expect(res.statusCode).toBe(200);
  });

  it('runs the tasks, and running again changes nothing (idempotent)', async () => {
    await seedSubscriptions();
    const app = await testApp();
    const tick = () =>
      app.inject({
        method: 'POST',
        url: '/v1/cron/tick',
        headers: { 'x-cron-secret': CRON_SECRET },
      });

    const first = await tick();
    expect(first.statusCode).toBe(200);
    expect(first.json().tasks).toMatchObject({
      expirePendingPayments: { affected: 1 },
      expireEndedSubscriptions: { affected: 1 },
    });
    expect(await statusOf('ONG-AAAAA')).toBe('EXPIRED');
    expect(await statusOf('ONG-BBBBB')).toBe('PENDING_PAYMENT');
    expect(await statusOf('ONG-CCCCC')).toBe('EXPIRED');
    expect(await statusOf('ONG-DDDDD')).toBe('ACTIVE');

    const second = await tick();
    expect(second.json().tasks).toMatchObject({
      expirePendingPayments: { affected: 0 },
      expireEndedSubscriptions: { affected: 0 },
    });
  });

  it('drains due jobs', async () => {
    const runs: number[] = [];
    const def = defineJob({
      type: 'test.tick',
      schema: z.object({ n: z.number() }),
      handle: async ({ n }) => void runs.push(n),
    });
    await enqueue(testDb, def, { n: 1 });
    await enqueue(testDb, def, { n: 2 });
    const worker = new JobWorker(
      testDb,
      new JobRegistry().register(def),
      pino({ level: 'silent' }),
    );
    const app = await testApp({ worker, cronTasks: [] });

    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    expect(res.json().jobsProcessed).toBe(2);
    expect(runs.sort()).toEqual([1, 2]);
  });
});
