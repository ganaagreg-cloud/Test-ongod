import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PAYMENT_TEST, testDb } from './helpers';
import { DAY, call, jpeg, makeMember, makePlan, multipart, paymentApp, png } from './admin-helpers';

let app: FastifyInstance;
let dir: string;

beforeEach(async () => {
  ({ app, dir } = await paymentApp());
});
afterEach(async () => {
  await app.close();
});

const files = () => readdirSync(dir);

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
      ['POST', '/v1/subscriptions/x/submitted'],
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
  it('creates PENDING_PAYMENT with amount, an ONG- reference code and the bank details', async () => {
    const plan = await makePlan({ priceMnt: 120_000 });
    const user = await makeMember(app);

    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.subscription).toMatchObject({
      status: 'PENDING_PAYMENT',
      amountMnt: 120_000,
      hasReceipt: false,
      plan: { id: plan.id, durationDays: 365 },
    });
    // No look-alike characters (0/O, 1/I/L) in the code people type into a bank app.
    expect(body.subscription.referenceCode).toMatch(/^ONG-[2-9A-HJKMNP-Z]{5}$/);
    expect(body.bank).toEqual({
      bankName: PAYMENT_TEST.BANK_NAME,
      accountNumber: PAYMENT_TEST.BANK_ACCOUNT,
      accountHolder: PAYMENT_TEST.BANK_ACCOUNT_HOLDER,
    });
  });

  it('refuses an unverified email: EMAIL_NOT_VERIFIED, nothing is created', async () => {
    const plan = await makePlan();
    const user = await makeMember(app, 'new@example.com', { verified: false });

    const res = await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(await testDb.subscription.count()).toBe(0);
  });

  it('allows one open request per user, also under parallel requests', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);

    const results = await Promise.all(
      [1, 2, 3].map(() =>
        call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id }),
      ),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe(
      'OPEN_SUBSCRIPTION_EXISTS',
    );
    expect(await testDb.subscription.count()).toBe(1);
  });

  it('keeps blocking while the payment is submitted, and allows a new request after a rejection', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    const first = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json().subscription;

    await testDb.subscription.update({
      where: { id: first.id },
      data: { status: 'PAYMENT_SUBMITTED' },
    });
    const blocked = await call(app, 'POST', '/v1/subscriptions', user.accessToken, {
      planId: plan.id,
    });
    expect(blocked.statusCode).toBe(409);

    await testDb.subscription.update({ where: { id: first.id }, data: { status: 'REJECTED' } });
    const again = await call(app, 'POST', '/v1/subscriptions', user.accessToken, {
      planId: plan.id,
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
    expect(res.json()).toEqual({ subscription: null, accessUntil: null, bank: null });
  });

  it('shows the open request with bank details only while payment is still due', async () => {
    const plan = await makePlan();
    const user = await makeMember(app);
    const created = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json().subscription;

    let res = (await call(app, 'GET', '/v1/subscriptions/current', user.accessToken)).json();
    expect(res.subscription.id).toBe(created.id);
    expect(res.bank).not.toBeNull();

    await testDb.subscription.update({
      where: { id: created.id },
      data: { status: 'PAYMENT_SUBMITTED' },
    });
    res = (await call(app, 'GET', '/v1/subscriptions/current', user.accessToken)).json();
    expect(res.subscription.status).toBe('PAYMENT_SUBMITTED');
    expect(res.bank).toBeNull();
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

describe('POST /v1/subscriptions/:id/submitted', () => {
  const transferAt = () => new Date(Date.now() - 3600_000).toISOString();

  async function pending(email = 'member@example.com') {
    const plan = await makePlan();
    const user = await makeMember(app, email);
    const { subscription } = (
      await call(app, 'POST', '/v1/subscriptions', user.accessToken, { planId: plan.id })
    ).json();
    return { user, subscription };
  }

  const submit = async (
    id: string,
    token: string,
    fields: Record<string, string>,
    file?: Parameters<typeof multipart>[1],
  ) => {
    const { payload, headers } = await multipart(fields, file);
    return app.inject({
      method: 'POST',
      url: `/v1/subscriptions/${id}/submitted`,
      payload,
      headers: { ...headers, authorization: `Bearer ${token}` },
    });
  };

  it('moves to PAYMENT_SUBMITTED with the note, transfer time and a privately stored receipt', async () => {
    const { user, subscription } = await pending();
    const image = jpeg(2048);

    const res = await submit(
      subscription.id,
      user.accessToken,
      { payerNote: 'Хаан банкаар шилжүүлсэн', transferAt: transferAt() },
      { name: 'receipt.jpg', data: image },
    );
    expect(res.statusCode).toBe(200);
    const dto = res.json().subscription;
    expect(dto).toMatchObject({
      status: 'PAYMENT_SUBMITTED',
      payerNote: 'Хаан банкаар шилжүүлсэн',
      hasReceipt: true,
    });
    expect(dto.submittedAt).not.toBeNull();

    // Stored on our disk under a random name; the DB key is never sent to the client.
    const row = await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(row.proofImagePath).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(JSON.stringify(res.json())).not.toContain(row.proofImagePath!);
    expect(files()).toEqual([row.proofImagePath]);
    expect(readFileSync(join(dir, row.proofImagePath!)).equals(image)).toBe(true);
  });

  it('works without a receipt and without a note', async () => {
    const { user, subscription } = await pending();
    const res = await submit(subscription.id, user.accessToken, { transferAt: transferAt() });
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription).toMatchObject({ hasReceipt: false, payerNote: null });
    expect(files()).toEqual([]);
  });

  it('treats an empty file field (nothing chosen in the browser) as no receipt', async () => {
    const { user, subscription } = await pending();
    const res = await submit(
      subscription.id,
      user.accessToken,
      { transferAt: transferAt() },
      { name: '', data: Buffer.alloc(0), type: 'application/octet-stream' },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription.hasReceipt).toBe(false);
  });

  it('accepts a PNG and ignores the file name and declared type (the bytes decide)', async () => {
    const { user, subscription } = await pending();
    const res = await submit(
      subscription.id,
      user.accessToken,
      { transferAt: transferAt() },
      { name: '../../evil.php', data: png(), type: 'text/html' },
    );
    expect(res.statusCode).toBe(200);
    const row = await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } });
    expect(row.proofImagePath).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it('accepts exactly 5 MB and refuses more: 413 RECEIPT_TOO_LARGE, nothing stored, still PENDING', async () => {
    const { user, subscription } = await pending();

    const big = await submit(
      subscription.id,
      user.accessToken,
      { transferAt: transferAt() },
      { name: 'big.jpg', data: jpeg(5 * 1024 * 1024 + 1) },
    );
    expect(big.statusCode).toBe(413);
    expect(big.json().error.code).toBe('RECEIPT_TOO_LARGE');
    expect(files()).toEqual([]);
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe('PENDING_PAYMENT');

    const exact = await submit(
      subscription.id,
      user.accessToken,
      { transferAt: transferAt() },
      { name: 'ok.jpg', data: jpeg(5 * 1024 * 1024) },
    );
    expect(exact.statusCode).toBe(200);
  });

  it('refuses files that are not JPEG, PNG or WebP images: 400 RECEIPT_INVALID', async () => {
    const { user, subscription } = await pending();
    for (const data of [
      Buffer.from('<?php echo 1; ?>'),
      Buffer.from('%PDF-1.7 fake'),
      Buffer.from('GIF89a....'),
    ]) {
      const res = await submit(
        subscription.id,
        user.accessToken,
        { transferAt: transferAt() },
        { name: 'receipt.jpg', data, type: 'image/jpeg' },
      );
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('RECEIPT_INVALID');
    }
    expect(files()).toEqual([]);
  });

  it('submits only once: a second (or parallel) submit gets 409 and stores no extra file', async () => {
    const { user, subscription } = await pending();
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        submit(
          subscription.id,
          user.accessToken,
          { transferAt: transferAt() },
          { name: 'r.jpg', data: jpeg() },
        ),
      ),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409]);
    expect(results.find((r) => r.statusCode === 409)!.json().error.code).toBe('SUBSCRIPTION_STATE');
    expect(files()).toHaveLength(1);
  });

  it("cannot touch someone else's request: 404", async () => {
    const { subscription } = await pending('a@example.com');
    const other = await makeMember(app, 'b@example.com');
    const res = await submit(subscription.id, other.accessToken, { transferAt: transferAt() });
    expect(res.statusCode).toBe(404);
    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { id: subscription.id } })).status,
    ).toBe('PENDING_PAYMENT');
  });

  it('refuses a request older than 7 days (409 SUBSCRIPTION_EXPIRED) and a missing or future transfer time', async () => {
    const { user, subscription } = await pending();

    expect((await submit(subscription.id, user.accessToken, {})).statusCode).toBe(400);
    expect(
      (
        await submit(subscription.id, user.accessToken, {
          transferAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await submit(subscription.id, user.accessToken, { transferAt: 'yesterday' })).statusCode,
    ).toBe(400);

    await testDb.subscription.update({
      where: { id: subscription.id },
      data: { createdAt: new Date(Date.now() - 8 * DAY) },
    });
    const res = await submit(subscription.id, user.accessToken, { transferAt: transferAt() });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SUBSCRIPTION_EXPIRED');
  });

  it('needs a signed-in user', async () => {
    const { subscription } = await pending();
    const { payload, headers } = await multipart({ transferAt: transferAt() });
    const res = await app.inject({
      method: 'POST',
      url: `/v1/subscriptions/${subscription.id}/submitted`,
      payload,
      headers,
    });
    expect(res.statusCode).toBe(401);
  });

  it('also accepts a plain JSON body (no receipt)', async () => {
    const { user, subscription } = await pending();
    const res = await call(
      app,
      'POST',
      `/v1/subscriptions/${subscription.id}/submitted`,
      user.accessToken,
      {
        transferAt: transferAt(),
        payerNote: '  тэмдэглэл  ',
      },
    );
    expect(res.statusCode).toBe(200);
    expect(res.json().subscription.payerNote).toBe('тэмдэглэл');
  });
});
