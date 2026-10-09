import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mn } from '../src/i18n/mn';
import { makeCategory, makeEpisode } from './catalog-helpers';
import { testDb } from './helpers';
import {
  DAY,
  call,
  jobsOf,
  notifyEmails,
  jpeg,
  makeActive,
  makeAdmin,
  makeMember,
  makePlan,
  makeSubmitted,
  multipart,
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

const act = (id: string, action: 'approve' | 'reject' | 'revoke', body?: unknown) =>
  call(app, 'POST', `/v1/admin/subscriptions/${id}/${action}`, admin.accessToken, body);
const approve = (id: string) => act(id, 'approve');
const get = (url: string) => call(app, 'GET', url, admin.accessToken);
const ms = (iso: string) => Date.parse(iso);

const userRow = (id: string) => testDb.user.findUniqueOrThrow({ where: { id } });
const subRow = (id: string) => testDb.subscription.findUniqueOrThrow({ where: { id } });

describe('approve (SPEC E)', () => {
  it('starts the period now, creates the Payment, updates the access cache, audits, and queues email + push', async () => {
    const plan = await makePlan({ durationDays: 365, priceMnt: 100_000 });
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id, { amountMnt: 100_000 });

    const before = Date.now();
    const res = await approve(sub.id);
    const after = Date.now();
    expect(res.statusCode).toBe(200);

    const dto = res.json().subscription;
    expect(dto.status).toBe('ACTIVE');
    expect(ms(dto.startsAt)).toBeGreaterThanOrEqual(before);
    expect(ms(dto.startsAt)).toBeLessThanOrEqual(after);
    expect(ms(dto.endsAt) - ms(dto.startsAt)).toBe(365 * DAY);
    expect(dto.decidedBy.id).toBe(admin.userId);

    const payments = await testDb.payment.findMany({ where: { subscriptionId: sub.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({
      method: 'BANK_TRANSFER',
      amountMnt: 100_000,
      status: 'COMPLETED',
    });

    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(dto.endsAt);

    const log = await testDb.auditLog.findMany({ where: { action: 'subscription.approve' } });
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      actorId: admin.userId,
      targetType: 'Subscription',
      targetId: sub.id,
    });

    const emails = await notifyEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]!.payload).toMatchObject({
      to: 'member@example.com',
      template: 'paymentApproved',
    });
    const pushes = await jobsOf('push.send');
    expect(pushes).toHaveLength(1);
    expect(pushes[0]!.payload).toMatchObject({
      userId: member.userId,
      title: mn.push.paymentApproved.title,
    });
  });

  it('uses the plan duration', async () => {
    const plan = await makePlan({ durationDays: 30 });
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    const dto = (await approve(sub.id)).json().subscription;
    expect(ms(dto.endsAt) - ms(dto.startsAt)).toBe(30 * DAY);
  });

  it('while access is still active: the new period starts at the current access end (no time is lost)', async () => {
    const plan = await makePlan({ durationDays: 365 });
    const member = await makeMember(app);
    const currentEnd = new Date(Date.now() + 100 * DAY);
    await makeActive(member.userId, plan.id, new Date(Date.now() - 265 * DAY), currentEnd);
    const renewal = await makeSubmitted(member.userId, plan.id);

    const dto = (await approve(renewal.id)).json().subscription;
    expect(dto.startsAt).toBe(currentEnd.toISOString());
    expect(ms(dto.endsAt)).toBe(currentEnd.getTime() + 365 * DAY);
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(dto.endsAt);
  });

  it('after access ended: the new period starts now, not at the old end', async () => {
    const plan = await makePlan({ durationDays: 365 });
    const member = await makeMember(app);
    const oldEnd = new Date(Date.now() - 10 * DAY);
    const old = await makeActive(
      member.userId,
      plan.id,
      new Date(oldEnd.getTime() - 365 * DAY),
      oldEnd,
    );
    await testDb.subscription.update({ where: { id: old.id }, data: { status: 'EXPIRED' } });
    const renewal = await makeSubmitted(member.userId, plan.id);

    const before = Date.now();
    const dto = (await approve(renewal.id)).json().subscription;
    expect(ms(dto.startsAt)).toBeGreaterThanOrEqual(before);
    expect(ms(dto.startsAt)).toBeGreaterThan(oldEnd.getTime() + 9 * DAY);
    expect(ms(dto.endsAt) - ms(dto.startsAt)).toBe(365 * DAY);
  });

  it('also when the cron has not yet marked the ended period EXPIRED (still ACTIVE, endsAt in the past)', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const oldEnd = new Date(Date.now() - 2 * DAY);
    await makeActive(member.userId, plan.id, new Date(oldEnd.getTime() - 365 * DAY), oldEnd);
    const renewal = await makeSubmitted(member.userId, plan.id);

    const before = Date.now();
    const dto = (await approve(renewal.id)).json().subscription;
    expect(ms(dto.startsAt)).toBeGreaterThanOrEqual(before);
  });

  it('double approval gives exactly one period: second call is 409, nothing is added', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);

    const first = await approve(sub.id);
    const second = await approve(sub.id);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SUBSCRIPTION_STATE');

    expect(await testDb.payment.count()).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: 'subscription.approve' } })).toBe(1);
    expect(await notifyEmails()).toHaveLength(1);
    expect(await jobsOf('push.send')).toHaveLength(1);
    const row = await subRow(sub.id);
    expect(row.endsAt?.toISOString()).toBe(first.json().subscription.endsAt);
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(
      row.endsAt?.toISOString(),
    );
  });

  it('parallel approvals (double click, two admins) give exactly one period', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const other = await makeAdmin(app, { email: 'admin2@example.com' });
    const sub = await makeSubmitted(member.userId, plan.id);

    const tokens = [admin.accessToken, other.accessToken, admin.accessToken, other.accessToken];
    const results = await Promise.all(
      tokens.map((t) => call(app, 'POST', `/v1/admin/subscriptions/${sub.id}/approve`, t)),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409, 409]);

    expect(await testDb.payment.count({ where: { subscriptionId: sub.id } })).toBe(1);
    expect(await testDb.auditLog.count({ where: { action: 'subscription.approve' } })).toBe(1);
    expect(await notifyEmails()).toHaveLength(1);
    const row = await subRow(sub.id);
    expect(ms(row.endsAt!.toISOString()) - ms(row.startsAt!.toISOString())).toBe(365 * DAY);
    expect((await userRow(member.userId)).accessUntil?.getTime()).toBe(row.endsAt!.getTime());
  });

  it('only PAYMENT_SUBMITTED can be approved', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    for (const status of [
      'PENDING_PAYMENT',
      'REJECTED',
      'EXPIRED',
      'CANCELLED',
      'REVOKED',
      'ACTIVE',
    ] as const) {
      const sub = await makeSubmitted(member.userId, plan.id);
      await testDb.subscription.update({ where: { id: sub.id }, data: { status } });
      const res = await approve(sub.id);
      expect(res.statusCode, status).toBe(409);
      expect(res.json().error.code).toBe('SUBSCRIPTION_STATE');
    }
    expect(await testDb.payment.count()).toBe(0);
    expect((await userRow(member.userId)).accessUntil).toBeNull();
  });

  it('unknown id: 404. Deleted user: 409', async () => {
    expect((await approve('does-not-exist')).statusCode).toBe(404);
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    await testDb.user.update({ where: { id: member.userId }, data: { status: 'DELETED' } });
    expect((await approve(sub.id)).statusCode).toBe(409);
    expect(await testDb.payment.count()).toBe(0);
  });

  it('does not queue any email or push when the approval fails', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    await testDb.subscription.update({
      where: { id: sub.id },
      data: { status: 'PENDING_PAYMENT' },
    });
    await approve(sub.id);
    expect(await notifyEmails()).toHaveLength(0);
    expect(await jobsOf('push.send')).toHaveLength(0);
  });
});

describe('reject (SPEC E)', () => {
  it('sets REJECTED with the reason, emails the user, creates no payment and no access', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);

    const res = await act(sub.id, 'reject', { reason: 'Дүн таарахгүй байна' });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Дүн таарахгүй байна',
      decidedBy: { id: admin.userId },
    });
    expect(await testDb.payment.count()).toBe(0);
    expect((await userRow(member.userId)).accessUntil).toBeNull();

    const emails = await notifyEmails();
    expect(emails).toHaveLength(1);
    expect(emails[0]!.payload).toMatchObject({
      to: 'member@example.com',
      template: 'paymentRejected',
      params: { reason: 'Дүн таарахгүй байна' },
    });
    expect(
      await testDb.auditLog.count({ where: { action: 'subscription.reject', targetId: sub.id } }),
    ).toBe(1);

    // The member sees the reason in the portal and may apply again.
    const current = (
      await call(app, 'GET', '/v1/subscriptions/current', member.accessToken)
    ).json();
    expect(current.subscription).toMatchObject({
      status: 'REJECTED',
      rejectReason: 'Дүн таарахгүй байна',
    });
    expect(
      (await call(app, 'POST', '/v1/subscriptions', member.accessToken, { planId: plan.id }))
        .statusCode,
    ).toBe(201);
  });

  it('needs a non-empty reason', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    for (const body of [{}, { reason: '' }, { reason: '   ' }, { reason: 'x'.repeat(501) }]) {
      expect((await act(sub.id, 'reject', body)).statusCode).toBe(400);
    }
    expect((await subRow(sub.id)).status).toBe('PAYMENT_SUBMITTED');
  });

  it('cannot reject twice, nor reject an approved one, nor approve a rejected one', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const a = await makeSubmitted(member.userId, plan.id);
    expect((await act(a.id, 'reject', { reason: 'r' })).statusCode).toBe(200);
    expect((await act(a.id, 'reject', { reason: 'r' })).statusCode).toBe(409);
    expect((await approve(a.id)).statusCode).toBe(409);

    const b = await makeSubmitted(member.userId, plan.id);
    expect((await approve(b.id)).statusCode).toBe(200);
    const res = await act(b.id, 'reject', { reason: 'r' });
    expect(res.statusCode).toBe(409);
    expect((await subRow(b.id)).status).toBe('ACTIVE');
    expect(await notifyEmails()).toHaveLength(2); // one rejected, one approved
  });

  it('approve and reject racing: exactly one wins', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    const results = await Promise.all([approve(sub.id), act(sub.id, 'reject', { reason: 'r' })]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const row = await subRow(sub.id);
    const payments = await testDb.payment.count();
    expect(payments).toBe(row.status === 'ACTIVE' ? 1 : 0);
    expect((await userRow(member.userId)).accessUntil !== null).toBe(row.status === 'ACTIVE');
  });
});

describe('revoke (SPEC E)', () => {
  it('ends access at once and clears the cache; the audit entry keeps the reason', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    await approve(sub.id);

    const res = await act(sub.id, 'revoke', { reason: 'Буцаалт хийсэн' });
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
    const sub = await makeSubmitted(member.userId, plan.id);
    await approve(sub.id);
    await act(sub.id, 'revoke', { reason: 'refund', refund: true });
    expect((await testDb.payment.findFirstOrThrow()).status).toBe('REFUNDED');
  });

  it('stops playback: a member who could play gets 403 NO_ACCESS right after the revoke', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id);

    const grant = await call(
      app,
      'POST',
      `/v1/admin/users/${member.userId}/grants`,
      admin.accessToken,
      {
        planId: plan.id,
      },
    );
    expect(grant.statusCode).toBe(201);

    const play = () => call(app, 'POST', `/v1/episodes/${episode.id}/play`, member.accessToken);
    expect((await play()).statusCode).toBe(200);

    expect(
      (await act(grant.json().subscription.id, 'revoke', { reason: 'fraud' })).statusCode,
    ).toBe(200);
    const after = await play();
    expect(after.statusCode).toBe(403);
    expect(after.json().error.code).toBe('NO_ACCESS');
  });

  it('a revoked bank-transfer subscription stops playback too', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const cat = await makeCategory();
    const episode = await makeEpisode(cat.id);
    const sub = await makeSubmitted(member.userId, plan.id);
    await approve(sub.id);

    const play = () => call(app, 'POST', `/v1/episodes/${episode.id}/play`, member.accessToken);
    expect((await play()).statusCode).toBe(200);
    await act(sub.id, 'revoke', { reason: 'fraud' });
    expect((await play()).json().error.code).toBe('NO_ACCESS');
  });

  it('keeps access that another ACTIVE period still gives', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const first = await makeSubmitted(member.userId, plan.id);
    await approve(first.id);
    const second = await makeSubmitted(member.userId, plan.id);
    const secondDto = (await approve(second.id)).json().subscription;

    await act(first.id, 'revoke', { reason: 'r' });
    expect((await userRow(member.userId)).accessUntil?.toISOString()).toBe(secondDto.endsAt);
  });

  it('only ACTIVE can be revoked, and only once', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const submitted = await makeSubmitted(member.userId, plan.id);
    expect((await act(submitted.id, 'revoke', { reason: 'r' })).statusCode).toBe(409);

    await approve(submitted.id);
    expect((await act(submitted.id, 'revoke', { reason: 'r' })).statusCode).toBe(200);
    expect((await act(submitted.id, 'revoke', { reason: 'r' })).statusCode).toBe(409);
    expect((await act('missing', 'revoke', { reason: 'r' })).statusCode).toBe(404);
    expect((await act(submitted.id, 'revoke', {})).statusCode).toBe(400);
  });
});

describe('manual grant (SPEC E)', () => {
  const grant = (userId: string, body: unknown) =>
    call(app, 'POST', `/v1/admin/users/${userId}/grants`, admin.accessToken, body);

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

describe('queue and search', () => {
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
    const t = Date.now();
    const s1 = await makeSubmitted(ana.userId, plan.id, { submittedAt: new Date(t - 2 * DAY) });
    const s2 = await makeSubmitted(bold.userId, plan.id, { submittedAt: new Date(t - 1 * DAY) });
    return { plan, ana, bold, s1, s2 };
  }

  it('lists PAYMENT_SUBMITTED by default, oldest first, with user details and no file path', async () => {
    const { s1, s2, plan, ana } = await seed();
    await testDb.subscription.create({
      data: { userId: ana.userId, planId: plan.id, referenceCode: 'ONG-PPPPP', amountMnt: 1 },
    });
    const res = await get('/v1/admin/subscriptions');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.map((i: { id: string }) => i.id)).toEqual([s1.id, s2.id]);
    expect(body).toMatchObject({ total: 2, page: 1, limit: 25 });
    expect(body.items[0].user).toMatchObject({
      username: 'anaa',
      email: 'ana@example.com',
      phone: '99112233',
    });
    expect(JSON.stringify(body)).not.toContain('proofImagePath');
  });

  it('filters by status', async () => {
    const { plan, ana } = await seed();
    const pending = await testDb.subscription.create({
      data: { userId: ana.userId, planId: plan.id, referenceCode: 'ONG-PPPPP', amountMnt: 1 },
    });
    const res = await get('/v1/admin/subscriptions?status=PENDING_PAYMENT');
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([pending.id]);
    expect((await get('/v1/admin/subscriptions?status=ACTIVE')).json().total).toBe(0);
    expect((await get('/v1/admin/subscriptions?status=BOGUS')).statusCode).toBe(400);
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
    expect(p1.items.map((i: { id: string }) => i.id)).toEqual([s1.id]);
    expect(p2.items.map((i: { id: string }) => i.id)).toEqual([s2.id]);
    expect(p1.total).toBe(2);
    expect((await get('/v1/admin/subscriptions?limit=1000')).statusCode).toBe(400);
    expect((await get('/v1/admin/subscriptions?page=0')).statusCode).toBe(400);
  });

  it('approving removes the item from the queue', async () => {
    const { s1 } = await seed();
    await approve(s1.id);
    expect((await get('/v1/admin/subscriptions')).json().total).toBe(1);
    expect((await get('/v1/admin/subscriptions?status=ACTIVE')).json().total).toBe(1);
  });

  it('GET /subscriptions/:id returns one request, 404 for an unknown id', async () => {
    const { s1 } = await seed();
    expect((await get(`/v1/admin/subscriptions/${s1.id}`)).json().subscription.id).toBe(s1.id);
    expect((await get('/v1/admin/subscriptions/missing')).statusCode).toBe(404);
  });
});

describe('receipt image (admin only, never public)', () => {
  it('the admin gets the stored bytes with the right type; nobody else can', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const { subscription } = (
      await call(app, 'POST', '/v1/subscriptions', member.accessToken, { planId: plan.id })
    ).json();
    const image = jpeg(3000);
    const { payload, headers } = await multipart(
      { transferAt: new Date(Date.now() - 60_000).toISOString() },
      { name: 'r.jpg', data: image },
    );
    const sent = await app.inject({
      method: 'POST',
      url: `/v1/subscriptions/${subscription.id}/submitted`,
      payload,
      headers: { ...headers, authorization: `Bearer ${member.accessToken}` },
    });
    expect(sent.statusCode).toBe(200);

    const url = `/v1/admin/subscriptions/${subscription.id}/receipt`;
    const res = await get(url);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.rawPayload.equals(image)).toBe(true);

    // The owner of the receipt is not an admin: no access to their own file through this route.
    expect((await call(app, 'GET', url, member.accessToken)).statusCode).toBe(403);
    expect((await call(app, 'GET', url)).statusCode).toBe(401);
    const unverified = await makeAdmin(app, { email: 'new-admin@example.com', totp: 'enabled' });
    expect((await call(app, 'GET', url, unverified.accessToken)).json().error.code).toBe(
      'TOTP_REQUIRED',
    );
  });

  it('404 when there is no receipt, when the file is gone, or when the stored key is not ours', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const none = await makeSubmitted(member.userId, plan.id);
    expect((await get(`/v1/admin/subscriptions/${none.id}/receipt`)).statusCode).toBe(404);

    const gone = await makeSubmitted(member.userId, plan.id, {
      proofImagePath: '11111111-2222-3333-4444-555555555555.jpg',
    });
    expect((await get(`/v1/admin/subscriptions/${gone.id}/receipt`)).statusCode).toBe(404);

    for (const bad of ['../../etc/passwd', '..\\..\\secret.jpg', '/etc/passwd', 'a.jpg']) {
      const sub = await makeSubmitted(member.userId, plan.id, { proofImagePath: bad });
      expect((await get(`/v1/admin/subscriptions/${sub.id}/receipt`)).statusCode, bad).toBe(404);
    }
  });
});

describe('users, dashboard, audit, export', () => {
  it('user detail shows the profile, devices, subscriptions and their audit trail', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    await approve(sub.id);

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
    expect(body.audit.map((a: { action: string }) => a.action)).toContain('subscription.approve');
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

  it('dashboard counts: active, pending, submitted, expiring in 30 days, new users this week', async () => {
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
    expect(res.json()).toEqual({
      activeUsers: 3, // far, soon, edge
      pendingPayment: 2,
      paymentSubmitted: 1,
      expiringIn30Days: 2, // soon, edge
      newUsersThisWeek: 1, // fresh (the admin is not a "user", the old ones are older)
    });
  });

  it('audit log lists actions newest first, with actor, and filters by action and actor', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const a = await makeSubmitted(member.userId, plan.id);
    const b = await makeSubmitted(member.userId, plan.id);
    await approve(a.id);
    await act(b.id, 'reject', { reason: 'r' });

    const all = (await get('/v1/admin/audit')).json();
    expect(all.items.map((i: { action: string }) => i.action)).toEqual([
      'subscription.reject',
      'subscription.approve',
    ]);
    expect(all.items[0].actor).toMatchObject({ id: admin.userId });
    expect(all.items[0].data).toMatchObject({ reason: 'r', userId: member.userId });

    const only = (await get('/v1/admin/audit?action=subscription.approve')).json();
    expect(only.items).toHaveLength(1);
    expect((await get(`/v1/admin/audit?actorId=${member.userId}`)).json().total).toBe(0);
    expect(
      (await get('/v1/admin/audit?targetType=Subscription&limit=1')).json().items,
    ).toHaveLength(1);
  });

  it('CSV export: BOM, Mongolian header, one row per payment, escaped values, formula-safe, and audited', async () => {
    const plan = await makePlan({ name: 'Жилийн эрх' });
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
    const sub = await makeSubmitted(evil.userId, plan.id, { amountMnt: 100_000 });
    await approve(sub.id);
    await call(app, 'POST', `/v1/admin/users/${normal.userId}/grants`, admin.accessToken, {
      planId: plan.id,
    });

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

    const row = lines.find((l) => l.includes(sub.referenceCode))!;
    expect(row).toContain('evil@example.com');
    expect(row).toContain('100000');
    expect(row).toContain('BANK_TRANSFER');
    expect(row).toContain('COMPLETED');
    // A cell that starts with = is neutralised; commas and quotes are escaped.
    expect(row).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(row).toContain('"Ли, ""Бат"""');
    // A phone number with a plus sign stays a plain number-like cell.
    expect(row).toContain('+976 9911-2233');
    expect(lines.find((l) => l.includes('MANUAL_GRANT'))).toContain("'@sum");

    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: 'payments.export' } });
    expect(log).toMatchObject({ actorId: admin.userId, targetType: 'Export' });
    expect(log.data).toMatchObject({ rows: 2 });
  });

  it('CSV export respects from/to (inclusive, Ulaanbaatar days) and validates dates', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const sub = await makeSubmitted(member.userId, plan.id);
    await approve(sub.id);
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
