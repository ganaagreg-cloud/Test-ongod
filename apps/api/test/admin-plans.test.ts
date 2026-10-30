import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { testDb } from './helpers';
import { call, makeAdmin, makeMember, makePlan } from './admin-helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

const MONTHLY = { name: 'Сарын эрх', durationDays: 30, priceMnt: 15_000 };

const PLAN_ROUTES: Array<['GET' | 'POST' | 'PATCH', string, unknown?]> = [
  ['GET', '/v1/admin/plans'],
  ['POST', '/v1/admin/plans', MONTHLY],
  ['PATCH', '/v1/admin/plans/x', { priceMnt: 20_000 }],
];

/** A subscription row on the plan (status does not matter for the days rule). */
async function subscribe(userId: string, planId: string) {
  await testDb.subscription.create({
    data: { userId, planId, status: 'CANCELLED', referenceCode: 'ONG-PLAN1', amountMnt: 100_000 },
  });
}

describe('admin plans (SPEC K, ADR-0059)', () => {
  it('need an admin: 401 without a session, 403 for a member', async () => {
    for (const [method, url, body] of PLAN_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
    const member = await makeMember(app);
    for (const [method, url, body] of PLAN_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
    }
    expect(await testDb.plan.count()).toBe(0);
  });

  it('a new plan is listed for the admin and offered on the portal, with an audit row', async () => {
    await makePlan();
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', '/v1/admin/plans', admin.accessToken, MONTHLY);
    expect(res.statusCode).toBe(201);
    expect(res.json().plan).toMatchObject({ ...MONTHLY, active: true, subscriptionCount: 0 });

    const list = await call(app, 'GET', '/v1/admin/plans', admin.accessToken);
    expect(list.json().plans.map((p: { name: string }) => p.name)).toEqual([
      'Сарын эрх',
      'Жилийн эрх',
    ]);
    const portal = await call(app, 'GET', '/v1/plans');
    expect(portal.json().plans.map((p: { name: string }) => p.name)).toEqual([
      'Сарын эрх',
      'Жилийн эрх',
    ]);
    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: 'plan.create' } });
    expect(log).toMatchObject({ actorId: admin.userId, targetType: 'Plan' });
    expect(log.data).toMatchObject(MONTHLY);
  });

  it('a switched-off plan is created hidden', async () => {
    await makePlan();
    const admin = await makeAdmin(app);
    await call(app, 'POST', '/v1/admin/plans', admin.accessToken, { ...MONTHLY, active: false });
    const portal = await call(app, 'GET', '/v1/plans');
    expect(portal.json().plans).toHaveLength(1);
  });

  it('refuses bad input and a duplicate name (ignoring case)', async () => {
    await makePlan();
    const admin = await makeAdmin(app);
    for (const body of [
      { ...MONTHLY, name: 'x' },
      { ...MONTHLY, durationDays: 0 },
      { ...MONTHLY, durationDays: 3661 },
      { ...MONTHLY, priceMnt: 0 },
      { ...MONTHLY, priceMnt: 99 },
      { ...MONTHLY, priceMnt: 1500.5 },
      { ...MONTHLY, priceMnt: 100_000_001 },
      { name: 'Сарын эрх' },
    ]) {
      const res = await call(app, 'POST', '/v1/admin/plans', admin.accessToken, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
    const dup = await call(app, 'POST', '/v1/admin/plans', admin.accessToken, {
      ...MONTHLY,
      name: 'ЖИЛИЙН ЭРХ',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('PLAN_NAME_TAKEN');
    expect(await testDb.plan.count()).toBe(1);

    const plan = await testDb.plan.findFirstOrThrow();
    const empty = await call(app, 'PATCH', `/v1/admin/plans/${plan.id}`, admin.accessToken, {});
    expect(empty.statusCode).toBe(400);
    const missing = await call(app, 'PATCH', '/v1/admin/plans/nope', admin.accessToken, {
      priceMnt: 1000,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('price and name change; open requests keep the amount they were created with', async () => {
    const plan = await makePlan();
    const member = await makeMember(app);
    const open = await call(app, 'POST', '/v1/subscriptions', member.accessToken, {
      planId: plan.id,
    });
    expect(open.statusCode).toBe(201);

    const admin = await makeAdmin(app);
    const res = await call(app, 'PATCH', `/v1/admin/plans/${plan.id}`, admin.accessToken, {
      name: 'Жилийн гишүүнчлэл',
      priceMnt: 120_000,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().plan).toMatchObject({
      name: 'Жилийн гишүүнчлэл',
      priceMnt: 120_000,
      subscriptionCount: 1,
    });
    const sub = await testDb.subscription.findFirstOrThrow({ where: { userId: member.userId } });
    expect(sub.amountMnt).toBe(100_000);

    const log = await testDb.auditLog.findFirstOrThrow({ where: { action: 'plan.update' } });
    expect(log.data).toEqual({
      before: { name: 'Жилийн эрх', priceMnt: 100_000 },
      after: { name: 'Жилийн гишүүнчлэл', priceMnt: 120_000 },
    });
  });

  it('the days of a used plan are fixed (PLAN_IN_USE); an unused plan can change them', async () => {
    const used = await makePlan();
    const unused = await makePlan({ name: 'Сарын эрх', durationDays: 30, priceMnt: 15_000 });
    const member = await makeMember(app);
    await subscribe(member.userId, used.id);
    const admin = await makeAdmin(app);

    const refused = await call(app, 'PATCH', `/v1/admin/plans/${used.id}`, admin.accessToken, {
      durationDays: 366,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe('PLAN_IN_USE');
    expect((await testDb.plan.findUniqueOrThrow({ where: { id: used.id } })).durationDays).toBe(
      365,
    );
    // Sending the same days with another change is fine.
    const same = await call(app, 'PATCH', `/v1/admin/plans/${used.id}`, admin.accessToken, {
      durationDays: 365,
      priceMnt: 110_000,
    });
    expect(same.statusCode).toBe(200);

    const ok = await call(app, 'PATCH', `/v1/admin/plans/${unused.id}`, admin.accessToken, {
      durationDays: 31,
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().plan.durationDays).toBe(31);
  });

  it('a switched-off plan leaves the portal and cannot be chosen; its subscriptions stay', async () => {
    const yearly = await makePlan();
    const monthly = await makePlan({ name: 'Сарын эрх', durationDays: 30, priceMnt: 15_000 });
    const other = await makeMember(app, 'other@example.com');
    await subscribe(other.userId, monthly.id);
    const admin = await makeAdmin(app);

    const off = await call(app, 'PATCH', `/v1/admin/plans/${monthly.id}`, admin.accessToken, {
      active: false,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json().plan.active).toBe(false);

    const portal = await call(app, 'GET', '/v1/plans');
    expect(portal.json().plans.map((p: { id: string }) => p.id)).toEqual([yearly.id]);
    const member = await makeMember(app);
    const choose = await call(app, 'POST', '/v1/subscriptions', member.accessToken, {
      planId: monthly.id,
    });
    expect(choose.statusCode).toBe(404);
    expect(await testDb.subscription.count({ where: { planId: monthly.id } })).toBe(1);

    // Still listed for the admin, after the active ones.
    const list = await call(app, 'GET', '/v1/admin/plans', admin.accessToken);
    expect(list.json().plans.map((p: { id: string }) => p.id)).toEqual([yearly.id, monthly.id]);
  });

  it('the last active plan cannot be switched off', async () => {
    const yearly = await makePlan();
    await makePlan({ name: 'Хуучин', active: false });
    const admin = await makeAdmin(app);
    const res = await call(app, 'PATCH', `/v1/admin/plans/${yearly.id}`, admin.accessToken, {
      active: false,
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LAST_ACTIVE_PLAN');
    expect((await testDb.plan.findUniqueOrThrow({ where: { id: yearly.id } })).active).toBe(true);
  });

  it('two admins switching off the last two active plans at once leave one on (re-audit)', async () => {
    const admin = await makeAdmin(app);
    for (let round = 0; round < 5; round++) {
      await testDb.plan.updateMany({ data: { active: false } });
      const a = await makePlan({ name: `A${round}` });
      const b = await makePlan({ name: `B${round}` });
      const off = (id: string) =>
        call(app, 'PATCH', `/v1/admin/plans/${id}`, admin.accessToken, { active: false });
      const codes = (await Promise.all([off(a.id), off(b.id)])).map((r) => r.statusCode).sort();
      expect(codes).toEqual([200, 409]);
      expect(await testDb.plan.count({ where: { active: true } })).toBe(1);
    }
  });

  it('a change that changes nothing writes no audit row', async () => {
    const plan = await makePlan();
    const admin = await makeAdmin(app);
    const res = await call(app, 'PATCH', `/v1/admin/plans/${plan.id}`, admin.accessToken, {
      priceMnt: 100_000,
    });
    expect(res.statusCode).toBe(200);
    expect(await testDb.auditLog.count({ where: { action: 'plan.update' } })).toBe(0);
  });
});
