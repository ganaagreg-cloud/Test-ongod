import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { generateSecret, generateSync } from 'otplib';
import { createReceiptStore, type ReceiptStore } from '../src/subscriptions/receipts';
import { generateReferenceCode } from '../src/subscriptions/period';
import { authApp, device, signedIn, type Signed } from './auth-helpers';
import { testDb, type testEnv } from './helpers';

export const DAY = 86_400_000;

/** A JPEG-looking file: the API only checks the first bytes. */
export const jpeg = (size = 1024) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, size - 4), 7)]);
export const png = () =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 1),
  ]);

/** An app with its own empty receipts folder, so tests can look at what was stored. */
export async function paymentApp(
  opts: { now?: () => Date; env?: Parameters<typeof testEnv>[0] } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), 'ongod-receipts-'));
  const receipts: ReceiptStore = createReceiptStore(dir);
  const app = await authApp(opts.env ?? {}, { receipts, ...(opts.now ? { now: opts.now } : {}) });
  return { app, dir, receipts };
}

export const call = (
  app: FastifyInstance,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
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

export type TotpState = 'none' | 'enabled' | 'verified';

/**
 * A signed-in admin. 'none' = never set up TOTP, 'enabled' = set up but this session has not
 * passed the check, 'verified' = this session passed it (what the admin API needs).
 */
export async function makeAdmin(
  app: FastifyInstance,
  opts: {
    email?: string;
    role?: 'ADMIN' | 'OWNER';
    totp?: TotpState;
    /** 'web' (default) keeps the refresh token in a cookie; a native platform returns it in the body. */
    platform?: 'web' | 'ios' | 'android';
  } = {},
): Promise<Signed & { secret: string | null }> {
  const email = opts.email ?? 'admin@example.com';
  const totp = opts.totp ?? 'verified';
  const signed = await signedIn(app, {
    email,
    device: device(`admin-${email}`, opts.platform ?? 'web'),
  });
  const secret = totp === 'none' ? null : generateSecret();
  await testDb.user.update({
    where: { id: signed.userId },
    data: {
      role: opts.role ?? 'ADMIN',
      emailVerifiedAt: new Date(),
      ...(secret ? { totpSecret: secret, totpEnabledAt: new Date() } : {}),
    },
  });
  if (totp === 'verified') {
    await testDb.session.updateMany({
      where: { userId: signed.userId },
      data: { totpVerifiedAt: new Date() },
    });
  }
  return { ...signed, secret };
}

/** A valid TOTP code; `stepsAhead` picks a later 30 s step (a code that was not used before). */
export const totpCode = (secret: string, stepsAhead = 0) =>
  generateSync({ secret, epoch: Math.floor(Date.now() / 1000) + stepsAhead * 30 });

/** A subscription waiting in the admin queue. */
export async function makeSubmitted(
  userId: string,
  planId: string,
  over: {
    amountMnt?: number;
    submittedAt?: Date;
    proofImagePath?: string | null;
    payerNote?: string;
  } = {},
) {
  return testDb.subscription.create({
    data: {
      userId,
      planId,
      status: 'PAYMENT_SUBMITTED',
      referenceCode: generateReferenceCode(),
      amountMnt: over.amountMnt ?? 100_000,
      submittedAt: over.submittedAt ?? new Date(),
      transferAt: new Date(),
      payerNote: over.payerNote ?? null,
      proofImagePath: over.proofImagePath ?? null,
    },
  });
}

/** An ACTIVE period, as if approved earlier; keeps the user.accessUntil cache in step. */
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
      file.field ?? 'receipt',
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
