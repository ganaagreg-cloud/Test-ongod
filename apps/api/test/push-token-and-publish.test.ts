import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { publishScheduledEpisodes } from '../src/cron/tasks';
import { JobRegistry } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import { createNewEpisodePushJob, type PushMessage, type PushSender } from '../src/push';
import { authApp } from './auth-helpers';
import { call, makeAdmin, makeMember } from './admin-helpers';
import { HOUR, makeCategory, makeEpisode, setAccess } from './catalog-helpers';
import { testDb } from './helpers';

const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

let app: FastifyInstance;
beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const jobsOf = (type: string) => testDb.job.findMany({ where: { type } });
const tokenOf = async (userId: string) =>
  (await testDb.device.findFirstOrThrow({ where: { userId } })).pushToken;

describe('PUT /v1/me/devices/current/push-token (audit B-01)', () => {
  const put = (token: string | undefined, body: unknown) =>
    call(app, 'PUT', '/v1/me/devices/current/push-token', token, body);

  it('needs a signed-in user', async () => {
    expect((await put(undefined, { pushToken: TOKEN_A })).statusCode).toBe(401);
  });

  it('stores the token on the calling device, replaces it and clears it with null', async () => {
    const member = await makeMember(app);
    expect((await put(member.accessToken, { pushToken: TOKEN_A })).statusCode).toBe(204);
    expect(await tokenOf(member.userId)).toBe(TOKEN_A);
    expect((await put(member.accessToken, { pushToken: TOKEN_B })).statusCode).toBe(204);
    expect(await tokenOf(member.userId)).toBe(TOKEN_B);
    expect((await put(member.accessToken, { pushToken: null })).statusCode).toBe(204);
    expect(await tokenOf(member.userId)).toBeNull();
  });

  it('refuses anything that is not an Expo push token', async () => {
    const member = await makeMember(app);
    for (const bad of ['', 'abc', 'ExponentPushToken[', 'https://evil.example', 5, undefined]) {
      const res = await put(member.accessToken, { pushToken: bad });
      expect(res.statusCode, String(bad)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    expect(await tokenOf(member.userId)).toBeNull();
  });

  it('moves a token that another account had on the same phone', async () => {
    const a = await makeMember(app, 'a@example.com');
    const b = await makeMember(app, 'b@example.com');
    await put(a.accessToken, { pushToken: TOKEN_A });
    await put(b.accessToken, { pushToken: TOKEN_A });
    expect(await tokenOf(b.userId)).toBe(TOKEN_A);
    expect(await tokenOf(a.userId)).toBeNull();
  });
});

describe('new episode push (audit B-02)', () => {
  async function readyEpisode(status: 'DRAFT' | 'SCHEDULED' = 'DRAFT', scheduledFor?: Date) {
    const category = await makeCategory();
    return makeEpisode(category.id, {
      status,
      publishedAt: null,
      scheduledFor: scheduledFor ?? null,
    });
  }

  it('"publish now" queues exactly one push job, and a second publish queues none', async () => {
    const admin = await makeAdmin(app);
    const episode = await readyEpisode();
    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${episode.id}/publish`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(200);
    expect(await jobsOf('push.new-episode')).toHaveLength(1);
    const again = await call(
      app,
      'POST',
      `/v1/admin/episodes/${episode.id}/publish`,
      admin.accessToken,
    );
    expect(again.statusCode).toBe(409);
    expect(await jobsOf('push.new-episode')).toHaveLength(1);
  });

  it('an episode that is not ready (no audio) is not published and sends no push', async () => {
    const admin = await makeAdmin(app);
    const category = await makeCategory();
    const episode = await makeEpisode(category.id, {
      status: 'DRAFT',
      publishedAt: null,
      media: 'NONE',
    });
    const res = await call(
      app,
      'POST',
      `/v1/admin/episodes/${episode.id}/publish`,
      admin.accessToken,
    );
    expect(res.statusCode).toBe(409);
    expect(await jobsOf('push.new-episode')).toHaveLength(0);
  });

  it('the scheduled publish goes live once, never before its time, and queues one push', async () => {
    const t0 = new Date('2030-06-01T10:00:00Z');
    const episode = await readyEpisode('SCHEDULED', t0);
    const run = (at: Date) =>
      publishScheduledEpisodes.run({ db: testDb, now: at } as Parameters<
        typeof publishScheduledEpisodes.run
      >[0]);

    await run(new Date(t0.getTime() - 1000));
    expect((await testDb.episode.findUniqueOrThrow({ where: { id: episode.id } })).status).toBe(
      'SCHEDULED',
    );
    expect(await jobsOf('push.new-episode')).toHaveLength(0);

    expect((await run(new Date(t0.getTime() + 1000))).affected).toBe(1);
    expect((await run(new Date(t0.getTime() + 60_000))).affected).toBe(0);
    const row = await testDb.episode.findUniqueOrThrow({ where: { id: episode.id } });
    expect(row.status).toBe('PUBLISHED');
    expect(row.publishedAt?.toISOString()).toBe(t0.toISOString());
    expect(await jobsOf('push.new-episode')).toHaveLength(1);
  });

  describe('the job', () => {
    const quiet = pino({ level: 'silent' });
    const workerFor = (sender: PushSender) =>
      new JobWorker(
        testDb,
        new JobRegistry().register(createNewEpisodePushJob(testDb, sender)),
        quiet,
        {
          pollIntervalMs: 100,
        },
      );
    const capture = () => {
      const sent: PushMessage[] = [];
      const sender: PushSender = {
        async send(messages) {
          sent.push(...messages);
          return { deadTokens: [] };
        },
      };
      return { sent, sender };
    };

    it('reaches users whose access is active, and nobody else', async () => {
      const active = await makeMember(app, 'active@example.com');
      const expired = await makeMember(app, 'expired@example.com');
      const none = await makeMember(app, 'none@example.com');
      const disabled = await makeMember(app, 'disabled@example.com');
      await setAccess(active.userId, new Date(Date.now() + 24 * HOUR));
      await setAccess(expired.userId, new Date(Date.now() - HOUR));
      await setAccess(disabled.userId, new Date(Date.now() + 24 * HOUR));
      await testDb.user.update({ where: { id: disabled.userId }, data: { status: 'DISABLED' } });
      let n = 0;
      for (const u of [active, expired, none, disabled]) {
        n++;
        await testDb.device.updateMany({
          where: { userId: u.userId },
          data: { pushToken: `ExponentPushToken[user${n}xxxxxxxxxxxxxxxx]` },
        });
      }
      const category = await makeCategory();
      const episode = await makeEpisode(category.id, { title: 'Шинэ дугаар 7' });

      const { sent, sender } = capture();
      const { enqueueNewEpisodePush } = await import('../src/push');
      await enqueueNewEpisodePush(testDb, episode.id);
      await workerFor(sender).drain(5000);

      expect(sent.map((m) => m.to)).toEqual(['ExponentPushToken[user1xxxxxxxxxxxxxxxx]']);
      expect(sent[0]).toMatchObject({
        body: 'Шинэ дугаар 7',
        data: { type: 'new-episode', episodeId: episode.id },
      });
      expect((await jobsOf('push.new-episode'))[0]!.status).toBe('DONE');
    });

    it('sends nothing for an episode that is not published (archived or deleted since)', async () => {
      const member = await makeMember(app);
      await setAccess(member.userId, new Date(Date.now() + 24 * HOUR));
      await testDb.device.updateMany({
        where: { userId: member.userId },
        data: { pushToken: TOKEN_A },
      });
      const category = await makeCategory();
      const archived = await makeEpisode(category.id, { status: 'ARCHIVED' });
      const send = vi.fn(async () => ({ deadTokens: [] as string[] }));
      const { enqueueNewEpisodePush } = await import('../src/push');
      await enqueueNewEpisodePush(testDb, archived.id);
      await enqueueNewEpisodePush(testDb, 'does-not-exist');
      await workerFor({ send }).drain(5000);
      expect(send).not.toHaveBeenCalled();
    });
  });
});
