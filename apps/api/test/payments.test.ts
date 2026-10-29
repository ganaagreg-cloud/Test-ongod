import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WireGateway, WireIntent } from '../src/payments/wire';
import { toMinor } from '../src/payments/wire';
import { createPaymentService } from '../src/payments/service';
import { expirePendingPayments, syncWaitingPayments } from '../src/cron/tasks';
import { authApp } from './auth-helpers';
import { call, jobsOf, makeMember, makePlan } from './admin-helpers';
import { CRON_SECRET, testDb, testEnv } from './helpers';

const SECRET = 'whsec_test_secret';

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

const sign = (body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

const eventBody = (id: string, type: string, intentId: string) =>
  JSON.stringify({
    id,
    object: 'event',
    type,
    api_version: '2026-01-01',
    data: { object: { id: intentId } },
    livemode: false,
    created: 0,
  });

let app: FastifyInstance;
afterEach(async () => {
  await app?.close();
});

async function setup(
  env: Parameters<typeof authApp>[0] = {},
  wire: ReturnType<typeof fakeWire> | null = fakeWire(),
) {
  app = await authApp(
    { WIRE_API_KEY: 'sk_test_x', WIRE_WEBHOOK_SECRET: SECRET, ...env },
    { wire: wire?.gateway ?? null },
  );
  const plan = await makePlan({ priceMnt: 120_000 });
  const member = await makeMember(app);
  return { wire, plan, member };
}

const apply = async (planId: string, token: string) =>
  call(app, 'POST', '/v1/subscriptions', token, { planId });

const webhook = (body: string, signature: string | undefined) =>
  app.inject({
    method: 'POST',
    url: '/v1/webhooks/wire',
    payload: body,
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'wirepayment-signature': signature } : {}),
    },
  });

const row = (id: string) => testDb.subscription.findUniqueOrThrow({ where: { id } });
const accessUntil = async (userId: string) =>
  (await testDb.user.findUniqueOrThrow({ where: { id: userId } })).accessUntil;

describe('QPay checkout (Wire)', () => {
  it('creates the request and a Wire checkout; the amount sent is the plan price, whole MNT', async () => {
    const { wire, plan, member } = await setup();
    const res = await apply(plan.id, member.accessToken);
    expect(res.statusCode).toBe(201);
    const { subscription } = res.json();
    expect(subscription).toMatchObject({
      status: 'PENDING_PAYMENT',
      paymentProvider: 'WIRE',
      amountMnt: 120_000,
      checkoutUrl: `https://checkout.wire.test/pi_${subscription.id}`,
    });
    expect(wire!.gateway.createCheckout).toHaveBeenCalledTimes(1);
    expect(wire!.gateway.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        subscriptionId: subscription.id,
        amountMnt: 120_000,
        successUrl: 'http://localhost:3000/status',
        cancelUrl: 'http://localhost:3000/pay?canceled=1',
      }),
    );
    expect(wire!.intents.get(`pi_${subscription.id}`)!.amount).toBe(120_000);
    expect(await row(subscription.id)).toMatchObject({
      paymentProvider: 'WIRE',
      wirePaymentIntentId: `pi_${subscription.id}`,
    });
  });

  it('ignores a price in the request body (the plan decides)', async () => {
    const { plan, member } = await setup();
    const res = await call(app, 'POST', '/v1/subscriptions', member.accessToken, {
      planId: plan.id,
      amountMnt: 1,
    });
    expect(res.json().subscription.amountMnt).toBe(120_000);
  });

  it('asking again for the same plan returns the same request and checkout, no second invoice', async () => {
    const { wire, plan, member } = await setup();
    const first = (await apply(plan.id, member.accessToken)).json().subscription;
    const again = await apply(plan.id, member.accessToken);
    expect(again.statusCode).toBe(201);
    expect(again.json().subscription.id).toBe(first.id);
    expect(again.json().subscription.checkoutUrl).toBe(first.checkoutUrl);
    expect(wire!.gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('a different plan while one is unpaid is still 409 (a payment may be running on it)', async () => {
    const { plan, member } = await setup();
    const other = await makePlan({ name: 'Хагас жил', priceMnt: 60_000, durationDays: 180 });
    await apply(plan.id, member.accessToken);
    const res = await apply(other.id, member.accessToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('OPEN_SUBSCRIPTION_EXISTS');
  });

  it('answers 503 and leaves the request open for a retry when Wire is down', async () => {
    const { wire, plan, member } = await setup();
    vi.mocked(wire!.gateway.createCheckout).mockRejectedValueOnce(new Error('wire down'));
    const failed = await apply(plan.id, member.accessToken);
    expect(failed.statusCode).toBe(503);
    expect(failed.json().error.code).toBe('SERVICE_UNAVAILABLE');
    const retry = await apply(plan.id, member.accessToken);
    expect(retry.statusCode).toBe(201);
    expect(retry.json().subscription.checkoutUrl).toMatch(/^https:\/\/checkout\.wire\.test\//);
  });
});

describe('Wire webhook', () => {
  async function pay() {
    const ctx = await setup();
    const { subscription } = (await apply(ctx.plan.id, ctx.member.accessToken)).json();
    const intentId = `pi_${subscription.id}`;
    return { ...ctx, subscription, intentId };
  }

  it('a late succeeded webhook for a request that was paid and has since expired grants nothing (ADR-0047)', async () => {
    const { wire, member, subscription, intentId } = await pay();
    wire!.intents.get(intentId)!.status = 'succeeded';
    const first = eventBody('evt_paid', 'payment_intent.succeeded', intentId);
    await webhook(first, sign(first));
    expect((await row(subscription.id)).status).toBe('ACTIVE');
    // The period ran out and the expiry cron turned it EXPIRED.
    await testDb.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED', endsAt: new Date(Date.now() - 1000) },
    });
    const before = await accessUntil(member.userId);
    const jobs = await testDb.job.count();

    const late = eventBody('evt_late', 'payment_intent.succeeded', intentId);
    expect((await webhook(late, sign(late))).statusCode).toBe(200);

    expect((await row(subscription.id)).status).toBe('EXPIRED');
    expect(await testDb.payment.count({ where: { subscriptionId: subscription.id } })).toBe(1);
    expect(await accessUntil(member.userId)).toEqual(before);
    expect(await testDb.job.count()).toBe(jobs);
  });

  it('a signed payment_intent.succeeded turns the request ACTIVE: access, payment, email', async () => {
    const { wire, member, subscription, intentId } = await pay();
    wire!.intents.get(intentId)!.status = 'succeeded';
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    const res = await webhook(body, sign(body));
    expect(res.statusCode).toBe(200);

    const sub = await row(subscription.id);
    expect(sub.status).toBe('ACTIVE');
    expect(sub.startsAt).not.toBeNull();
    expect(sub.endsAt!.getTime()).toBeGreaterThan(Date.now() + 360 * 86_400_000);
    expect(await accessUntil(member.userId)).toEqual(sub.endsAt);
    const payments = await testDb.payment.findMany({ where: { subscriptionId: subscription.id } });
    expect(payments).toMatchObject([
      { method: 'QPAY', amountMnt: 120_000, providerRef: intentId, status: 'COMPLETED' },
    ]);
    expect(
      (await jobsOf('email.send')).filter((j) => j.payload.template === 'paymentApproved'),
    ).toHaveLength(1);
    expect(await testDb.auditLog.count({ where: { action: 'subscription.paid' } })).toBe(1);
  });

  it('the same event twice is handled once (duplicate), and two events for one payment grant once', async () => {
    const { wire, subscription, intentId } = await pay();
    wire!.intents.get(intentId)!.status = 'succeeded';
    const a = eventBody('evt_a', 'payment_intent.succeeded', intentId);
    const first = await webhook(a, sign(a));
    const replay = await webhook(a, sign(a));
    expect(first.statusCode).toBe(200);
    expect(replay.json()).toEqual({ ok: true, duplicate: true });

    // Another event id for the same payment, sent in parallel.
    const b = eventBody('evt_b', 'payment_intent.succeeded', intentId);
    const c = eventBody('evt_c', 'payment_intent.succeeded', intentId);
    await Promise.all([webhook(b, sign(b)), webhook(c, sign(c))]);
    expect(await testDb.payment.count({ where: { subscriptionId: subscription.id } })).toBe(1);
    expect(
      (await jobsOf('email.send')).filter((j) => j.payload.template === 'paymentApproved'),
    ).toHaveLength(1);
  });

  it('refuses a missing, wrong or tampered signature (400) and changes nothing', async () => {
    const { wire, subscription, intentId } = await pay();
    wire!.intents.get(intentId)!.status = 'succeeded';
    const body = eventBody('evt_x', 'payment_intent.succeeded', intentId);
    const missing = await webhook(body, undefined);
    expect(missing.statusCode).toBe(400);
    // The shared error shape (audit F08).
    expect(missing.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    expect((await webhook(body, sign(body, 'whsec_other'))).statusCode).toBe(400);
    expect((await webhook(body + ' ', sign(body))).statusCode).toBe(400);
    const old = sign(body, SECRET, Math.floor(Date.now() / 1000) - 3600);
    expect((await webhook(body, old)).statusCode).toBe(400);
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');
    expect(await testDb.webhookEvent.count()).toBe(0);
  });

  it('answers 503 when WIRE_WEBHOOK_SECRET is not set', async () => {
    await setup({ WIRE_WEBHOOK_SECRET: '' });
    const body = eventBody('evt_1', 'payment_intent.succeeded', 'pi_x');
    const res = await webhook(body, sign(body));
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'SERVICE_UNAVAILABLE' } });
  });

  it('records an event only after it was applied, so a retry after a crash still grants (audit F01)', async () => {
    const { wire, subscription, intentId } = await pay();
    wire!.intents.get(intentId)!.status = 'succeeded';
    const body = eventBody('evt_crash', 'payment_intent.succeeded', intentId);
    // A crash between receiving and applying: under the old order the event was already stored.
    // Now nothing is stored until the grant is done, so the retry is not a duplicate.
    vi.mocked(wire!.gateway.retrieveIntent).mockRejectedValueOnce(new Error('process died'));
    expect((await webhook(body, sign(body))).statusCode).toBe(500);
    expect(await testDb.webhookEvent.count()).toBe(0);
    const retry = await webhook(body, sign(body));
    expect(retry.json()).toEqual({ ok: true });
    expect((await row(subscription.id)).status).toBe('ACTIVE');
    expect(await testDb.webhookEvent.count()).toBe(1);
  });

  it('does not trust the payload: Wire still says unpaid, so nothing is granted', async () => {
    const { subscription, intentId } = await pay(); // intent status stays requires_action
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    expect((await webhook(body, sign(body))).statusCode).toBe(200);
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');
  });

  it('does not grant when the paid amount is not the exact price', async () => {
    const { wire, subscription, intentId } = await pay();
    const intent = wire!.intents.get(intentId)!;
    intent.status = 'succeeded';
    intent.amount = 1_200;
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    await webhook(body, sign(body));
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');
    expect(await testDb.payment.count({ where: { subscriptionId: subscription.id } })).toBe(0);
  });

  it('retries: if reading Wire fails the event is forgotten and answers 500, so Wire sends it again', async () => {
    const { wire, subscription, intentId } = await pay();
    vi.mocked(wire!.gateway.retrieveIntent).mockRejectedValueOnce(new Error('wire down'));
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    expect((await webhook(body, sign(body))).statusCode).toBe(500);
    expect(await testDb.webhookEvent.count()).toBe(0);

    wire!.intents.get(intentId)!.status = 'succeeded';
    expect((await webhook(body, sign(body))).statusCode).toBe(200);
    expect((await row(subscription.id)).status).toBe('ACTIVE');
  });

  it('canceled and failed payments close a request that is still waiting, never an active one', async () => {
    const { wire, subscription, intentId } = await pay();
    const canceled = eventBody('evt_c', 'payment_intent.canceled', intentId);
    await webhook(canceled, sign(canceled));
    expect((await row(subscription.id)).status).toBe('CANCELLED');

    // A paid request is not undone by a late "failed" event.
    const ctx = await (async () => {
      const m = await makeMember(app, 'second@example.com');
      const { subscription: s } = (await apply((await makePlan()).id, m.accessToken)).json();
      return { s, id: `pi_${s.id}` };
    })();
    wire!.intents.get(ctx.id)!.status = 'succeeded';
    const ok = eventBody('evt_ok', 'payment_intent.succeeded', ctx.id);
    await webhook(ok, sign(ok));
    const failed = eventBody('evt_f', 'payment_intent.payment_failed', ctx.id);
    await webhook(failed, sign(failed));
    expect((await row(ctx.s.id)).status).toBe('ACTIVE');
  });

  it('ignores other event types and payments that are not ours', async () => {
    await pay();
    const other = eventBody('evt_o', 'charge.refunded', 'ch_1');
    expect((await webhook(other, sign(other))).json()).toEqual({ ok: true, ignored: true });
    const stranger = eventBody('evt_s', 'payment_intent.succeeded', 'pi_someone_else');
    expect((await webhook(stranger, sign(stranger))).json()).toEqual({ ok: true, unknown: true });
  });

  it('a payment that arrives after the 7-day expiry still grants the access that was paid for', async () => {
    const { wire, subscription, intentId } = await pay();
    await testDb.subscription.update({
      where: { id: subscription.id },
      data: { status: 'EXPIRED' },
    });
    wire!.intents.get(intentId)!.status = 'succeeded';
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    await webhook(body, sign(body));
    expect((await row(subscription.id)).status).toBe('ACTIVE');
  });

  it('never reactivates a request an admin rejected or revoked', async () => {
    const { wire, subscription, intentId } = await pay();
    await testDb.subscription.update({
      where: { id: subscription.id },
      data: { status: 'REVOKED' },
    });
    wire!.intents.get(intentId)!.status = 'succeeded';
    const body = eventBody('evt_1', 'payment_intent.succeeded', intentId);
    await webhook(body, sign(body));
    expect((await row(subscription.id)).status).toBe('REVOKED');
  });
});

describe('status poll (works before the webhook is set up)', () => {
  it('GET /subscriptions/current asks Wire and activates a paid request', async () => {
    const { wire, plan, member } = await setup();
    const { subscription } = (await apply(plan.id, member.accessToken)).json();
    const waiting = (
      await call(app, 'GET', '/v1/subscriptions/current', member.accessToken)
    ).json();
    expect(waiting.subscription.status).toBe('PENDING_PAYMENT');
    expect(waiting.accessUntil).toBeNull();

    wire!.intents.get(`pi_${subscription.id}`)!.status = 'succeeded';
    const paid = (await call(app, 'GET', '/v1/subscriptions/current', member.accessToken)).json();
    expect(paid.subscription.status).toBe('ACTIVE');
    expect(paid.accessUntil).toBe(paid.subscription.endsAt);
  });

  it('a Wire outage does not break the status call', async () => {
    const { wire, plan, member } = await setup();
    await apply(plan.id, member.accessToken);
    vi.mocked(wire!.gateway.retrieveIntent).mockRejectedValue(new Error('wire down'));
    const res = await call(app, 'GET', '/v1/subscriptions/current', member.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription.status).toBe('PENDING_PAYMENT');
  });

  it('a canceled intent closes the request', async () => {
    const { wire, plan, member } = await setup();
    const { subscription } = (await apply(plan.id, member.accessToken)).json();
    wire!.intents.get(`pi_${subscription.id}`)!.status = 'canceled';
    const res = (await call(app, 'GET', '/v1/subscriptions/current', member.accessToken)).json();
    expect(res.subscription.status).toBe('CANCELLED');
  });
});

describe('production safety', () => {
  const production = { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://example.mn' } as const;

  it('a test-key (livemode false) payment never unlocks in production', async () => {
    const { wire, plan, member } = await setup(production);
    const { subscription } = (await apply(plan.id, member.accessToken)).json();
    const intent = wire!.intents.get(`pi_${subscription.id}`)!;
    intent.status = 'succeeded';
    const body = eventBody('evt_1', 'payment_intent.succeeded', intent.id);
    await webhook(body, sign(body));
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');

    intent.livemode = true;
    const again = eventBody('evt_2', 'payment_intent.succeeded', intent.id);
    await webhook(again, sign(again));
    expect((await row(subscription.id)).status).toBe('ACTIVE');
  });

  it('without Wire keys, production has no mock: applying is 503 and nothing is created', async () => {
    const { plan, member } = await setup(production, null);
    const res = await apply(plan.id, member.accessToken);
    expect(res.statusCode).toBe(503);
    expect(await testDb.subscription.count()).toBe(0);
  });
});

describe('mock checkout (development, no Wire keys)', () => {
  const mock = (id: string, token: string, outcome: string) =>
    call(app, 'POST', `/v1/subscriptions/${id}/mock`, token, { outcome });

  async function pending(env: Parameters<typeof authApp>[0] = {}) {
    const ctx = await setup(env, null);
    const { subscription } = (await apply(ctx.plan.id, ctx.member.accessToken)).json();
    return { ...ctx, subscription };
  }

  it('"success" grants access like a real payment; "cancel" closes the request', async () => {
    const { member, subscription } = await pending();
    expect(subscription).toMatchObject({
      paymentProvider: 'MOCK',
      checkoutUrl: `/pay/mock/${subscription.id}`,
    });
    const res = await mock(subscription.id, member.accessToken, 'success');
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription.status).toBe('ACTIVE');
    expect(await accessUntil(member.userId)).not.toBeNull();
    // Pressing it again changes nothing.
    await mock(subscription.id, member.accessToken, 'success');
    expect(await testDb.payment.count({ where: { subscriptionId: subscription.id } })).toBe(1);

    const other = await makeMember(app, 'other@example.com');
    const second = (await apply((await makePlan({ name: 'B' })).id, other.accessToken)).json();
    const cancelled = await mock(second.subscription.id, other.accessToken, 'cancel');
    expect(cancelled.json().subscription.status).toBe('CANCELLED');
  });

  it("is only for the owner's own request (404 for someone else) and needs a login", async () => {
    const { subscription } = await pending();
    const stranger = await makeMember(app, 'stranger@example.com');
    expect((await mock(subscription.id, stranger.accessToken, 'success')).statusCode).toBe(404);
    expect((await call(app, 'POST', `/v1/subscriptions/${subscription.id}/mock`)).statusCode).toBe(
      401,
    );
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');
  });

  it('validates the outcome', async () => {
    const { member, subscription } = await pending();
    expect((await mock(subscription.id, member.accessToken, 'maybe')).statusCode).toBe(400);
  });

  it('refuses a request that belongs to Wire: the mock cannot pay a real invoice', async () => {
    const { plan, member } = await setup();
    const { subscription } = (await apply(plan.id, member.accessToken)).json();
    expect((await mock(subscription.id, member.accessToken, 'success')).statusCode).toBe(404);
    expect((await row(subscription.id)).status).toBe('PENDING_PAYMENT');
  });

  it('is refused in production, and ALLOW_MOCK_PAYMENTS cannot switch it on (ADR-0072)', async () => {
    const prod = { NODE_ENV: 'production', PUBLIC_BASE_URL: 'https://example.mn' } as const;
    // A mock request that exists in the database cannot be paid by the mock in production.
    const { plan, member } = await setup(prod, null);
    const sub = await testDb.subscription.create({
      data: {
        userId: member.userId,
        planId: plan.id,
        referenceCode: 'ONG-TEST2',
        amountMnt: 120_000,
        paymentProvider: 'MOCK',
        checkoutUrl: '/pay/mock/x',
      },
    });
    expect((await mock(sub.id, member.accessToken, 'success')).statusCode).toBe(404);
    expect((await row(sub.id)).status).toBe('PENDING_PAYMENT');
    // Payments are off: the plans are listed, not sold, and a new request is refused.
    const plans = await app.inject({ method: 'GET', url: '/v1/plans' });
    expect(plans.json().paymentsOpen).toBe(false);
    expect(plans.json().plans.length).toBeGreaterThan(0);
    expect((await apply(plan.id, member.accessToken)).statusCode).toBe(503);
    await app.close();

    // The old switch now stops the server from starting at all.
    await expect(async () =>
      authApp({ ...prod, ALLOW_MOCK_PAYMENTS: '1' }, { wire: null }),
    ).rejects.toThrow(/ALLOW_MOCK_PAYMENTS/);
    app = await authApp(prod, { wire: null });
  });

  it('says payments are open in development (mock) and with Wire set up', async () => {
    await setup();
    expect((await app.inject({ method: 'GET', url: '/v1/plans' })).json().paymentsOpen).toBe(true);
  });
});

// ADR-0045 item 3: the cron tick asks Wire about waiting requests, so a lost webhook is recovered.
describe('cron: syncWaitingPayments', () => {
  const DAY_MS = 86_400_000;
  let seq = 0;

  async function request(
    over: {
      status?: 'PENDING_PAYMENT' | 'EXPIRED' | 'CANCELLED' | 'ACTIVE';
      provider?: 'WIRE' | 'MOCK' | 'NONE';
      ageDays?: number;
      intent?: boolean;
    } = {},
  ) {
    const n = ++seq;
    const user = await testDb.user.create({
      data: {
        username: `sync${n}`,
        email: `sync${n}@example.com`,
        firstName: 'А',
        lastName: 'Б',
        phone: `9900${n}`,
      },
    });
    const plan = await makePlan({ priceMnt: 120_000 });
    const provider = over.provider ?? 'WIRE';
    const intentId = `pi_sync_${n}`;
    const sub = await testDb.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        amountMnt: 120_000,
        referenceCode: `ONG-S${String(n).padStart(4, '0')}`,
        status: over.status ?? 'PENDING_PAYMENT',
        paymentProvider: provider,
        wirePaymentIntentId: over.intent === false || provider !== 'WIRE' ? null : intentId,
        createdAt: new Date(Date.now() - (over.ageDays ?? 1) * DAY_MS),
      },
    });
    return { sub, intentId, userId: user.id };
  }

  function makeTask(wire = fakeWire(), opts: Parameters<typeof syncWaitingPayments>[1] = {}) {
    const payments = createPaymentService({
      db: testDb,
      env: testEnv({ WIRE_API_KEY: 'sk_test_x', WIRE_WEBHOOK_SECRET: SECRET }),
      gateway: wire.gateway,
    });
    const task = syncWaitingPayments(payments, opts);
    return { wire, run: () => task.run({ db: testDb, now: new Date() }) };
  }
  const paid = (wire: ReturnType<typeof fakeWire>, id: string, amount = toMinor(120_000)) =>
    wire.intents.set(id, { id, status: 'succeeded', amount, livemode: false });

  it('grants a paid PENDING_PAYMENT request once, even over two ticks', async () => {
    const { wire, run } = makeTask();
    const { sub, intentId, userId } = await request();
    paid(wire, intentId);

    expect(await run()).toEqual({ affected: 1 });
    expect(await run()).toEqual({ affected: 0 });

    expect((await row(sub.id)).status).toBe('ACTIVE');
    expect(await testDb.payment.count({ where: { subscriptionId: sub.id } })).toBe(1);
    expect(await accessUntil(userId)).toEqual((await row(sub.id)).endsAt);
  });

  it('never grants again a request that was paid and then expired normally (ADR-0047)', async () => {
    const { wire, run } = makeTask();
    const { sub, intentId, userId } = await request();
    paid(wire, intentId);
    expect(await run()).toEqual({ affected: 1 });
    // The period ran out: EXPIRED, with the period and the Payment of the first grant.
    await testDb.subscription.update({
      where: { id: sub.id },
      data: { status: 'EXPIRED', endsAt: new Date(Date.now() - 1000) },
    });
    const before = await accessUntil(userId);
    const jobs = await testDb.job.count();

    expect(await run()).toEqual({ affected: 0 });
    expect(await run()).toEqual({ affected: 0 });

    expect((await row(sub.id)).status).toBe('EXPIRED');
    expect(await testDb.payment.count({ where: { subscriptionId: sub.id } })).toBe(1);
    expect(await accessUntil(userId)).toEqual(before);
    expect(await testDb.job.count()).toBe(jobs);
  });

  it('grants exactly once an unpaid request that expired at 7 days and was paid after', async () => {
    const { wire, run } = makeTask();
    const { sub, intentId } = await request({ status: 'EXPIRED', ageDays: 8 });
    paid(wire, intentId);

    expect(await run()).toEqual({ affected: 1 });
    expect(await run()).toEqual({ affected: 0 });
    expect((await row(sub.id)).status).toBe('ACTIVE');
    expect(await testDb.payment.count({ where: { subscriptionId: sub.id } })).toBe(1);
  });

  it('grants an EXPIRED request whose payment succeeded, but not a wrong amount', async () => {
    const { wire, run } = makeTask();
    const expired = await request({ status: 'EXPIRED', ageDays: 8 });
    const wrong = await request();
    paid(wire, expired.intentId);
    paid(wire, wrong.intentId, 1_200);

    expect(await run()).toEqual({ affected: 1 });
    expect((await row(expired.sub.id)).status).toBe('ACTIVE');
    expect((await row(wrong.sub.id)).status).toBe('PENDING_PAYMENT');
    expect(await testDb.payment.count({ where: { subscriptionId: wrong.sub.id } })).toBe(0);
  });

  it('ignores old, MOCK, NONE, intent-less, CANCELLED and ACTIVE requests (Wire is not asked)', async () => {
    const { wire, run } = makeTask();
    const others = [
      await request({ ageDays: 11 }),
      await request({ status: 'EXPIRED', ageDays: 11 }),
      await request({ provider: 'MOCK' }),
      await request({ provider: 'NONE' }),
      await request({ intent: false }),
      await request({ status: 'CANCELLED' }),
      await request({ status: 'ACTIVE' }),
    ];
    for (const o of others) paid(wire, o.intentId);

    expect(await run()).toEqual({ affected: 0 });
    expect(wire.gateway.retrieveIntent).not.toHaveBeenCalled();
    for (const o of others) expect((await row(o.sub.id)).status).toBe(o.sub.status);
  });

  it('a Wire outage does not fail the tick, and the other requests are still synced', async () => {
    const { wire, run } = makeTask();
    const down = await request({ ageDays: 1 }); // newest: asked first, Wire fails
    const ok = await request({ ageDays: 2 });
    paid(wire, ok.intentId);
    vi.mocked(wire.gateway.retrieveIntent).mockRejectedValueOnce(new Error('wire down'));

    expect(await run()).toEqual({ affected: 1 });
    expect((await row(down.sub.id)).status).toBe('PENDING_PAYMENT');
    expect((await row(ok.sub.id)).status).toBe('ACTIVE');
  });

  it('asks Wire about at most 50 requests per tick, newest first (ADR-0047)', async () => {
    const { wire, run } = makeTask();
    for (let i = 0; i < 52; i++) await request({ ageDays: 9 - i * 0.1 });

    expect(await run()).toEqual({ affected: 0 });
    expect(wire.gateway.retrieveIntent).toHaveBeenCalledTimes(50);
    const asked = vi.mocked(wire.gateway.retrieveIntent).mock.calls.map((c) => c[0]);
    expect(asked[0]).toBe(`pi_sync_${seq}`);
    expect(asked).not.toContain(`pi_sync_${seq - 51}`);
    expect(asked).not.toContain(`pi_sync_${seq - 50}`);
  });

  it('newest first with a small cap: abandoned old checkouts do not starve a new payer', async () => {
    const { wire, run } = makeTask(undefined, { limit: 2 });
    for (const ageDays of [9, 8, 7]) await request({ ageDays });
    const fresh = await request({ ageDays: 0.01 });
    paid(wire, fresh.intentId);

    expect(await run()).toEqual({ affected: 1 });
    expect((await row(fresh.sub.id)).status).toBe('ACTIVE');
    const asked = vi.mocked(wire.gateway.retrieveIntent).mock.calls.map((c) => c[0]);
    expect(asked).toEqual([fresh.intentId, `pi_sync_${seq - 1}`]);
  });

  it('a hanging Wire cannot hold the tick past the budget plus one call timeout', async () => {
    const wire = fakeWire();
    vi.mocked(wire.gateway.retrieveIntent).mockImplementation(() => new Promise(() => {}));
    const { run } = makeTask(wire, { budgetMs: 120, callTimeoutMs: 50 });
    const subs = [];
    for (let i = 0; i < 6; i++) subs.push(await request({ ageDays: 1 + i }));

    const started = Date.now();
    expect(await run()).toEqual({ affected: 0 });
    const took = Date.now() - started;
    expect(took).toBeLessThan(120 + 50 + 400);

    // Calls start only inside the budget; the rest are left for the next tick.
    const calls = vi.mocked(wire.gateway.retrieveIntent).mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThan(6);
    for (const s of subs) expect((await row(s.sub.id)).status).toBe('PENDING_PAYMENT');

    // Later work in the tick still runs.
    expect(await expirePendingPayments.run({ db: testDb, now: new Date() })).toEqual({
      affected: 0,
    });
  });

  it('a call abandoned by the timeout that fails later causes no unhandled rejection', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (err: unknown) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);
    try {
      await request();
      const late = {
        sync: () =>
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('late')), 80)),
      } as unknown as Parameters<typeof syncWaitingPayments>[0];
      const task = syncWaitingPayments(late, { budgetMs: 1000, callTimeoutMs: 20 });
      expect(await task.run({ db: testDb, now: new Date() })).toEqual({ affected: 0 });
      await new Promise((r) => setTimeout(r, 200));
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('runs first in the default cron tick', async () => {
    const { wire, plan, member } = await setup();
    const { subscription } = (await apply(plan.id, member.accessToken)).json();
    wire!.intents.get(`pi_${subscription.id}`)!.status = 'succeeded';

    const res = await app.inject({
      method: 'POST',
      url: '/v1/cron/tick',
      headers: { 'x-cron-secret': CRON_SECRET },
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().tasks)[0]).toBe('syncWaitingPayments');
    expect(res.json().tasks.syncWaitingPayments).toEqual({ affected: 1 });
    expect((await row(subscription.id)).status).toBe('ACTIVE');
  });
});
