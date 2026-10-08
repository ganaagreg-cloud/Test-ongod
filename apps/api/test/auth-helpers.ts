import type { FastifyInstance } from 'fastify';
import { testApp, testDb, testEnv } from './helpers';

export const PASSWORD = 'correct-horse-1';

export const person = {
  lastName: 'Бат',
  firstName: 'Эрдэнэ',
  phone: '99112233',
  password: PASSWORD,
};

export const device = (n: number | string, platform = 'android') => ({
  deviceId: `device-${n}-0123456789`,
  platform,
  model: `Phone ${n}`,
});

export function authApp(env: Parameters<typeof testEnv>[0] = {}, rest = {}) {
  return testApp({ env: testEnv(env), ...rest });
}

export const post = (app: FastifyInstance, url: string, payload?: unknown, token?: string) =>
  app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

export const send = (
  app: FastifyInstance,
  method: 'GET' | 'DELETE' | 'POST',
  url: string,
  token?: string,
  payload?: unknown,
) =>
  app.inject({
    method,
    url,
    payload: payload as object,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

export const register = (app: FastifyInstance, over: Record<string, unknown> = {}) =>
  post(app, '/v1/auth/register', { ...person, email: 'bat@example.com', ...over });

/** The code in the newest email queued for this address (emails go through the Job table). */
export async function lastCode(to: string): Promise<string> {
  const jobs = await testDb.job.findMany({
    where: { type: 'email.send' },
    orderBy: { id: 'desc' },
  });
  for (const job of jobs) {
    const payload = JSON.parse(job.payload) as { to: string; params: { code?: string } };
    if (payload.to === to && payload.params.code) return payload.params.code;
  }
  throw new Error(`no email with a code queued for ${to}`);
}

export async function emailsTo(to: string) {
  const jobs = await testDb.job.findMany({ where: { type: 'email.send' } });
  return jobs
    .map((j) => JSON.parse(j.payload) as { to: string; template: string })
    .filter((p) => p.to === to);
}

/** Moves the issue time of a user's codes back, so the resend cooldown has passed. */
export async function passCooldown(email: string) {
  const user = await testDb.user.findUniqueOrThrow({ where: { email } });
  const codes = await testDb.emailCode.findMany({ where: { userId: user.id } });
  for (const c of codes) {
    await testDb.emailCode.update({
      where: { id: c.id },
      data: { expiresAt: new Date(c.expiresAt.getTime() - 61_000) },
    });
  }
}

export async function expireCodes(email: string) {
  const user = await testDb.user.findUniqueOrThrow({ where: { email } });
  await testDb.emailCode.updateMany({
    where: { userId: user.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}

export async function login(
  app: FastifyInstance,
  identifier: string,
  dev = device(1),
  extra: Record<string, unknown> = {},
  password = PASSWORD,
) {
  return post(app, '/v1/auth/login', { identifier, password, ...dev, ...extra });
}

export interface Signed {
  accessToken: string;
  refreshToken: string;
  userId: string;
  deviceId: string;
}

/** Registers (and optionally verifies) a user, then logs in on the given device. */
export async function signedIn(
  app: FastifyInstance,
  opts: { email?: string; username?: string; device?: ReturnType<typeof device> } = {},
): Promise<Signed> {
  const email = opts.email ?? 'bat@example.com';
  const dev = opts.device ?? device(1);
  const reg = await register(app, { email, ...(opts.username ? { username: opts.username } : {}) });
  if (reg.statusCode !== 201) throw new Error(`register failed: ${reg.body}`);
  const res = await login(app, email, dev);
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  const body = res.json();
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    userId: body.user.id,
    deviceId: dev.deviceId,
  };
}

/** Logs an existing user in on another device. */
export async function loginOn(app: FastifyInstance, email: string, dev: ReturnType<typeof device>) {
  const res = await login(app, email, dev);
  if (res.statusCode !== 200) throw new Error(`login failed: ${res.body}`);
  return res.json() as { accessToken: string; refreshToken: string };
}
