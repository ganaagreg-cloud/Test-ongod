import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { publishScheduledEpisodes } from '../src/cron/tasks';
import { authApp, device, signedIn, post } from './auth-helpers';
import { call, jobsOf, makeAdmin } from './admin-helpers';
import { DAY, makeCategory, makeEpisode, setAccess } from './catalog-helpers';
import { testDb } from './helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const member = async (email: string, until: Date | null = new Date(Date.now() + 30 * DAY)) => {
  const user = await signedIn(app, { email, device: device(email) });
  await setAccess(user.userId, until);
  return user;
};

const publish = (token: string, id: string) =>
  call(app, 'POST', `/v1/admin/episodes/${id}/publish`, token);

describe('push on publish', () => {
  it('queues one push per member with access (not without access, not logged out)', async () => {
    const admin = await makeAdmin(app);
    const a = await member('a@example.com');
    const b = await member('b@example.com');
    await member('none@example.com', null);
    const out = await member('out@example.com');
    await post(app, '/v1/auth/logout', { refreshToken: out.refreshToken });

    const category = await makeCategory();
    const episode = await makeEpisode(category.id, { status: 'DRAFT', title: 'Шинэ яриа' });
    expect((await publish(admin.accessToken, episode.id)).statusCode).toBe(200);

    const jobs = await jobsOf('push.send');
    expect(jobs.map((j) => j.payload.userId).sort()).toEqual([a.userId, b.userId].sort());
    expect(jobs[0]!.payload).toMatchObject({ body: 'Шинэ яриа', data: { episodeId: episode.id } });
  });

  it('pushText replaces the body', async () => {
    const admin = await makeAdmin(app);
    await member('a@example.com');
    const category = await makeCategory();
    const episode = await makeEpisode(category.id, { status: 'DRAFT', title: 'Гарчиг' });
    await testDb.episode.update({ where: { id: episode.id }, data: { pushText: 'Богино текст' } });
    await publish(admin.accessToken, episode.id);
    const jobs = await jobsOf('push.send');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload.body).toBe('Богино текст');
  });

  it('notifyOnPublish false queues nothing', async () => {
    const admin = await makeAdmin(app);
    await member('a@example.com');
    const category = await makeCategory();
    const episode = await makeEpisode(category.id, { status: 'DRAFT' });
    await testDb.episode.update({ where: { id: episode.id }, data: { notifyOnPublish: false } });
    expect((await publish(admin.accessToken, episode.id)).statusCode).toBe(200);
    expect(await jobsOf('push.send')).toHaveLength(0);
  });

  it('a failed publish queues nothing', async () => {
    const admin = await makeAdmin(app);
    await member('a@example.com');
    const category = await makeCategory();
    const live = await makeEpisode(category.id);
    expect((await publish(admin.accessToken, live.id)).statusCode).toBe(409);
    expect(await jobsOf('push.send')).toHaveLength(0);
  });

  it('bulk publish of 3 items queues one combined push per member', async () => {
    const admin = await makeAdmin(app);
    const a = await member('a@example.com');
    const category = await makeCategory();
    const items = await Promise.all(
      [1, 2, 3].map(() => makeEpisode(category.id, { status: 'DRAFT' })),
    );
    const res = await call(app, 'POST', '/v1/admin/episodes/bulk', admin.accessToken, {
      ids: items.map((i) => i.id),
      action: { type: 'publish' },
    });
    expect(res.statusCode).toBe(200);
    const jobs = await jobsOf('push.send');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({
      userId: a.userId,
      body: '3 шинэ анги нэмэгдлээ',
      data: {},
    });
  });
});

describe('cron publish', () => {
  const due = () => new Date(Date.now() - 60_000);

  it('publishes a scheduled VIDEO item', async () => {
    const category = await makeCategory();
    const video = await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: due(),
      kind: 'VIDEO',
    });
    const out = await publishScheduledEpisodes.run({ db: testDb, now: new Date() });
    expect(out.affected).toBe(1);
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: video.id } })).status).toBe(
      'PUBLISHED',
    );
  });

  it('two ticks queue the push once, combined for the tick', async () => {
    const a = await member('a@example.com');
    const category = await makeCategory();
    await makeEpisode(category.id, { status: 'SCHEDULED', scheduledFor: due() });
    await makeEpisode(category.id, { status: 'SCHEDULED', scheduledFor: due(), kind: 'VIDEO' });
    const now = new Date();
    expect((await publishScheduledEpisodes.run({ db: testDb, now })).affected).toBe(2);
    expect((await publishScheduledEpisodes.run({ db: testDb, now })).affected).toBe(0);
    const jobs = await jobsOf('push.send');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({
      userId: a.userId,
      body: '2 шинэ анги нэмэгдлээ',
    });
  });

  it('a single scheduled item pushes its own title', async () => {
    await member('a@example.com');
    const category = await makeCategory();
    const ep = await makeEpisode(category.id, {
      status: 'SCHEDULED',
      scheduledFor: due(),
      title: 'Төлөвлөсөн',
    });
    await publishScheduledEpisodes.run({ db: testDb, now: new Date() });
    const jobs = await jobsOf('push.send');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toMatchObject({ body: 'Төлөвлөсөн', data: { episodeId: ep.id } });
  });
});

describe('logout', () => {
  it("clears this device's push token", async () => {
    const user = await member('a@example.com');
    await testDb.device.updateMany({
      where: { userId: user.userId },
      data: { pushToken: 'ExponentPushToken[abc]' },
    });
    await post(app, '/v1/auth/logout', { refreshToken: user.refreshToken });
    expect(
      await testDb.device.count({ where: { userId: user.userId, pushToken: { not: null } } }),
    ).toBe(0);
  });
});
