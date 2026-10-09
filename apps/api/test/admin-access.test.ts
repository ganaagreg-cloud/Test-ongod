import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp, device, loginOn } from './auth-helpers';
import { testDb } from './helpers';
import { call, makeAdmin, makeMember, totpCode } from './admin-helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

/** Every admin route, to prove the guards cover all of them. */
const ADMIN_ROUTES: Array<['GET' | 'POST' | 'PATCH' | 'DELETE', string, unknown?]> = [
  ['GET', '/v1/admin/dashboard'],
  ['GET', '/v1/admin/subscriptions'],
  ['GET', '/v1/admin/subscriptions/x'],
  ['GET', '/v1/admin/subscriptions/x/history'],
  // Content (audit G-01): categories, episodes, their transitions and a user's devices.
  ['GET', '/v1/admin/categories'],
  ['POST', '/v1/admin/categories', { name: 'n' }],
  ['POST', '/v1/admin/categories/reorder', { ids: ['x'] }],
  ['PATCH', '/v1/admin/categories/x', { name: 'n' }],
  ['DELETE', '/v1/admin/categories/x'],
  ['GET', '/v1/admin/episodes'],
  ['POST', '/v1/admin/episodes', { title: 't' }],
  ['GET', '/v1/admin/episodes/x'],
  ['PATCH', '/v1/admin/episodes/x', { title: 't' }],
  ['DELETE', '/v1/admin/episodes/x'],
  ['POST', '/v1/admin/episodes/x/publish'],
  ['POST', '/v1/admin/episodes/x/schedule', { scheduledFor: '2030-01-01T00:00:00+08:00' }],
  ['POST', '/v1/admin/episodes/x/unschedule'],
  ['POST', '/v1/admin/episodes/x/archive'],
  ['POST', '/v1/admin/episodes/x/restore'],
  ['POST', '/v1/admin/episodes/x/media/retry'],
  ['DELETE', '/v1/admin/users/x/devices/y'],
  ['GET', '/v1/admin/subscriptions/x/receipt'],
  ['POST', '/v1/admin/subscriptions/x/approve'],
  ['POST', '/v1/admin/subscriptions/x/reject', { reason: 'r' }],
  ['POST', '/v1/admin/subscriptions/x/revoke', { reason: 'r' }],
  ['GET', '/v1/admin/users'],
  ['GET', '/v1/admin/users/x'],
  ['POST', '/v1/admin/users/x/grants', { planId: 'p' }],
  ['GET', '/v1/admin/audit'],
  ['GET', '/v1/admin/payments.csv'],
];

describe('admin access rules', () => {
  it('refuses requests with no token: 401 on every admin route', async () => {
    for (const [method, url, body] of ADMIN_ROUTES) {
      const res = await call(app, method, url, undefined, body);
      expect(res.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('blocks a normal user from every admin route: 403 FORBIDDEN', async () => {
    const member = await makeMember(app);
    for (const [method, url, body] of ADMIN_ROUTES) {
      const res = await call(app, method, url, member.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
    // The 2FA routes are admin-only too: a user cannot enrol TOTP for themselves.
    for (const url of ['/v1/admin/totp', '/v1/admin/totp/setup', '/v1/admin/totp/verify']) {
      const res = await call(app, url.endsWith('totp') ? 'GET' : 'POST', url, member.accessToken, {
        code: '123456',
      });
      expect(res.statusCode, url).toBe(403);
      expect(res.json().error.code).toBe('FORBIDDEN');
    }
  });

  it('blocks an admin who has not set up TOTP: 403 TOTP_SETUP_REQUIRED on every admin route', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });
    for (const [method, url, body] of ADMIN_ROUTES) {
      const res = await call(app, method, url, admin.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().error.code, `${method} ${url}`).toBe('TOTP_SETUP_REQUIRED');
    }
  });

  it('blocks an admin whose session has not passed the TOTP check: 403 TOTP_REQUIRED', async () => {
    const admin = await makeAdmin(app, { totp: 'enabled' });
    for (const [method, url, body] of ADMIN_ROUTES) {
      const res = await call(app, method, url, admin.accessToken, body);
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json().error.code, `${method} ${url}`).toBe('TOTP_REQUIRED');
    }
  });

  it('lets a verified ADMIN and a verified OWNER in', async () => {
    const admin = await makeAdmin(app, { email: 'a@example.com', role: 'ADMIN' });
    const owner = await makeAdmin(app, { email: 'o@example.com', role: 'OWNER' });
    for (const who of [admin, owner]) {
      expect((await call(app, 'GET', '/v1/admin/dashboard', who.accessToken)).statusCode).toBe(200);
    }
  });

  it('a pending TOTP setup (secret saved, no code verified yet) is not "enabled"', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });
    await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken);
    const res = await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken);
    expect(res.json().error.code).toBe('TOTP_SETUP_REQUIRED');
  });

  it('takes the role from the database on every request: a demoted admin is out at once', async () => {
    const admin = await makeAdmin(app);
    expect((await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken)).statusCode).toBe(200);
    await testDb.user.update({ where: { id: admin.userId }, data: { role: 'USER' } });
    expect((await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken)).statusCode).toBe(403);
  });

  it('a disabled admin is refused', async () => {
    const admin = await makeAdmin(app);
    await testDb.user.update({ where: { id: admin.userId }, data: { status: 'DISABLED' } });
    expect((await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken)).statusCode).toBe(403);
  });

  it('sends admin responses with Cache-Control: no-store', async () => {
    const admin = await makeAdmin(app);
    const res = await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken);
    expect(res.headers['cache-control']).toMatch(/no-store/);
  });
});

describe('admin TOTP 2FA', () => {
  it('first login: set up, verify a code, then the admin API opens; a new login needs the code again', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });

    let res = await call(app, 'GET', '/v1/admin/totp', admin.accessToken);
    expect(res.json()).toEqual({ enabled: false, verified: false });

    res = await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken);
    expect(res.statusCode).toBe(200);
    const { secret, otpauthUri } = res.json();
    expect(secret).toMatch(/^[A-Z2-7]{16,}$/);
    expect(otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    expect(otpauthUri).toContain(`secret=${secret}`);
    expect(otpauthUri).toContain('issuer=');

    res = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
      code: totpCode(secret),
    });
    expect(res.statusCode).toBe(204);

    expect((await call(app, 'GET', '/v1/admin/totp', admin.accessToken)).json()).toEqual({
      enabled: true,
      verified: true,
    });
    expect((await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken)).statusCode).toBe(200);
    expect(
      await testDb.auditLog.count({
        where: { action: 'admin.totp_enabled', actorId: admin.userId },
      }),
    ).toBe(1);

    // A fresh login (another browser) is a new session: it must pass the check itself.
    const second = await loginOn(app, 'admin@example.com', device('admin-second', 'web'));
    res = await call(app, 'GET', '/v1/admin/dashboard', second.accessToken);
    expect(res.json().error.code).toBe('TOTP_REQUIRED');
    // The previous code (same 30 s step) cannot be replayed...
    res = await call(app, 'POST', '/v1/admin/totp/verify', second.accessToken, {
      code: totpCode(secret),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOTP_INVALID');
    // ...a code from the next step works.
    res = await call(app, 'POST', '/v1/admin/totp/verify', second.accessToken, {
      code: totpCode(secret, 1),
    });
    expect(res.statusCode).toBe(204);
    expect((await call(app, 'GET', '/v1/admin/dashboard', second.accessToken)).statusCode).toBe(
      200,
    );
  });

  it('rejects a wrong code and does not enable TOTP', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });
    const { secret } = (await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken)).json();
    const wrong = totpCode(secret, 10); // 5 minutes ahead: outside the tolerance
    const res = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
      code: wrong,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('TOTP_INVALID');
    expect((await call(app, 'GET', '/v1/admin/totp', admin.accessToken)).json().enabled).toBe(
      false,
    );
  });

  it('validates the code format', async () => {
    const admin = await makeAdmin(app, { totp: 'enabled' });
    for (const code of ['12345', 'abcdef', '1234567', '', 123456]) {
      const res = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, { code });
      expect(res.statusCode, String(code)).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('verify without a setup: TOTP_SETUP_REQUIRED', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });
    const res = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
      code: '123456',
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('TOTP_SETUP_REQUIRED');
  });

  it('once enabled, setup is refused: the second factor cannot be swapped by a password alone', async () => {
    const admin = await makeAdmin(app, { totp: 'verified' });
    const before = await testDb.user.findUniqueOrThrow({ where: { id: admin.userId } });
    const res = await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('TOTP_ALREADY_ENABLED');
    const after = await testDb.user.findUniqueOrThrow({ where: { id: admin.userId } });
    expect(after.totpSecret).toBe(before.totpSecret);
  });

  it('a restarted setup replaces the pending secret; the old secret no longer verifies', async () => {
    const admin = await makeAdmin(app, { totp: 'none' });
    const first = (await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken)).json();
    const second = (await call(app, 'POST', '/v1/admin/totp/setup', admin.accessToken)).json();
    expect(second.secret).not.toBe(first.secret);

    const old = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
      code: totpCode(first.secret),
    });
    expect(old.statusCode).toBe(400);
    const fresh = await call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
      code: totpCode(second.secret),
    });
    expect(fresh.statusCode).toBe(204);
  });

  it('a refreshed session stays verified (the proof follows the token family)', async () => {
    // A native platform gets the refresh token in the body (web would get it in a cookie).
    const admin = await makeAdmin(app, { totp: 'verified', platform: 'android' });
    const res = await call(app, 'POST', '/v1/auth/refresh', undefined, {
      refreshToken: admin.refreshToken,
      deviceId: admin.deviceId,
    });
    expect(res.statusCode).toBe(200);
    const next = res.json().accessToken as string;
    expect((await call(app, 'GET', '/v1/admin/dashboard', next)).statusCode).toBe(200);
  });

  it('logging in again on the same device drops the proof', async () => {
    const admin = await makeAdmin(app, { totp: 'verified' });
    const again = await loginOn(app, 'admin@example.com', device('admin-admin@example.com', 'web'));
    expect(
      (await call(app, 'GET', '/v1/admin/dashboard', again.accessToken)).json().error.code,
    ).toBe('TOTP_REQUIRED');
    // The earlier session was replaced by the new login.
    expect((await call(app, 'GET', '/v1/admin/dashboard', admin.accessToken)).statusCode).toBe(401);
  });

  it('limits code guessing: 429 after too many attempts, and a late right code does not get around it', async () => {
    const limited = await authApp({
      AUTH_RATE_LIMIT_IDENTIFIER_MAX: '3',
      AUTH_RATE_LIMIT_IP_MAX: '100',
    });
    try {
      const admin = await makeAdmin(limited, { totp: 'enabled' });
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (
            await call(limited, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
              code: '000000',
            })
          ).statusCode,
        );
      }
      expect(statuses).toEqual([400, 400, 400, 429]);
      const right = await call(limited, 'POST', '/v1/admin/totp/verify', admin.accessToken, {
        code: totpCode(admin.secret!),
      });
      expect(right.statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });

  it('two requests with the same fresh code cannot both succeed', async () => {
    const admin = await makeAdmin(app, { totp: 'enabled' });
    const code = totpCode(admin.secret!);
    const results = await Promise.all(
      [1, 2].map(() => call(app, 'POST', '/v1/admin/totp/verify', admin.accessToken, { code })),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([204, 400]);
  });
});
