import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mn } from '../src/i18n/mn';
import { STUCK_UPLOAD_MS } from '@ongod/shared';
import { ubMonthStart } from '../src/lib/dates';
import { generateReferenceCode } from '../src/subscriptions/period';
import { makeCategory, makeEpisode } from './catalog-helpers';
import { testDb } from './helpers';
import {
  DAY,
  call,
  jobsOf,
  notifyEmails,
  makeAdmin,
  makeMember,
  makePlan,
  paymentApp,
} from './admin-helpers';
import type { Signed } from './auth-helpers';

let app: FastifyInstance;
let admin: Signed;

beforeEach(async () => {
  ({ app } = await paymentApp());
  admin = await makeAdmin(app);
});
afterEach(async () => {
  await app.close();
});

const revoke = (id: string, body?: unknown) =>
  call(app, 'POST', `/v1/admin/subscriptions/${id}/revoke`, admin.accessToken, body);
const grant = (userId: string, body: unknown) =>
  call(app, 'POST', `/v1/admin/users/${userId}/grants`, admin.accessToken, body);
const get = (url: string) => call(app, 'GET', url, admin.accessToken);
const ms = (iso: string) => Date.parse(iso);

const userRow = (id: string) => testDb.user.findUniqueOrThrow({ where: { id } });

/** A member pays a plan at the mock QPay checkout (ADR-0041): ACTIVE, with a QPAY payment. */
async function paid(
  member: Signed,
  planId: string,
): Promise<{ id: string; referenceCode: string }> {
  const created = await call(app, 'POST', '/v1/subscriptions', member.accessToken, { planId });
  expect(created.statusCode).toBe(201);
  const { id } = created.json().subscription;
  const res = await call(app, 'POST', `/v1/subscriptions/${id}/mock`, member.accessToken, {
    outcome: 'success',
  });
  expect(res.json().subscription.status).toBe('ACTIVE');
  return res.json().subscription;
}

/** A manual grant by the admin; returns the new subscription. */
async function granted(userId: string, planId: string) {
  const res = await grant(userId, { planId });
  expect(res.statusCode).toBe(201);
  return res.json().subscription as { id: string; referenceCode: string; endsAt: string };
}

describe('revoke (SPEC E)', () => {
  it('ends access at once and clears the cache; the audit entry keeps the reason', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await paid(member, plan.id);

    const res = await revoke(sub.id, { reason: 'Буцаалт хийсэн' });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription.status).toBe('REVOKED');
    expect((await userRow(member.userId)).accessUntil).toBeNull();

    const log = await testDb.auditLog.findFirstOrThrow({
      where: { action: 'subscription.revoke' },
    });
    expect(log.data).toMatchObject({
      reason: 'Буцаалт хийсэн',
      refund: false,
      userId: member.userId,
    });
    // Not a refund unless the admin says so.
    expect((await testDb.payment.findFirstOrThrow()).status).toBe('COMPLETED');
  });

  it('marks the payment REFUNDED when asked', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await paid(member, plan.id);
    await revoke(sub.id, { reason: 'refund', refund: true });
    expect((await testDb.payment.findFirstOrThrow()).status).toBe('REFUNDED');
  });

  it('stops playback: a member who could play gets 403 NO_ACCESS right after the revoke', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id);

    const sub = await granted(member.userId, plan.id);

    const play = () => call(app, 'POST', `/v1/episodes/${episode.id}/play`, member.accessToken);
    expect((await play()).statusCode).toBe(200);

    expect((await revoke(sub.id, { reason: 'fraud' })).statusCode).toBe(200);
    const after = await play();
    expect(after.statusCode).toBe(403);
    expect(after.json().error.code).toBe('NO_ACCESS');
  });

  it('a revoked QPay subscription stops playback too', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id);
    const sub = await paid(member, plan.id);

    const play = () => call(app, 'POST', `/v1/episodes/${episode.id}/play`, member.accessToken);
    expect((await play()).statusCode).toBe(200);
    await revoke(sub.id, { reason: 'fraud' });
    expect((await play()).json().error.code).toBe('NO_ACCESS');
  });

  it('keeps access that another ACTIVE period still gives', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const first = await granted(member.userId, plan.id);
    const second = await granted(member.userId, plan.id);

    await revoke(first.id, { reason: 'r' });
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(second.endsAt);
  });

  it('only ACTIVE can be revoked, and only once', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const { subscription } = (
      await call(app, 'POST', '/v1/subscriptions', member.accessToken, { planId: plan.id })
    ).json();
    expect((await revoke(subscription.id, { reason: 'r' })).statusCode).toBe(409);

    await call(app, 'POST', `/v1/subscriptions/${subscription.id}/mock`, member.accessToken, {
      outcome: 'success',
    });
    expect((await revoke(subscription.id, { reason: 'r' })).statusCode).toBe(200);
    expect((await revoke(subscription.id, { reason: 'r' })).statusCode).toBe(409);
    expect((await revoke('missing', { reason: 'r' })).statusCode).toBe(404);
    expect((await revoke(subscription.id, {})).statusCode).toBe(400);
  });
});

describe('manual grant (SPEC E)', () => {
  it('creates an ACTIVE subscription and a MANUAL_GRANT payment of 0, updates the cache, audits', async () => {
    const plan = await makePlan({ durationDays: 365 });
    const member = await makeMember(app);

    const res = await grant(member.userId, { planId: plan.id, note: 'Дэлгүүрийн шалгагч' });
    expect(res.statusCode).toBe(201);
    const dto = res.json().subscription;
    expect(dto).toMatchObject({ status: 'ACTIVE', amountMnt: 0 });
    expect(dto.referenceCode).toMatch(/^ONG-/);
    expect(ms(dto.endsAt) - ms(dto.startsAt)).toBe(365 * DAY);

    expect(await testDb.payment.findFirstOrThrow()).toMatchObject({
      method: 'MANUAL_GRANT',
      amountMnt: 0,
    });
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(dto.endsAt);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: 'subscription.grant' } });
    expect(log).toMatchObject({ actorId: admin.userId, targetId: dto.id });
    expect(log.data).toMatchObject({
      userId: member.userId,
      note: 'Дэлгүүрийн шалгагч',
      days: 365,
    });
  });

  it('days overrides the plan, and a grant adds to remaining access', async () => {
    const plan = await makePlan({ durationDays: 365 });
    const member = await makeMember(app);
    const a = (await grant(member.userId, { planId: plan.id, days: 14 })).json().subscription;
    expect(ms(a.endsAt) - ms(a.startsAt)).toBe(14 * DAY);
    const b = (await grant(member.userId, { planId: plan.id, days: 7 })).json().subscription;
    expect(b.startsAt).toBe(a.endsAt);
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(b.endsAt);
  });

  it('works for an inactive plan, but not an unknown plan, unknown user, deleted user or bad days', async () => {
    const hidden = await makePlan({ active: false });
    const member = await makeMember(app);
    expect((await grant(member.userId, { planId: hidden.id })).statusCode).toBe(201);
    expect((await grant(member.userId, { planId: 'nope' })).statusCode).toBe(404);
    expect((await grant('nope', { planId: hidden.id })).statusCode).toBe(404);
    for (const days of [0, -1, 3661, 1.5, '7']) {
      expect(
        (await grant(member.userId, { planId: hidden.id, days })).statusCode,
        String(days),
      ).toBe(400);
    }
    await testDb.user.update({ where: { id: member.userId }, data: { status: 'DELETED' } });
    expect((await grant(member.userId, { planId: hidden.id })).statusCode).toBe(404);
  });

  it('sends no email or push (not part of the workflow)', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    await grant(member.userId, { planId: plan.id });
    expect(await notifyEmails()).toHaveLength(0);
    expect(await jobsOf('push.send')).toHaveLength(0);
  });
});

describe('payments list and search', () => {
  /** A subscription row in a given state, created `ageDays` ago. */
  const row = (
    userId: string,
    planId: string,
    status: 'ACTIVE' | 'PENDING_PAYMENT' | 'REJECTED' | 'PAYMENT_SUBMITTED',
    ageDays: number,
  ) =>
    testDb.subscription.create({
      data: {
        userId,
        planId,
        status,
        referenceCode: generateReferenceCode(),
        amountMnt: 100_000,
        createdAt: new Date(Date.now() - ageDays * DAY),
      },
    });

  async function seed() {
    const plan = await makePlan();
    const ana = await makeMember(app, 'ana@example.com', {
      username: 'anaa',
      names: { firstName: 'Ану', lastName: 'Бат', phone: '99112233' },
    });
    const bold = await makeMember(app, 'bold@example.com', {
      username: 'boldoo',
      names: { firstName: 'Болд', lastName: 'Сүх', phone: '88001122' },
    });
    const s1 = await row(ana.userId, plan.id, 'ACTIVE', 2);
    const s2 = await row(bold.userId, plan.id, 'ACTIVE', 1);
    return { plan, ana, bold, s1, s2 };
  }

  it('lists ACTIVE by default, newest first, with user details and no file path', async () => {
    const { s1, s2, plan, ana } = await seed();
    await row(ana.userId, plan.id, 'PENDING_PAYMENT', 0);
    const res = await get('/v1/admin/subscriptions');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([s2.id, s1.id]);
    expect(body).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(body.items[1].user).toMatchObject({
      username: 'anaa',
      email: 'ana@example.com',
      phone: '99112233',
    });
    expect(JSON.stringify(body)).not.toContain('proofImagePath');
  });

  it('filters by status; the removed bank-transfer states are not a filter', async () => {
    const { plan, ana } = await seed();
    const pending = await row(ana.userId, plan.id, 'PENDING_PAYMENT', 0);
    const res = await get('/v1/admin/subscriptions?status=PENDING_PAYMENT');
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([pending.id]);
    expect((await get('/v1/admin/subscriptions?status=EXPIRED')).json().total).toBe(0);
    for (const status of ['BOGUS', 'PAYMENT_SUBMITTED', 'REJECTED']) {
      const bad = await get(`/v1/admin/subscriptions?status=${status}`);
      expect(bad.statusCode, status).toBe(400);
      expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('an old bank-transfer row still reads: GET /subscriptions/:id and the user view parse it', async () => {
    const { plan, ana } = await seed();
    const old = await row(ana.userId, plan.id, 'PAYMENT_SUBMITTED', 30);
    const rejected = await row(ana.userId, plan.id, 'REJECTED', 40);
    const one = await get(`/v1/admin/subscriptions/${old.id}`);
    expect(one.statusCode).toBe(200);
    expect(one.json().subscription.status).toBe('PAYMENT_SUBMITTED');
    const user = await get(`/v1/admin/users/${ana.userId}`);
    expect(user.statusCode).toBe(200);
    expect(user.json().subscriptions.map((s: { id: string }) => s.id)).toContain(rejected.id);
  });

  it('searches by reference code, username, email, phone and name', async () => {
    const { s1, s2 } = await seed();
    const find = async (q: string) =>
      (await get(`/v1/admin/subscriptions?q=${encodeURIComponent(q)}`))
        .json()
        .items.map((i: { id: string }) => i.id);

    expect(await find(s1.referenceCode)).toEqual([s1.id]);
    expect(await find(s2.referenceCode.toLowerCase())).toEqual([s2.id]);
    expect(await find(s1.referenceCode.slice(4, 7))).toContain(s1.id);
    expect(await find('anaa')).toEqual([s1.id]);
    expect(await find('bold@example')).toEqual([s2.id]);
    expect(await find('8800')).toEqual([s2.id]);
    expect(await find('Ану')).toEqual([s1.id]);
    expect(await find('сүх')).toEqual([s2.id]);
    expect(await find('Бат Ану')).toEqual([s1.id]); // last name + first name
    expect(await find('Бат Болд')).toEqual([]); // every word must match
    expect(await find('zzzz')).toEqual([]);
  });

  it('treats % and _ in a search as plain characters', async () => {
    await seed();
    for (const q of ['%', '_', '%%', 'a_a']) {
      const res = await get(`/v1/admin/subscriptions?q=${encodeURIComponent(q)}`);
      expect(res.json().items, q).toEqual([]);
    }
  });

  it('pages with page and limit, and caps the limit', async () => {
    const { s1, s2 } = await seed();
    const p1 = (await get('/v1/admin/subscriptions?limit=1&page=1')).json();
    const p2 = (await get('/v1/admin/subscriptions?limit=1&page=2')).json();
    expect(p1.items.map((i: { id: string }) => i.id)).toEqual([s2.id]);
    expect(p2.items.map((i: { id: string }) => i.id)).toEqual([s1.id]);
    expect(p1.total).toBe(2);
    expect((await get('/v1/admin/subscriptions?limit=1000')).statusCode).toBe(400);
    expect((await get('/v1/admin/subscriptions?page=0')).statusCode).toBe(400);
  });

  it('GET /subscriptions/:id returns one request, 404 for an unknown id', async () => {
    const { s1 } = await seed();
    expect((await get(`/v1/admin/subscriptions/${s1.id}`)).json().subscription.id).toBe(s1.id);
    expect((await get('/v1/admin/subscriptions/missing')).statusCode).toBe(404);
  });
});

describe('removed bank-transfer endpoints (ADR-0046)', () => {
  it('has no receipt, approve or reject endpoint: 404, and an old request stays as it was', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const old = await testDb.subscription.create({
      data: {
        userId: member.userId,
        planId: plan.id,
        status: 'PAYMENT_SUBMITTED',
        referenceCode: generateReferenceCode(),
        amountMnt: 100_000,
        proofImagePath: '11111111-2222-3333-4444-555555555555.jpg',
      },
    });
    const base = `/v1/admin/subscriptions/${old.id}`;
    for (const [method, url, body] of [
      ['GET', `${base}/receipt`, undefined],
      ['POST', `${base}/approve`, undefined],
      ['POST', `${base}/reject`, { reason: 'r' }],
    ] as const) {
      const res = await call(app, method, url, admin.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
    const after = await testDb.subscription.findUniqueOrThrow({ where: { id: old.id } });
    expect(after.status).toBe('PAYMENT_SUBMITTED');
    expect(await testDb.payment.count()).toBe(0);
    expect((await userRow(member.userId)).accessUntil).toBeNull();
  });
});

describe('users, dashboard, audit, export', () => {
  it('user detail shows the profile, devices, subscriptions and their audit trail', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await granted(member.userId, plan.id);

    const res = await get(`/v1/admin/users/${member.userId}`);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      id: member.userId,
      email: 'member@example.com',
      emailVerified: true,
    });
    expect(body.devices).toHaveLength(1);
    expect(body.subscriptions.map((s: { id: string }) => s.id)).toEqual([sub.id]);
    expect(body.audit.map((a: { action: string }) => a.action)).toContain('subscription.grant');
    expect(body.audit[0].actor.username).toBe('admin@example.com');
    // No secrets in the admin user view.
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|totpSecret|refreshToken/);
    expect((await get('/v1/admin/users/missing')).statusCode).toBe(404);
  });

  it('lists and searches users', async () => {
    await makeMember(app, 'ana@example.com', { username: 'anaa', names: { firstName: 'Ану' } });
    await makeMember(app, 'bold@example.com', { username: 'boldoo' });
    const names = async (q: string) =>
      (await get(`/v1/admin/users?q=${encodeURIComponent(q)}`))
        .json()
        .items.map((u: { username: string }) => u.username);
    expect(await names('anaa')).toEqual(['anaa']);
    expect(await names('Ану')).toEqual(['anaa']);
    expect(await names('example.com')).toHaveLength(3); // both members and the admin
    expect((await get('/v1/admin/users')).json().total).toBe(3);
  });

  it('dashboard counts: active, pending, expiring in 30 days, new users this week', async () => {
    const plan = await makePlan();
    const day = DAY;
    const mk = (
      n: string,
      over: {
        accessUntil?: Date | null;
        createdAt?: Date;
        role?: 'USER' | 'ADMIN';
        status?: 'ACTIVE' | 'DELETED';
      },
    ) =>
      testDb.user.create({
        data: {
          username: n,
          email: `${n}@example.com`,
          firstName: n,
          lastName: n,
          phone: '1',
          createdAt: over.createdAt ?? new Date(Date.now() - 30 * day),
          accessUntil: over.accessUntil ?? null,
          ...(over.role ? { role: over.role } : {}),
          ...(over.status ? { status: over.status } : {}),
        },
      });
    const far = await mk('far', { accessUntil: new Date(Date.now() + 90 * day) });
    await mk('soon', { accessUntil: new Date(Date.now() + 10 * day) });
    await mk('edge', { accessUntil: new Date(Date.now() + 29 * day) });
    await mk('ended', { accessUntil: new Date(Date.now() - day) });
    await mk('gone', { accessUntil: new Date(Date.now() + 5 * day), status: 'DELETED' });
    await mk('fresh', { createdAt: new Date(Date.now() - 2 * day) });
    await mk('last-week', { createdAt: new Date(Date.now() - 8 * day) });
    await mk('fresh-admin', { createdAt: new Date(Date.now() - day), role: 'ADMIN' });

    const s = (status: 'PENDING_PAYMENT' | 'PAYMENT_SUBMITTED', code: string) =>
      testDb.subscription.create({
        data: { userId: far.id, planId: plan.id, status, referenceCode: code, amountMnt: 1 },
      });
    await s('PENDING_PAYMENT', 'ONG-AAAA2');
    await s('PENDING_PAYMENT', 'ONG-AAAA3');
    await s('PAYMENT_SUBMITTED', 'ONG-AAAA4');

    const res = await get('/v1/admin/dashboard');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      activeUsers: 3, // far, soon, edge
      pendingPayment: 2,
      expiringIn30Days: 2, // soon, edge
      newUsersThisWeek: 1, // fresh (the admin is not a "user", the old ones are older)
    });
    // The 5 soonest endings, soonest first; deleted users and access beyond 30 days are not there.
    expect(res.json().expiringSoon.map((u: { username: string }) => u.username)).toEqual([
      'soon',
      'edge',
    ]);
  });

  it('dashboard money: this and last Ulaanbaatar month, only money that came in (ADR-0056)', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await testDb.subscription.create({
      data: {
        userId: member.userId,
        planId: plan.id,
        status: 'ACTIVE',
        referenceCode: 'ONG-MONEY2',
        amountMnt: 100_000,
      },
    });
    const pay = (
      amountMnt: number,
      createdAt: Date,
      over: { method?: 'QPAY' | 'MANUAL_GRANT'; status?: 'COMPLETED' | 'REFUNDED' } = {},
    ) =>
      testDb.payment.create({
        data: {
          subscriptionId: sub.id,
          amountMnt,
          createdAt,
          method: over.method ?? 'QPAY',
          status: over.status ?? 'COMPLETED',
        },
      });
    const monthStart = ubMonthStart(new Date());
    const now = await pay(100_000, new Date());
    const last = await pay(50_000, new Date(monthStart.getTime() - 60 * 60_000));
    const older = await pay(30_000, ubMonthStart(new Date(), 2));
    await pay(0, new Date(), { method: 'MANUAL_GRANT' });
    await pay(70_000, new Date(), { status: 'REFUNDED' });

    const body = (await get('/v1/admin/dashboard')).json();
    expect(body.revenue).toEqual({
      thisMonthMnt: 100_000,
      lastMonthMnt: 50_000,
      paymentsThisMonth: 1,
    });
    expect(body.recentPayments.map((p: { id: string }) => p.id)).toEqual([
      now.id,
      last.id,
      older.id,
    ]);
    expect(body.recentPayments[0]).toMatchObject({
      referenceCode: 'ONG-MONEY2',
      amountMnt: 100_000,
      method: 'QPAY',
      subscriptionId: sub.id,
      user: { id: member.userId },
    });
  });

  it('dashboard content: next scheduled items and broken or stuck files (ADR-0056)', async () => {
    const category = await makeCategory();
    const at = (ms: number) => new Date(Date.now() + ms);
    await makeEpisode(category.id, {
      title: 'later',
      status: 'SCHEDULED',
      scheduledFor: at(2 * DAY),
    });
    await makeEpisode(category.id, { title: 'next', status: 'SCHEDULED', scheduledFor: at(DAY) });
    await makeEpisode(category.id, { title: 'out' });

    await makeEpisode(category.id, { title: 'failed', status: 'DRAFT', media: 'FAILED' });
    const stuck = await makeEpisode(category.id, {
      title: 'stuck',
      status: 'DRAFT',
      media: 'UPLOADING',
    });
    await testDb.mediaAsset.updateMany({
      where: { episodeId: stuck.id },
      data: { updatedAt: at(-(STUCK_UPLOAD_MS + 60_000)) },
    });
    await makeEpisode(category.id, { title: 'uploading', status: 'DRAFT', media: 'UPLOADING' });
    await makeEpisode(category.id, { title: 'archived', status: 'ARCHIVED', media: 'FAILED' });
    // An old failed file replaced by a newer, ready one is not a problem.
    const fixed = await makeEpisode(category.id, {
      title: 'fixed',
      status: 'DRAFT',
      media: 'FAILED',
    });
    await testDb.mediaAsset.create({
      data: {
        episodeId: fixed.id,
        kind: 'AUDIO',
        provider: 'BUNNY_STORAGE',
        path: `audio/${fixed.id}/new.mp3`,
        status: 'READY',
      },
    });

    const body = (await get('/v1/admin/dashboard')).json();
    expect(body.upcoming.map((e: { title: string }) => e.title)).toEqual(['next', 'later']);
    expect(body.mediaProblems.failed).toBe(1);
    expect(body.mediaProblems.stuck).toBe(1);
    expect(body.mediaProblems.items.map((i: { title: string }) => i.title).sort()).toEqual([
      'failed',
      'stuck',
    ]);
    expect(
      body.mediaProblems.items.find((i: { title: string }) => i.title === 'failed'),
    ).toMatchObject({
      status: 'FAILED',
      failReason: 'test failure',
    });
  });

  it('audit log lists actions newest first, with actor, and filters by action and actor', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const a = await granted(member.userId, plan.id);
    await revoke(a.id, { reason: 'r' });

    const all = (await get('/v1/admin/audit')).json();
    expect(all.items.map((i: { action: string }) => i.action)).toEqual([
      'subscription.revoke',
      'subscription.grant',
    ]);
    expect(all.items[0].actor).toMatchObject({ id: admin.userId });
    expect(all.items[0].data).toMatchObject({ reason: 'r', userId: member.userId });

    const only = (await get('/v1/admin/audit?action=subscription.grant')).json();
    expect(only.items).toHaveLength(1);
    expect((await get(`/v1/admin/audit?actorId=${member.userId}`)).json().total).toBe(0);
    expect(
      (await get('/v1/admin/audit?targetType=Subscription&limit=1')).json().items,
    ).toHaveLength(1);
  });

  it('CSV export: BOM, Mongolian header, one row per payment, escaped values, formula-safe, and audited', async () => {
    const plan = await makePlan({ name: 'Жилийн эрх', priceMnt: 100_000 });
    const evil = await makeMember(app, 'evil@example.com', {
      names: {
        firstName: '=HYPERLINK("http://x")',
        lastName: 'Ли, "Бат"',
        phone: '+976 9911-2233',
      },
    });
    const normal = await makeMember(app, 'normal@example.com', {
      names: { firstName: '@sum', lastName: 'Н', phone: '+1+1' },
    });
    const sub = await paid(evil, plan.id);
    await granted(normal.userId, plan.id);

    const res = await get('/v1/admin/payments.csv');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="payments-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const text = res.body;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe(mn.csv.columns.join(','));
    expect(lines).toHaveLength(3);

    const line = lines.find((l) => l.includes(sub.referenceCode))!;
    expect(line).toContain('evil@example.com');
    expect(line).toContain('100000');
    expect(line).toContain('QPAY');
    expect(line).toContain('COMPLETED');
    // A cell that starts with = is neutralised; commas and quotes are escaped.
    expect(line).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(line).toContain('"Ли, ""Бат"""');
    // A phone number with a plus sign stays a plain number-like cell.
    expect(line).toContain('+976 9911-2233');
    expect(lines.find((l) => l.includes('MANUAL_GRANT'))).toContain("'@sum");

    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: 'payments.export' } });
    expect(log).toMatchObject({ actorId: admin.userId, targetType: 'Export' });
    expect(log.data).toMatchObject({ rows: 2 });
  });

  it('CSV export respects from/to (inclusive, Ulaanbaatar days) and validates dates', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    await granted(member.userId, plan.id);
    const payment = await testDb.payment.findFirstOrThrow();
    // 2026-03-10 23:30 in Ulaanbaatar (UTC+8) = 15:30 UTC.
    await testDb.payment.update({
      where: { id: payment.id },
      data: { createdAt: new Date('2026-03-10T15:30:00Z') },
    });

    const rows = async (q: string) =>
      (await get(`/v1/admin/payments.csv?${q}`)).body.trimEnd().split('\r\n').length - 1;
    expect(await rows('from=2026-03-10&to=2026-03-10')).toBe(1);
    expect(await rows('from=2026-03-11')).toBe(0);
    expect(await rows('to=2026-03-09')).toBe(0);
    expect(await rows('from=2026-03-01&to=2026-03-31')).toBe(1);
    expect((await get('/v1/admin/payments.csv?from=10-03-2026')).statusCode).toBe(400);
    expect((await get('/v1/admin/payments.csv?from=2026-13-40')).statusCode).toBe(400);
  });
});
