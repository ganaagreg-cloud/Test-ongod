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
import { testApp, testDb } from './helpers';
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
    expect(await sender.send(messages)).toEqual({ deadTokens: [] });

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

  it('throws on an HTTP error so the job is retried', async () => {
    const fetchFn = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const sender = createExpoPushSender({ EXPO_ACCESS_TOKEN: undefined }, fetchFn);
    await expect(sender.send([{ to: TOKEN_A, title: 't', body: 'b' }])).rejects.toThrow('HTTP 500');
  });
});
