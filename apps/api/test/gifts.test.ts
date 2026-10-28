import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expireGifts, syncWaitingGifts } from '../src/cron/tasks';
import type { WireGateway, WireIntent } from '../src/payments/wire';
import { toMinor } from '../src/payments/wire';
import { createPaymentService } from '../src/payments/service';
import { authApp } from './auth-helpers';
import { call, jobsOf, makeAdmin, makeMember, makePlan } from './admin-helpers';
import { testDb, testEnv } from './helpers';

const SECRET = 'whsec_test_secret';
const CODE = /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/;

/** A stand-in for Wire: intents live in a map, tests change their status. */
function fakeWire() {
  const intents = new Map<string, WireIntent>();
  const gateway: WireGateway = {
    createCheckout: vi.fn(async ({ subscriptionId, amountMnt }) => {
      const id = `pi_${subscriptionId}`;
      intents.set(id, {
        id,
        status: 'requires_action',
        amount: toMinor(amountMnt),
        livemode: false,
      });
      return { paymentIntentId: id, checkoutUrl: `https://checkout.wire.test/${id}` };
    }),
    retrieveIntent: vi.fn(async (id) => {
      const intent = intents.get(id);
      if (!intent) throw new Error('unknown intent');
      return intent;
    }),
  };
  return { gateway, intents };
}

const sign = (body: string, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', SECRET).update(`${t}.${body}`).digest('hex')}`;
const eventBody = (id: string, intentId: string) =>
  JSON.stringify({
    id,
    object: 'event',
    type: 'payment_intent.succeeded',
    api_version: '2026-01-01',
    data: { object: { id: intentId } },
    livemode: false,
    created: 0,
  });

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

async function setup(wire: ReturnType<typeof fakeWire> | null = fakeWire()) {
  app = await authApp(
    { WIRE_API_KEY: 'sk_test_x', WIRE_WEBHOOK_SECRET: SECRET },
    { wire: wire?.gateway ?? null },
  );
  const plan = await makePlan({ name: 'Жилийн эрх', priceMnt: 120_000 });
  const buyer = await makeMember(app, 'buyer@example.com', { username: 'buyer' });
  return { wire, plan, buyer };
}

const buy = (planId: string, token?: string) => call(app, 'POST', '/v1/gifts', token, { planId });
const redeem = (code: string, token?: string) =>
  call(app, 'POST', '/v1/gifts/redeem', token, { code });
const pushWebhook = (id: string, intentId: string) => {
  const body = eventBody(id, intentId);
  return app.inject({
    method: 'POST',
    url: '/v1/webhooks/wire',
    payload: body,
    headers: { 'content-type': 'application/json', 'wirepayment-signature': sign(body) },
  });
};

/** A bought and paid gift; returns its code. */
async function paidGift(ctx: Awaited<ReturnType<typeof setup>>, event = 'evt_1') {
  const { gift } = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json();
  const stored = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
  ctx.wire!.intents.get(stored.wirePaymentIntentId!)!.status = 'succeeded';
  await pushWebhook(event, stored.wirePaymentIntentId!);
  const paid = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
  return { id: gift.id as string, code: paid.code!, intentId: stored.wirePaymentIntentId! };
}

describe('buying a gift (SPEC J)', () => {
  it('needs a login and a verified email, and an active plan', async () => {
    const { plan, buyer } = await setup();
    expect((await buy(plan.id)).statusCode).toBe(401);
    const unverified = await makeMember(app, 'u@example.com', { verified: false });
    expect((await buy(plan.id, unverified.accessToken)).json().error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect((await buy('nope', buyer.accessToken)).statusCode).toBe(404);
    const off = await makePlan({ name: 'Хаалттай', active: false });
    expect((await buy(off.id, buyer.accessToken)).statusCode).toBe(404);
    expect((await call(app, 'POST', '/v1/gifts', buyer.accessToken, {})).statusCode).toBe(400);
    expect(await testDb.gift.count()).toBe(0);
  });

  it('creates an unpaid gift with the price and days copied, a Wire checkout and no code yet', async () => {
    const { wire, plan, buyer } = await setup();
    const res = await buy(plan.id, buyer.accessToken);
    expect(res.statusCode).toBe(201);
    const { gift } = res.json();
    expect(gift).toMatchObject({
      status: 'PENDING_PAYMENT',
      amountMnt: 120_000,
      durationDays: 365,
      code: null,
      plan: { id: plan.id, name: 'Жилийн эрх' },
    });
    expect(gift.checkoutUrl).toMatch(/^https:\/\/checkout\.wire\.test\//);
    expect(wire!.gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ amountMnt: 120_000, subscriptionId: `gift_${gift.id}` }),
    );
    // A buyer with an open subscription request can still buy a gift (it is a separate thing).
    const sub = await call(app, 'POST', '/v1/subscriptions', buyer.accessToken, {
      planId: plan.id,
    });
    expect(sub.statusCode).toBe(201);
  });

  it('asking again for the same plan returns the same gift and checkout; at most 5 unpaid', async () => {
    const { wire, plan, buyer } = await setup();
    const a = (await buy(plan.id, buyer.accessToken)).json().gift;
    const b = (await buy(plan.id, buyer.accessToken)).json().gift;
    expect(b.id).toBe(a.id);
    expect(wire!.gateway.createCheckout).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 4; i++) {
      const other = await makePlan({ name: `Багц ${i}` });
      expect((await buy(other.id, buyer.accessToken)).statusCode).toBe(201);
    }
    const sixth = await makePlan({ name: 'Зургаа' });
    const res = await buy(sixth.id, buyer.accessToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('GIFT_LIMIT');
  });

  it('answers 503 and keeps a gift the retry can pick up when Wire is down', async () => {
    const { wire, plan, buyer } = await setup();
    vi.mocked(wire!.gateway.createCheckout).mockRejectedValueOnce(new Error('down'));
    expect((await buy(plan.id, buyer.accessToken)).statusCode).toBe(503);
    const retry = await buy(plan.id, buyer.accessToken);
    expect(retry.statusCode).toBe(201);
    expect(await testDb.gift.count()).toBe(1);
  });
});

describe('paying for a gift', () => {
  it('a signed webhook makes it PAID with a code, an email to the buyer and an audit row', async () => {
    const ctx = await setup();
    const { id, code } = await paidGift(ctx);
    expect(code).toMatch(CODE);
    const gift = await testDb.gift.findUniqueOrThrow({ where: { id } });
    expect(gift.status).toBe('PAID');
    expect(gift.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);
    const mails = (await jobsOf('email.send')).filter(
      (j) => j.payload.template === 'giftPurchased',
    );
    expect(mails).toHaveLength(1);
    expect(mails[0]!.payload.to).toBe('buyer@example.com');
    expect(JSON.stringify(mails[0]!.payload)).toContain(code);
    expect(await testDb.auditLog.count({ where: { action: 'gift.paid' } })).toBe(1);
    // Nobody has access yet: a gift is not a subscription.
    expect(await testDb.subscription.count()).toBe(0);
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: ctx.buyer.userId } })).accessUntil,
    ).toBeNull();
  });

  it('the same event twice, or two events for one payment, issue one code', async () => {
    const ctx = await setup();
    const { id, intentId } = await paidGift(ctx, 'evt_1');
    const first = (await testDb.gift.findUniqueOrThrow({ where: { id } })).code;
    await pushWebhook('evt_1', intentId);
    await pushWebhook('evt_2', intentId);
    expect((await testDb.gift.findUniqueOrThrow({ where: { id } })).code).toBe(first);
    expect(
      (await jobsOf('email.send')).filter((j) => j.payload.template === 'giftPurchased'),
    ).toHaveLength(1);
  });

  it('does not grant when Wire says unpaid or the amount is not the exact price', async () => {
    const ctx = await setup();
    const { gift } = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json();
    const stored = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
    await pushWebhook('evt_a', stored.wirePaymentIntentId!);
    expect((await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } })).status).toBe(
      'PENDING_PAYMENT',
    );
    const intent = ctx.wire!.intents.get(stored.wirePaymentIntentId!)!;
    intent.status = 'succeeded';
    intent.amount = toMinor(1000);
    await pushWebhook('evt_b', stored.wirePaymentIntentId!);
    const after = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
    expect(after.status).toBe('PENDING_PAYMENT');
    expect(after.code).toBeNull();
  });

  it('GET /gifts asks Wire, shows the code to the buyer only, and hides it once redeemed', async () => {
    const ctx = await setup();
    const { gift } = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json();
    const stored = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
    ctx.wire!.intents.get(stored.wirePaymentIntentId!)!.status = 'succeeded';
    const mine = await call(app, 'GET', '/v1/gifts', ctx.buyer.accessToken);
    expect(mine.json().gifts).toMatchObject([{ id: gift.id, status: 'PAID' }]);
    const code = mine.json().gifts[0].code as string;
    expect(code).toMatch(CODE);

    const other = await makeMember(app, 'other@example.com');
    expect((await call(app, 'GET', '/v1/gifts', other.accessToken)).json().gifts).toEqual([]);
    expect((await call(app, 'GET', '/v1/gifts')).statusCode).toBe(401);

    expect((await redeem(code, other.accessToken)).statusCode).toBe(200);
    const after = (await call(app, 'GET', '/v1/gifts', ctx.buyer.accessToken)).json().gifts[0];
    expect(after).toMatchObject({ status: 'REDEEMED', code: null });
  });

  it('the cron asks Wire about waiting gifts and pays them', async () => {
    const ctx = await setup();
    const { gift } = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json();
    const stored = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
    ctx.wire!.intents.get(stored.wirePaymentIntentId!)!.status = 'succeeded';
    const payments = createPaymentService({
      db: testDb,
      env: testEnv({ WIRE_API_KEY: 'sk_test_x', WIRE_WEBHOOK_SECRET: SECRET }),
      gateway: ctx.wire!.gateway,
    });
    const result = await syncWaitingGifts(payments).run({ db: testDb, now: new Date() });
    expect(result.affected).toBe(1);
    expect((await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } })).status).toBe('PAID');
  });
});

describe('redeeming a gift', () => {
  it('needs a login and a verified email; a bad format is 400', async () => {
    const ctx = await setup();
    const { code } = await paidGift(ctx);
    expect((await redeem(code)).statusCode).toBe(401);
    const unverified = await makeMember(app, 'u@example.com', { verified: false });
    expect((await redeem(code, unverified.accessToken)).json().error.code).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    expect((await redeem('abc', ctx.buyer.accessToken)).statusCode).toBe(400);
    expect((await testDb.gift.findFirstOrThrow()).status).toBe('PAID');
  });

  it('starts access at once and records everything; typing the code loosely works', async () => {
    const ctx = await setup();
    const { id, code } = await paidGift(ctx);
    const friend = await makeMember(app, 'friend@example.com', { username: 'friend' });
    const res = await redeem(` ${code.toLowerCase().replaceAll('-', ' ')} `, friend.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription).toMatchObject({ status: 'ACTIVE', paymentProvider: 'NONE' });

    const gift = await testDb.gift.findUniqueOrThrow({ where: { id } });
    expect(gift).toMatchObject({ status: 'REDEEMED', redeemedById: friend.userId });
    const sub = await testDb.subscription.findFirstOrThrow({ where: { userId: friend.userId } });
    expect(gift.subscriptionId).toBe(sub.id);
    expect(sub.endsAt!.getTime() - sub.startsAt!.getTime()).toBe(365 * 86_400_000);
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: friend.userId } })).accessUntil,
    ).toEqual(sub.endsAt);
    expect(await testDb.payment.findMany({ where: { subscriptionId: sub.id } })).toMatchObject([
      { method: 'QPAY', amountMnt: 120_000, providerRef: gift.wirePaymentIntentId },
    ]);
    expect(await testDb.auditLog.count({ where: { action: 'gift.redeem' } })).toBe(1);
    expect(
      (await jobsOf('email.send')).filter((j) => j.payload.template === 'paymentApproved'),
    ).toHaveLength(1);
    // The buyer got nothing.
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { id: ctx.buyer.userId } })).accessUntil,
    ).toBeNull();
  });

  it('adds to the access the recipient already has', async () => {
    const ctx = await setup();
    const { code } = await paidGift(ctx);
    const friend = await makeMember(app, 'friend@example.com');
    const end = new Date(Date.now() + 30 * 86_400_000);
    await testDb.subscription.create({
      data: {
        userId: friend.userId,
        planId: ctx.plan.id,
        status: 'ACTIVE',
        referenceCode: 'ONG-HAVE1',
        amountMnt: 1,
        startsAt: new Date(),
        endsAt: end,
      },
    });
    await testDb.user.update({ where: { id: friend.userId }, data: { accessUntil: end } });
    const res = await redeem(code, friend.accessToken);
    expect(new Date(res.json().accessUntil).getTime()).toBe(end.getTime() + 365 * 86_400_000);
  });

  it('a code works once: the second person, and a parallel pair, get GIFT_NOT_REDEEMABLE', async () => {
    const ctx = await setup();
    const { code } = await paidGift(ctx);
    const a = await makeMember(app, 'a@example.com');
    const b = await makeMember(app, 'b@example.com');
    const [ra, rb] = await Promise.all([redeem(code, a.accessToken), redeem(code, b.accessToken)]);
    expect([ra.statusCode, rb.statusCode].sort()).toEqual([200, 404]);
    const loser = ra.statusCode === 404 ? ra : rb;
    expect(loser.json().error.code).toBe('GIFT_NOT_REDEEMABLE');
    expect(await testDb.subscription.count({ where: { status: 'ACTIVE' } })).toBe(1);
    expect(await testDb.payment.count()).toBe(1);
    // And again later.
    const c = await makeMember(app, 'c@example.com');
    expect((await redeem(code, c.accessToken)).statusCode).toBe(404);
  });

  it('a wrong, unpaid, expired or voided code all answer the same, and nothing is granted', async () => {
    const ctx = await setup();
    const unpaid = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json().gift;
    await testDb.gift.update({ where: { id: unpaid.id }, data: { code: 'AAAA-BBBB-CCCC' } });
    const { id, code } = await paidGift(ctx);
    const friend = await makeMember(app, 'friend@example.com');

    const answers = [];
    answers.push(await redeem('ZZZZ-ZZZZ-ZZZZ', friend.accessToken));
    answers.push(await redeem('AAAA-BBBB-CCCC', friend.accessToken)); // a code on an unpaid gift
    await testDb.gift.update({ where: { id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    answers.push(await redeem(code, friend.accessToken));
    await testDb.gift.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() + 86_400_000), status: 'VOID' },
    });
    answers.push(await redeem(code, friend.accessToken));
    for (const res of answers) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('GIFT_NOT_REDEEMABLE');
    }
    expect(await testDb.subscription.count()).toBe(0);
  });

  it('is rate limited per address: the 11th try in 15 minutes is 429', async () => {
    const ctx = await setup();
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await redeem('ZZZZ-ZZZZ-ZZZZ', ctx.buyer.accessToken)).statusCode;
    }
    expect(last).toBe(429);
  });

  it('later plan edits do not change a gift', async () => {
    const ctx = await setup();
    const { code } = await paidGift(ctx);
    const admin = await makeAdmin(app);
    const edited = await call(app, 'PATCH', `/v1/admin/plans/${ctx.plan.id}`, admin.accessToken, {
      priceMnt: 999_000,
    });
    expect(edited.statusCode).toBe(200);
    await testDb.plan.update({ where: { id: ctx.plan.id }, data: { durationDays: 30 } });
    const friend = await makeMember(app, 'friend@example.com');
    const res = await redeem(code, friend.accessToken);
    expect(res.json().subscription.amountMnt).toBe(120_000);
    const sub = await testDb.subscription.findFirstOrThrow({ where: { userId: friend.userId } });
    expect(sub.endsAt!.getTime() - sub.startsAt!.getTime()).toBe(365 * 86_400_000);
  });
});

describe('expiry', () => {
  it('unpaid gifts expire after 7 days and unredeemed paid gifts at their end; nothing else changes', async () => {
    const ctx = await setup();
    const { id: paidId } = await paidGift(ctx);
    const old = (
      await testDb.gift.create({
        data: {
          buyerId: ctx.buyer.userId,
          planId: ctx.plan.id,
          amountMnt: 1,
          durationDays: 30,
          createdAt: new Date(Date.now() - 8 * 86_400_000),
        },
      })
    ).id;
    const fresh = (
      await testDb.gift.create({
        data: { buyerId: ctx.buyer.userId, planId: ctx.plan.id, amountMnt: 1, durationDays: 30 },
      })
    ).id;
    await testDb.gift.update({
      where: { id: paidId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await expireGifts.run({ db: testDb, now: new Date() })).affected).toBe(2);
    const status = async (id: string) =>
      (await testDb.gift.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(old)).toBe('EXPIRED');
    expect(await status(paidId)).toBe('EXPIRED');
    expect(await status(fresh)).toBe('PENDING_PAYMENT');
    expect((await expireGifts.run({ db: testDb, now: new Date() })).affected).toBe(0);
  });
});

describe('mock checkout for a gift (development, no Wire keys)', () => {
  const mock = (id: string, token: string, outcome: string) =>
    call(app, 'POST', `/v1/gifts/${id}/mock`, token, { outcome });

  it('"success" pays it and issues the code; "cancel" closes it; only the buyer may press', async () => {
    const ctx = await setup(null);
    const { gift } = (await buy(ctx.plan.id, ctx.buyer.accessToken)).json();
    expect(gift).toMatchObject({ checkoutUrl: `/pay/mock/gift/${gift.id}` });
    const other = await makeMember(app, 'other@example.com');
    expect((await mock(gift.id, other.accessToken, 'success')).statusCode).toBe(404);
    expect((await mock(gift.id, ctx.buyer.accessToken, 'success')).statusCode).toBe(204);
    await mock(gift.id, ctx.buyer.accessToken, 'success');
    const paid = await testDb.gift.findUniqueOrThrow({ where: { id: gift.id } });
    expect(paid.status).toBe('PAID');
    expect(paid.code).toMatch(CODE);
    expect(
      (await jobsOf('email.send')).filter((j) => j.payload.template === 'giftPurchased'),
    ).toHaveLength(1);

    const second = await makePlan({ name: 'Хоёр' });
    const g2 = (await buy(second.id, ctx.buyer.accessToken)).json().gift;
    await mock(g2.id, ctx.buyer.accessToken, 'cancel');
    expect((await testDb.gift.findUniqueOrThrow({ where: { id: g2.id } })).status).toBe(
      'CANCELLED',
    );
    expect((await mock(g2.id, ctx.buyer.accessToken, 'maybe')).statusCode).toBe(400);
  });
});

describe('admin gifts', () => {
  const ROUTES: Array<['GET' | 'POST', string, unknown?]> = [
    ['GET', '/v1/admin/gifts'],
    ['POST', '/v1/admin/gifts/x/void', { reason: 'refund' }],
  ];

  it('need an admin', async () => {
    const { buyer } = await setup();
    for (const [method, url, body] of ROUTES) {
      expect((await call(app, method, url, undefined, body)).statusCode, url).toBe(401);
      expect((await call(app, method, url, buyer.accessToken, body)).statusCode, url).toBe(403);
    }
  });

  it('lists gifts by status, finds one by code, buyer or recipient, and sums the unredeemed money', async () => {
    const ctx = await setup();
    const { code } = await paidGift(ctx);
    const friend = await makeMember(app, 'friend@example.com', { username: 'friendly' });
    const admin = await makeAdmin(app);

    const waiting = await call(app, 'GET', '/v1/admin/gifts', admin.accessToken);
    expect(waiting.json()).toMatchObject({
      total: 1,
      unredeemedMnt: 120_000,
      items: [{ status: 'PAID', code, buyer: { username: 'buyer' } }],
    });
    const byCode = await call(
      app,
      'GET',
      `/v1/admin/gifts?q=${code.slice(0, 4)}`,
      admin.accessToken,
    );
    expect(byCode.json().total).toBe(1);

    await redeem(code, friend.accessToken);
    const done = await call(
      app,
      'GET',
      '/v1/admin/gifts?status=REDEEMED&q=friendly',
      admin.accessToken,
    );
    expect(done.json()).toMatchObject({
      total: 1,
      unredeemedMnt: 0,
      items: [{ status: 'REDEEMED', redeemedBy: { username: 'friendly' } }],
    });
    expect(
      (await call(app, 'GET', '/v1/admin/gifts?status=NOPE', admin.accessToken)).statusCode,
    ).toBe(400);
  });

  it('voids a paid, unredeemed gift once, with a reason and an audit row; then it cannot be redeemed', async () => {
    const ctx = await setup();
    const { id, code } = await paidGift(ctx);
    const admin = await makeAdmin(app);
    expect(
      (await call(app, 'POST', `/v1/admin/gifts/${id}/void`, admin.accessToken, {})).statusCode,
    ).toBe(400);
    const res = await call(app, 'POST', `/v1/admin/gifts/${id}/void`, admin.accessToken, {
      reason: 'Буцаалт',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().gift).toMatchObject({ status: 'VOID', voidReason: 'Буцаалт' });
    expect(await testDb.auditLog.count({ where: { action: 'gift.void' } })).toBe(1);
    const again = await call(app, 'POST', `/v1/admin/gifts/${id}/void`, admin.accessToken, {
      reason: 'Буцаалт',
    });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe('GIFT_STATE');
    const friend = await makeMember(app, 'friend@example.com');
    expect((await redeem(code, friend.accessToken)).statusCode).toBe(404);
    expect(
      (await call(app, 'POST', '/v1/admin/gifts/nope/void', admin.accessToken, { reason: 'x' }))
        .statusCode,
    ).toBe(404);
  });

  it('a redeemed gift cannot be voided (revoke the subscription instead)', async () => {
    const ctx = await setup();
    const { id, code } = await paidGift(ctx);
    const friend = await makeMember(app, 'friend@example.com');
    await redeem(code, friend.accessToken);
    const admin = await makeAdmin(app);
    const res = await call(app, 'POST', `/v1/admin/gifts/${id}/void`, admin.accessToken, {
      reason: 'Буцаалт',
    });
    expect(res.statusCode).toBe(409);
    expect((await testDb.gift.findUniqueOrThrow({ where: { id } })).status).toBe('REDEEMED');
  });
});
