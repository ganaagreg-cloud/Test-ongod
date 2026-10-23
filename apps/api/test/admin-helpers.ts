import type { FastifyInstance } from 'fastify';
import { generateReferenceCode } from '../src/subscriptions/period';
import { authApp, device, signedIn, type Signed } from './auth-helpers';
import { testDb, type testEnv } from './helpers';

export const DAY = 86_400_000;

/** An app for the payment and admin tests, optionally with a fixed clock. */
export async function paymentApp(
  opts: { now?: () => Date; env?: Parameters<typeof testEnv>[0] } = {},
) {
  const app = await authApp(opts.env ?? {}, opts.now ? { now: opts.now } : {});
  return { app };
}

export const call = (
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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

export async function makePlan(
  over: { name?: string; durationDays?: number; priceMnt?: number; active?: boolean } = {},
) {
  return testDb.plan.create({
    data: {
      name: over.name ?? 'Жилийн эрх',
      durationDays: over.durationDays ?? 365,
      priceMnt: over.priceMnt ?? 100_000,
      active: over.active ?? true,
    },
  });
}

/** A registered, signed-in member whose email is verified (needed to apply, SPEC A). */
export async function makeMember(
  app: FastifyInstance,
  email = 'member@example.com',
  opts: {
    verified?: boolean;
    username?: string;
    names?: { firstName?: string; lastName?: string; phone?: string };
  } = {},
): Promise<Signed> {
  const signed = await signedIn(app, {
    email,
    device: device(email),
    ...(opts.username ? { username: opts.username } : {}),
  });
  await testDb.user.update({
    where: { id: signed.userId },
    data: {
      ...(opts.verified === false ? {} : { emailVerifiedAt: new Date() }),
      ...(opts.names ?? {}),
    },
  });
  return signed;
}

/** A signed-in admin or owner (password login only, ADR-0040). */
export async function makeAdmin(
  app: FastifyInstance,
  opts: {
    email?: string;
    role?: 'ADMIN' | 'OWNER';
    /** 'web' (default) keeps the refresh token in a cookie; a native platform returns it in the body. */
    platform?: 'web' | 'ios' | 'android';
  } = {},
): Promise<Signed> {
  const email = opts.email ?? 'admin@example.com';
  const signed = await signedIn(app, {
    email,
    device: device(`admin-${email}`, opts.platform ?? 'web'),
  });
  await testDb.user.update({
    where: { id: signed.userId },
    data: { role: opts.role ?? 'ADMIN', emailVerifiedAt: new Date() },
  });
  return signed;
}

/** An ACTIVE period, as if paid earlier; keeps the user.accessUntil cache in step. */
export async function makeActive(userId: string, planId: string, startsAt: Date, endsAt: Date) {
  const sub = await testDb.subscription.create({
    data: {
      userId,
      planId,
      status: 'ACTIVE',
      referenceCode: generateReferenceCode(),
      amountMnt: 100_000,
      startsAt,
      endsAt,
    },
  });
  await testDb.user.update({ where: { id: userId }, data: { accessUntil: endsAt } });
  return sub;
}

/** multipart/form-data for app.inject, built with the platform's FormData. */
export async function multipart(
  fields: Record<string, string>,
  file?: { name: string; data: Buffer; type?: string; field?: string },
) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) {
    form.append(
      file.field ?? 'cover',
      new Blob([new Uint8Array(file.data)], { type: file.type ?? 'image/jpeg' }),
      file.name,
    );
  }
  const res = new Response(form);
  return {
    payload: Buffer.from(await res.arrayBuffer()),
    headers: { 'content-type': res.headers.get('content-type')! },
  };
}

export const jobsOf = async (type: string) =>
  (await testDb.job.findMany({ where: { type }, orderBy: { runAt: 'asc' } })).map((j) => ({
    ...j,
    payload: JSON.parse(j.payload) as Record<string, unknown> & {
      to?: string;
      template?: string;
      userId?: string;
    },
  }));

/** Email jobs other than the sign-up code that every test user's registration queues. */
export const notifyEmails = async () =>
  (await jobsOf('email.send')).filter((j) => j.payload.template !== 'verifyEmail');
