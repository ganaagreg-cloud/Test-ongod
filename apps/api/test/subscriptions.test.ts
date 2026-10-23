import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from './helpers';
import { DAY, call, makeMember, makePlan, paymentApp } from './admin-helpers';

let app: FastifyInstance;

beforeEach(async () => {
  ({ app } = await paymentApp());
});
afterEach(async () => {
  await app.close();
});

describe('GET /v1/plans', () => {
  it('is public (the landing page shows the price) and lists only active plans, cheapest first', async () => {
    await makePlan({ name: 'Жил', priceMnt: 100_000 });
    await makePlan({ name: 'Хагас жил', durationDays: 180, priceMnt: 60_000 });
    await makePlan({ name: 'Хаагдсан', active: false });

    // No login needed.
    const anonymous = await call(app, 'GET', '/v1/plans');
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json().plans.map((p: { name: string }) => p.name)).toEqual([
      'Хагас жил',
      'Жил',
    ]);
    expect(anonymous.json().plans[0]).toEqual({
      id: expect.any(String),
      name: 'Хагас жил',
      durationDays: 180,
      priceMnt: 60_000,
    });

    // Signed in or not, the same list; nothing else about the member is involved.
    const user = await makeMember(app);
    const res = await call(app, 'GET', '/v1/plans', user.accessToken);
    expect(res.json()).toEqual(anonymous.json());
  });

  it('keeps everything else under /v1/subscriptions behind login', async () => {
    for (const [method, url] of [
      ['POST', '/v1/subscriptions'],
      ['GET', '/v1/subscriptions/current'],
      ['POST', '/v1/subscriptions/x/mock'],
    ] as const) {
      expect((await call(app, method, url)).statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('is not part of the public app config (apps never show prices)', async () => {
    await makePlan();
    const res = await call(app, 'GET', '/v1/app-config');
    expect(JSON.stringify(res.json())).not.toMatch(/plan|price|bank|priceMnt/i);
  });
});

describe('POST /v1/subscriptions', () => {
  it('creates PENDING_PAYMENT with amount, an ONG- reference code and a QPay checkout (mock without Wire keys)', async () => {
    const plan = await makePlan({ priceMnt: 120_000 });
    const user = await makeMember(app);

    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.subscription).toMatchObject({
      status: 'PENDING_PAYMENT',
      amountMnt: 120_000,
      plan: { id: plan.id, durationDays: 365 },
    });
    // The bank-transfer fields are gone from the DTO (ADR-0046).
    for (const field of ['hasReceipt', 'payerNote', 'transferAt', 'submittedAt', 'rejectReason']) {
      expect(body.subscription).not.toHaveProperty(field);
    }
    // No look-alike characters (0/O, 1/I/L) in the code people may read out or type.
    expect(body.subscription.referenceCode).toMatch(/^ONG-[2-9A-HJKMNP-Z]{5}$/);
    expect(body.subscription).toMatchObject({
      paymentProvider: 'MOCK',
      checkoutUrl: `/pay/mock/${body.subscription.id}`,
    });
    expect(body.bank).toBeUndefined();
  });

  it('refuses an unverified email: EMAIL_NOT_VERIFIED, nothing is created', async () => {
    const plan = await makePlan();
    const user = await makeMember(app, 'new@example.com', { verified: false });

    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await testDb.subscription.count()).toBe(0);
  });

  it('allows one open request per user, also under parallel requests: the same plan returns the same request', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual([201, 201, 201]);
    const ids = new Set(results.map((r) => r.json().subscription.id as string));
    expect(ids.size).toBe(1);
    expect(await testDb.subscription.count()).toBe(1);
  });

  it('blocks a request for another plan while one is open, and allows a new one after a cancel', async () => {
    const plan = await makePlan();
    const other = await makePlan({ name: 'Хагас жил', durationDays: 180 });
    const user = await makeMember(app);
    const first = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json().subscription;

    const blocked = await call(app, 'POST', '/v1/subscriptions', user.accessToken, {
      planId: other.id,
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error.code).toBe('OPEN_SUBSCRIPTION_EXISTS');

    await testDb.subscription.update({ where: { id: first.id }, data: { status: 'CANCELLED' } });
    const again = await call(app, 'POST', '/v1/subscriptions', user.accessToken, {
      planId: other.id,
    });
    expect(again.statusCode).toBe(201);
  });

  it('lets a member with active access renew (an ACTIVE period is not an open request)', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    await testDb.subscription.create({
      data: {
        userId: user.userId,
        planId: plan.id,
        status: 'ACTIVE',
        referenceCode: 'ONG-AAAAA',
        amountMnt: 1,
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 30 * DAY),
      },
    });
    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(201);
  });

  it('treats an old PENDING_PAYMENT as expired even before the cron ran', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    await testDb.subscription.create({
      data: {
        userId: user.userId,
        planId: plan.id,
        referenceCode: 'ONG-OLDOL',
        amountMnt: 1,
        createdAt: new Date(Date.now() - 8 * DAY),
      },
    });
    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(201);
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { referenceCode: 'ONG-OLDOL' } }))
        .status,
    ).toBe('EXPIRED');
  });

  it('rejects an unknown or inactive plan and a bad body', async () => {
    const inactive = await makePlan({ active: false });
    const user = await makeMember(app);
    expect(
      (await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: 'nope' }))
        .statusCode,
    ).toBe(404);
    expect(
      (await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: inactive.id }))
        .statusCode,
    ).toBe(404);
    expect((await call(app, 'POST', '/v1/subscriptions', user.accessToken, {})).statusCode).toBe(
      400,
    );
    expect((await call(app, 'POST', '/v1/subscriptions')).statusCode).toBe(401);
  });
});

describe('GET /v1/subscriptions/current', () => {
  it('is empty for a user who never applied', async () => {
    const user = await makeMember(app);
    const res = await call(app, 'GET', '/v1/subscriptions/current', user.accessToken);
    expect(res.json()).toEqual({ subscription: null, accessUntil: null });
  });

  it('shows the open request, with the checkout link only while payment is still due', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    const created = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json().subscription;

    let res = (await call(app, 'GET', '/v1/subscriptions/current', user.accessToken)).json();
    expect(res.subscription.id).toBe(created.id);
    expect(res.subscription.checkoutUrl).toBe(created.checkoutUrl);
    expect(res.subscription.checkoutUrl).not.toBeNull();

    await testDb.subscription.update({
      where: { id: created.id },
      data: { status: 'CANCELLED' },
    });
    res = (await call(app, 'GET', '/v1/subscriptions/current', user.accessToken)).json();
    expect(res.subscription.status).toBe('CANCELLED');
    expect(res.subscription.checkoutUrl).toBeNull();
  });

  it("never shows another user's subscription", async () => {
    const plan = await makePlan();
    const a = await makeMember(app, 'a@example.com');
    const b = await makeMember(app, 'b@example.com');
    await call(app, 'POST', '/v1/subscriptions', a.accessToken, { planId: plan.id });
    const res = await call(app, 'GET', '/v1/subscriptions/current', b.accessToken);
    expect(res.json().subscription).toBeNull();
  });
});

describe('removed bank-transfer path (ADR-0046)', () => {
  it('has no "Төлсөн" route any more: 404 for a signed-in member, nothing changes', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    const { subscription } = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json();
    const res = await call(
      app,
      'POST',
      `/v1/subscriptions/${subscription.id}/submitted`,
      user.accessToken,
      { transferAt: new Date().toISOString() },
    );
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe('PENDING_PAYMENT');
  });
});
