import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { enqueue } from '../src/jobs/queue';
import { JobRegistry } from '../src/jobs/registry';
import { JobWorker } from '../src/jobs/worker';
import {
  createExpoPushSender,
  createPushJob,
  enqueuePush,
  type PushMessage,
  type PushSender,
} from '../src/push';
import { CRON_SECRET, testApp, testDb } from './helpers';
import { makeMember } from './admin-helpers';

const quiet = pino({ level: 'silent' });
const TOKEN_A = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const TOKEN_B = 'ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]';

async function setup() {
  const app = await testApp();
  const member = await makeMember(app);
  await app.close();
  return member;
}

function workerFor(sender: PushSender) {
  const registry = new JobRegistry().register(createPushJob(testDb, sender));
  return new JobWorker(testDb, registry, quiet, { pollIntervalMs: 100 });
}

describe('push job', () => {
  it('sends to every device of the user that has an Expo token, and to nobody else', async () => {
    const member = await setup();
    const other = await makeMember(await testApp(), 'other@example.com');
    await testDb.device.updateMany({
      where: { userId: member.userId },
      data: { pushToken: TOKEN_A },
    });
    await testDb.device.create({
      data: {
        userId: member.userId,
        deviceId: 'second-device-01',
        platform: 'ios',
        pushToken: TOKEN_B,
      },
    });
    await testDb.device.updateMany({
      where: { userId: other.userId },
      data: { pushToken: 'ExponentPushToken[other]' },
    });

    const sent: PushMessage[] = [];
    const worker = workerFor({
      async send(messages) {
        sent.push(...messages);
        return { deadTokens: [] };
      },
    });
    await enqueuePush(testDb, {
      userId: member.userId,
      title: 'T',
      body: 'B',
      data: { type: 'x' },
    });
    await worker.drain(5000);

    expect(sent.map((m) => m.to).sort()).toEqual([TOKEN_A, TOKEN_B]);
    expect(sent[0]).toMatchObject({ title: 'T', body: 'B', data: { type: 'x' } });
    expect((await testDb.job.findFirstOrThrow({ where: { type: 'push.send' } })).status).toBe(
      'DONE',
    );
  });

  it('is a no-op for a user with no push token, and ignores tokens that are not Expo tokens', async () => {
    const member = await setup();
    await testDb.device.updateMany({
      where: { userId: member.userId },
      data: { pushToken: 'not-a-token' },
    });
    const send = vi.fn(async () => ({ deadTokens: [] as string[] }));
    const worker = workerFor({ send });
    await enqueuePush(testDb, { userId: member.userId, title: 'T', body: 'B' });
    await worker.drain(5000);
    expect(send).not.toHaveBeenCalled();
    expect((await testDb.job.findFirstOrThrow({ where: { type: 'push.send' } })).status).toBe(
      'DONE',
    );
  });

  it('forgets tokens that Expo reports as dead', async () => {
    const member = await setup();
    await testDb.device.updateMany({
      where: { userId: member.userId },
      data: { pushToken: TOKEN_A },
    });
    const worker = workerFor({ send: async () => ({ deadTokens: [TOKEN_A] }) });
    await enqueuePush(testDb, { userId: member.userId, title: 'T', body: 'B' });
    await worker.drain(5000);
    expect(
      (await testDb.device.findFirstOrThrow({ where: { userId: member.userId } })).pushToken,
    ).toBeNull();
  });

  it('retries when the push service fails', async () => {
    const member = await setup();
    await testDb.device.updateMany({
      where: { userId: member.userId },
      data: { pushToken: TOKEN_A },
    });
    const worker = workerFor({
      async send() {
        throw new Error('Expo push failed: HTTP 503');
      },
    });
    await enqueuePush(testDb, { userId: member.userId, title: 'T', body: 'B' });
    await worker.drain(2000);
    const job = await testDb.job.findFirstOrThrow({ where: { type: 'push.send' } });
    expect(job.status).toBe('QUEUED');
    expect(job.attempts).toBe(1);
    expect(job.lastError).toContain('503');
  });

  it('a refused ticket (rate limit) is retried later for that device only (re-audit)', async () => {
    const member = await setup();
    await testDb.device.updateMany({
      where: { userId: member.userId },
      data: { pushToken: TOKEN_A },
    });
    await testDb.device.create({
      data: {
        userId: member.userId,
        deviceId: 'second-device-01',
        platform: 'ios',
        pushToken: TOKEN_B,
      },
    });
    const sent: string[][] = [];
    const worker = workerFor({
      async send(messages) {
        sent.push(messages.map((m) => m.to));
        return { deadTokens: [], failedTokens: [TOKEN_B] };
      },
    });
    await enqueuePush(testDb, { userId: member.userId, title: 'T', body: 'B' });
    await worker.drain(5000);

    const jobs = await testDb.job.findMany({
      where: { type: 'push.send' },
      orderBy: { runAt: 'asc' },
    });
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.status).toBe('DONE');
    const retry = jobs[1]!;
    expect(retry.status).toBe('QUEUED');
    expect(retry.runAt.getTime()).toBeGreaterThan(Date.now());
    expect(JSON.parse(retry.payload)).toMatchObject({ tokens: [TOKEN_B], round: 1 });

    // The retry goes to the refused device only; after the last round nothing more is queued.
    await testDb.job.update({ where: { id: retry.id }, data: { runAt: new Date(0) } });
    await worker.drain(5000);
    expect(sent[1]).toEqual([TOKEN_B]);
    await testDb.job.updateMany({ where: { status: 'QUEUED' }, data: { runAt: new Date(0) } });
    await worker.drain(5000);
    await testDb.job.updateMany({ where: { status: 'QUEUED' }, data: { runAt: new Date(0) } });
    await worker.drain(5000);
    expect(sent).toHaveLength(4);
    expect(await testDb.job.count({ where: { type: 'push.send', status: 'QUEUED' } })).toBe(0);
  });

  it('validates the payload when it is queued', async () => {
    await expect(enqueuePush(testDb, { userId: '', title: 'T', body: 'B' })).rejects.toThrow();
    await expect(enqueuePush(testDb, { userId: 'u', title: '', body: 'B' })).rejects.toThrow();
    expect(await testDb.job.count({ where: { type: 'push.send' } })).toBe(0);
    void enqueue;
  });
});

describe('Expo sender', () => {
  const ok = (n: number) =>
    new Response(JSON.stringify({ data: Array.from({ length: n }, () => ({ status: 'ok' })) }));

  it('posts JSON to the Expo push endpoint, 100 messages per request, with the optional token', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchFn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return ok((JSON.parse(init.body as string) as unknown[]).length);
    }) as unknown as typeof fetch;

    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: 'secret-token' }, fetchFn);
    const messages = Array.from({ length: 250 }, (_, i) => ({
      to: `ExponentPushToken[${i}]`,
      title: 't',
      body: 'b',
    }));
    expect(await sender.send(messages)).toEqual({ deadTokens: [], failedTokens: [] });

    expect(calls.map((c) => JSON.parse(c.init.body as string).length)).toEqual([100, 100, 50]);
    expect(calls[0]!.url).toBe('https://exp.host/--/api/v2/push/send');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(
      'Bearer secret-token',
    );
  });

  it('sends no Authorization header without a token, and reports DeviceNotRegistered tokens', async () => {
    let headers: Record<string, string> = {};
    const fetchFn = (async (_url: string, init: RequestInit) => {
      headers = init.headers as Record<string, string>;
      return new Response(
        JSON.stringify({
          data: [
            { status: 'ok' },
            { status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } },
          ],
        }),
      );
    }) as unknown as typeof fetch;
    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: undefined }, fetchFn);
    const result = await sender.send([
      { to: TOKEN_A, title: 't', body: 'b' },
      { to: TOKEN_B, title: 't', body: 'b' },
    ]);
    expect(headers.authorization).toBeUndefined();
    expect(result.deadTokens).toEqual([TOKEN_B]);
  });

  it('reports a ticket refused for another reason as failed, not dead (re-audit)', async () => {
    const fetchFn = (async () =>
      new Response(
        JSON.stringify({
          data: [
            { status: 'error', message: 'slow down', details: { error: 'MessageRateExceeded' } },
            { status: 'ok' },
          ],
        }),
      )) as unknown as typeof fetch;
    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: undefined }, fetchFn);
    const result = await sender.send([
      { to: TOKEN_A, title: 't', body: 'b' },
      { to: TOKEN_B, title: 't', body: 'b' },
    ]);
    expect(result).toEqual({ deadTokens: [], failedTokens: [TOKEN_A] });
  });

  it('throws on an HTTP error so the job is retried', async () => {
    const fetchFn = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: undefined }, fetchFn);
    await expect(sender.send([{ to: TOKEN_A, title: 't', body: 'b' }])).rejects.toThrow('HTTP 500');
  });
});

describe('notifications: the bell on Нүүр (ADR-0099)', () => {
  it('keeps every push as a notification, shows it to its member only, and marks it read once', async () => {
    const app = await testApp();
    const a = await makeMember(app, 'a@example.com');
    const b = await makeMember(app, 'b@example.com');
    await enqueuePush(testDb, {
      userId: a.userId,
      title: 'Шинэ анги',
      body: 'Нэг',
      data: { episodeId: 'ep1' },
    });
    await enqueuePush(testDb, {
      userId: a.userId,
      title: 'Эрх идэвхжлээ',
      body: 'Хоёр',
      data: { type: 'access_granted' },
    });
    await enqueuePush(testDb, { userId: b.userId, title: 'Бусад', body: 'Гурав' });

    const get = (token: string) =>
      app.inject({
        method: 'GET',
        url: '/v1/me/notifications',
        headers: { authorization: `Bearer ${token}` },
      });
    expect((await app.inject({ method: 'GET', url: '/v1/me/notifications' })).statusCode).toBe(401);
    const mine = (await get(a.accessToken)).json();
    expect(mine.unread).toBe(2);
    expect(mine.items.map((n: { body: string }) => n.body).sort()).toEqual(['Нэг', 'Хоёр']);
    expect(mine.items.find((n: { body: string }) => n.body === 'Нэг')).toMatchObject({
      episodeId: 'ep1',
      read: false,
    });
    expect(mine.items.find((n: { body: string }) => n.body === 'Хоёр').episodeId).toBeNull();
    expect((await get(b.accessToken)).json().items).toHaveLength(1);

    const read = () =>
      app.inject({
        method: 'POST',
        url: '/v1/me/notifications/read',
        headers: { authorization: `Bearer ${a.accessToken}` },
      });
    expect((await read()).statusCode).toBe(204);
    expect((await read()).statusCode).toBe(204);
    const after = (await get(a.accessToken)).json();
    expect(after.unread).toBe(0);
    expect(after.items.every((n: { read: boolean }) => n.read)).toBe(true);
    // Another member's notifications were not touched.
    expect((await get(b.accessToken)).json().unread).toBe(1);
  });

  it('the cron removes notifications older than 90 days', async () => {
    const app = await testApp();
    const a = await makeMember(app, 'a@example.com');
    const old = new Date(Date.now() - 91 * 86_400_000);
    await testDb.notification.create({
      data: { userId: a.userId, title: 'Хуучин', body: 'x', createdAt: old },
    });
    await testDb.notification.create({ data: { userId: a.userId, title: 'Шинэ', body: 'y' } });
    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    expect(res.json().tasks.purgeOldNotifications).toEqual({ affected: 1 });
    expect(await testDb.notification.count()).toBe(1);
  });
});
