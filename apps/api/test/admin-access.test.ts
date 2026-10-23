import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { authApp } from './auth-helpers';
import { testDb } from './helpers';
import { call, makeAdmin, makeMember } from './admin-helpers';

let app: FastifyInstance;

beforeEach(async () => {
  app = await authApp();
});
afterEach(async () => {
  await app.close();
});

/** Every admin route, to prove the guards cover all of them. */
const ADMIN_ROUTES: Array<['GET' | 'POST', string, unknown?]> = [
  ['GET', '/v1/admin/dashboard'],
  ['GET', '/v1/admin/subscriptions'],
  ['GET', '/v1/admin/subscriptions/x'],
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
  });

  it('lets an ADMIN and an OWNER in', async () => {
    const admin = await makeAdmin(app, { email: 'a@example.com', role: 'ADMIN' });
    const owner = await makeAdmin(app, { email: 'o@example.com', role: 'OWNER' });
    for (const who of [admin, owner]) {
      expect((await call(app, 'GET', '/v1/admin/dashboard', who.accessToken)).statusCode).toBe(200);
    }
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

describe('admin login (password only, ADR-0040)', () => {
  it('has no second-factor routes any more', async () => {
    const admin = await makeAdmin(app);
    for (const [method, url] of [
      ['GET', '/v1/admin/totp'],
      ['POST', '/v1/admin/totp/setup'],
      ['POST', '/v1/admin/totp/verify'],
    ] as const) {
      const res = await call(app, method, url, admin.accessToken, { code: '123456' });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('a refreshed admin session keeps working', async () => {
    // A native platform gets the refresh token in the body (web would get it in a cookie).
    const admin = await makeAdmin(app, { platform: 'android' });
    const res = await call(app, 'POST', '/v1/auth/refresh', undefined, {
      refreshToken: admin.refreshToken,
      deviceId: admin.deviceId,
    });
    expect(res.statusCode).toBe(200);
    const next = res.json().accessToken as string;
    expect((await call(app, 'GET', '/v1/admin/dashboard', next)).statusCode).toBe(200);
  });
});
