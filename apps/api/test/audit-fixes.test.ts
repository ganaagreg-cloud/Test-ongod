import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { authApp, device, person, post, signedIn } from './auth-helpers';
import { testDb, testEnv } from './helpers';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('refresh is not limited per IP (audit C-01)', () => {
  it('refresh keeps working past the IP ceiling', async () => {
    app = await authApp({ AUTH_RATE_LIMIT_IP_MAX: '3' });
    const user = await signedIn(app);
    let refreshToken = user.refreshToken;
    for (let i = 0; i < 6; i++) {
      const res = await post(app, '/v1/auth/refresh', {
        refreshToken,
        deviceId: user.deviceId,
      });
      expect(res.statusCode, `refresh ${i}`).toBe(200);
      refreshToken = res.json().refreshToken;
    }
  });
});

describe('the global limit only counts API calls (audit C-01)', () => {
  it('/health and static paths are not counted, /v1 calls are', async () => {
    app = await authApp({ RATE_LIMIT_MAX: '2' });
    for (let i = 0; i < 6; i++) {
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    }
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) {
      codes.push((await app.inject({ method: 'GET', url: '/v1/plans' })).statusCode);
    }
    expect(codes.slice(0, 2)).toEqual([200, 200]);
    expect(codes.slice(2)).toEqual([429, 429]);
  });
});

describe('device platform survives a refresh (audit C-06)', () => {
  it('keeps the platform and model from the login', async () => {
    app = await authApp();
    const user = await signedIn(app, { device: device(1, 'ios') });
    const res = await post(app, '/v1/auth/refresh', {
      refreshToken: user.refreshToken,
      deviceId: user.deviceId,
    });
    expect(res.statusCode).toBe(200);
    const row = await testDb.device.findFirstOrThrow({ where: { userId: user.userId } });
    expect(row.platform).toBe('ios');
    expect(row.model).toBe('Phone 1');
  });
});

describe('two sign-ups at the same moment (audit C-05)', () => {
  it('both succeed, no deadlock', async () => {
    app = await authApp({ AUTH_RATE_LIMIT_IP_MAX: '100' });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        post(app!, '/v1/auth/register', { ...person, email: `par${i}@example.com` }),
      ),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(6).fill(201));
    expect(await testDb.emailCode.count()).toBe(6);
  });
});

describe('texts the apps can show carry no payment hint (audit D-04, ADR-0006)', () => {
  const PAYMENT =
    /төлбөр|төл(?:өх|сөн|нө)|үнэ(?!н)|эрх\S*\s+(?:ав|сун)|худалд|багц|банк|данс|шилжүүл|qpay|\b(?:price|pay|plans?|buy)\b/i;

  it('error messages other than the portal-only ones, and the push texts', async () => {
    const { mn } = await import('../src/i18n/mn');
    // Portal-only: shown by the web pages, never by a mobile screen.
    const portalOnly = new Set([
      'PAYMENT_NOT_SUBMITTABLE',
      'SUBSCRIPTION_EXISTS',
      'SUBSCRIPTION_EXPIRED',
      'SUBSCRIPTION_STATE',
      'PLAN_INACTIVE',
      'EMAIL_NOT_VERIFIED',
      'RECEIPT_INVALID',
      'RECEIPT_TOO_LARGE',
      'PAYMENT_NOT_CONFIGURED',
    ]);
    const hits = Object.entries(mn.errors as Record<string, string>)
      .filter(([code, text]) => !portalOnly.has(code) && PAYMENT.test(text))
      .map(([code, text]) => `${code}: ${text}`);
    expect(hits).toEqual([]);

    const pushTexts = [
      mn.push.newEpisode.title,
      mn.push.newEpisode.body({ title: 'Дугаар 1' }),
      mn.push.accessEnding.title,
      mn.push.accessEnding.body({ endsAt: '2027-01-01' }),
      mn.push.paymentApproved.title,
      mn.push.paymentApproved.body({ endsAt: '2027-01-01' }),
    ];
    for (const text of pushTexts) expect(text, text).not.toMatch(PAYMENT);
  });
});

describe('production env refuses unsafe values (audit C-08, F-08)', () => {
  const prod = {
    NODE_ENV: 'production',
    BANK_NAME: 'Хаан банк',
    BANK_ACCOUNT: '5000123456',
    BANK_ACCOUNT_HOLDER: 'Бат',
    RECEIPTS_DIR: join(tmpdir(), 'receipts'),
    UPLOADS_DIR: join(tmpdir(), 'uploads'),
  } as const;

  it('accepts a good production setup', () => {
    expect(() => testEnv(prod)).not.toThrow();
  });

  it('refuses the .env.example placeholder secrets', () => {
    expect(() =>
      testEnv({ ...prod, JWT_ACCESS_SECRET: 'replace-with-a-long-random-string-32+' }),
    ).toThrow(/placeholder/);
    expect(() =>
      testEnv({ ...prod, CRON_SECRET: 'replace-with-a-long-random-string-32+' }),
    ).toThrow(/placeholder/);
  });

  it('refuses relative data folders', () => {
    expect(() => testEnv({ ...prod, RECEIPTS_DIR: './data/receipts' })).toThrow(/absolute/);
    expect(() => testEnv({ ...prod, UPLOADS_DIR: 'data/uploads' })).toThrow(/absolute/);
  });

  it('is relaxed outside production', () => {
    expect(() => testEnv({ RECEIPTS_DIR: './data/receipts' })).not.toThrow();
  });
});
