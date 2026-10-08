import { createHash } from 'node:crypto';
import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose';
import { describe, expect, it } from 'vitest';
import { hashRefreshToken } from '../src/auth/crypto';
import { AuthLimiter, WindowCounter } from '../src/auth/rate-limit';
import {
  PASSWORD,
  authApp,
  device,
  emailsTo,
  expireCodes,
  lastCode,
  login,
  loginOn,
  passCooldown,
  post,
  register,
  send,
  signedIn,
} from './auth-helpers';
import { testDb } from './helpers';

const EMAIL = 'bat@example.com';

describe('SPEC A: register', () => {
  it('creates an unverified user, lowercases identifiers, defaults username to email', async () => {
    const app = await authApp();
    const res = await register(app, { email: 'Bat@Example.COM' });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({
      email: EMAIL,
      username: EMAIL,
      emailVerified: false,
      status: 'ACTIVE',
      role: 'USER',
    });
    expect(res.json().user).not.toHaveProperty('passwordHash');
    const row = await testDb.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
  });

  it('queues the verification email as a job (not sent in the request) with a 6-digit code', async () => {
    const app = await authApp();
    await register(app);
    expect(await emailsTo(EMAIL)).toEqual([expect.objectContaining({ template: 'verifyEmail' })]);
    expect(await lastCode(EMAIL)).toMatch(/^\d{6}$/);
    const stored = await testDb.emailCode.findFirstOrThrow();
    expect(stored.codeHash).not.toContain(await lastCode(EMAIL));
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(10 * 60_000);
    expect(stored.expiresAt.getTime() - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it('accepts an own-email username and a custom username, case-insensitively', async () => {
    const app = await authApp();
    const res = await register(app, { username: 'Bat.Erdene_1' });
    expect(res.json().user.username).toBe('bat.erdene_1');
    const own = await register(app, { email: 'o@example.com', username: 'O@Example.com' });
    expect(own.statusCode).toBe(201);
  });

  it('rejects duplicate email and username regardless of case', async () => {
    const app = await authApp();
    await register(app, { username: 'bat.erdene' });
    const dupEmail = await register(app, { email: 'BAT@example.com', username: 'other.name' });
    expect(dupEmail.statusCode).toBe(409);
    expect(dupEmail.json().error.code).toBe('EMAIL_TAKEN');
    const dupName = await register(app, { email: 'x@example.com', username: 'Bat.Erdene' });
    expect(dupName.statusCode).toBe(409);
    expect(dupName.json().error.code).toBe('USERNAME_TAKEN');
  });

  it.each([
    ['username too short', { username: 'ab' }],
    ['username too long', { username: 'a'.repeat(31) }],
    ['username with a space', { username: 'bat erdene' }],
    ['username with a dash', { username: 'bat-erdene' }],
    ["username that is someone else's email", { username: 'victim@example.com' }],
    ['password shorter than 8', { password: 'short' }],
    ['bad email', { email: 'not-an-email' }],
    ['missing first name', { firstName: '' }],
    ['bad phone', { phone: 'abc' }],
  ])('rejects %s with VALIDATION_ERROR', async (_name, over) => {
    const app = await authApp();
    const res = await register(app, over);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'VALIDATION_ERROR', message: expect.any(String) },
    });
  });
});

describe('SPEC A: verify-email and resend-code', () => {
  it('verifies with the emailed code; the code works once', async () => {
    const app = await authApp();
    await register(app);
    const code = await lastCode(EMAIL);
    const res = await post(app, '/v1/auth/verify-email', { email: EMAIL, code });
    expect(res.statusCode).toBe(204);
    const user = await testDb.user.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect((await testDb.emailCode.findFirstOrThrow()).usedAt).not.toBeNull();
  });

  it('is idempotent for an already verified email', async () => {
    const app = await authApp();
    await register(app);
    const code = await lastCode(EMAIL);
    await post(app, '/v1/auth/verify-email', { email: EMAIL, code });
    const again = await post(app, '/v1/auth/verify-email', { email: EMAIL, code });
    expect(again.statusCode).toBe(204);
  });

  it('rejects a wrong code and an unknown email with the same CODE_INVALID', async () => {
    const app = await authApp();
    await register(app);
    const wrong = await post(app, '/v1/auth/verify-email', { email: EMAIL, code: '000000' });
    const real = await lastCode(EMAIL);
    const unknown = await post(app, '/v1/auth/verify-email', {
      email: 'nobody@example.com',
      code: real,
    });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error.code).toBe('CODE_INVALID');
    expect(unknown.json().error.code).toBe('CODE_INVALID');
  });

  it('locks the code after 5 attempts, even for the correct code', async () => {
    const app = await authApp();
    await register(app);
    const code = await lastCode(EMAIL);
    const wrongCode = code === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      const res = await post(app, '/v1/auth/verify-email', { email: EMAIL, code: wrongCode });
      expect(res.json().error.code).toBe('CODE_INVALID');
    }
    const sixth = await post(app, '/v1/auth/verify-email', { email: EMAIL, code });
    expect(sixth.statusCode).toBe(429);
    expect(sixth.json().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
    expect(
      (await testDb.user.findUniqueOrThrow({ where: { email: EMAIL } })).emailVerifiedAt,
    ).toBeNull();
  });

  it('counts parallel guesses atomically (never more than 5 attempts)', async () => {
    const app = await authApp();
    await register(app);
    const code = await lastCode(EMAIL);
    const wrongCode = code === '111111' ? '222222' : '111111';
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        post(app, '/v1/auth/verify-email', { email: EMAIL, code: wrongCode }),
      ),
    );
    expect(results.filter((r) => r.json().error.code === 'CODE_INVALID')).toHaveLength(5);
    expect((await testDb.emailCode.findFirstOrThrow()).attempts).toBe(5);
  });

  it('refuses an expired code', async () => {
    const app = await authApp();
    await register(app);
    const code = await lastCode(EMAIL);
    await expireCodes(EMAIL);
    const res = await post(app, '/v1/auth/verify-email', { email: EMAIL, code });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('CODE_EXPIRED');
  });

  it('enforces the 60 s resend cooldown, then issues a new code and kills the old one', async () => {
    const app = await authApp();
    await register(app);
    const first = await lastCode(EMAIL);

    const tooSoon = await post(app, '/v1/auth/resend-code', { email: EMAIL });
    expect(tooSoon.statusCode).toBe(429);
    expect(tooSoon.json().error.code).toBe('RESEND_COOLDOWN');
    expect(await emailsTo(EMAIL)).toHaveLength(1);

    await passCooldown(EMAIL);
    const ok = await post(app, '/v1/auth/resend-code', { email: EMAIL });
    expect(ok.statusCode).toBe(204);
    expect(await emailsTo(EMAIL)).toHaveLength(2);

    const second = await lastCode(EMAIL);
    if (second !== first) {
      const old = await post(app, '/v1/auth/verify-email', { email: EMAIL, code: first });
      expect(old.json().error.code).toBe('CODE_INVALID');
    }
    const good = await post(app, '/v1/auth/verify-email', { email: EMAIL, code: second });
    expect(good.statusCode).toBe(204);
  });

  it('answers 204 and sends nothing for unknown or verified emails', async () => {
    const app = await authApp();
    const unknown = await post(app, '/v1/auth/resend-code', { email: 'nobody@example.com' });
    expect(unknown.statusCode).toBe(204);
    await register(app);
    await post(app, '/v1/auth/verify-email', { email: EMAIL, code: await lastCode(EMAIL) });
    await passCooldown(EMAIL);
    const verified = await post(app, '/v1/auth/resend-code', { email: EMAIL });
    expect(verified.statusCode).toBe(204);
    expect(await emailsTo(EMAIL)).toHaveLength(1);
    expect(await emailsTo('nobody@example.com')).toHaveLength(0);
  });
});

describe('SPEC B: login', () => {
  it('logs in by email and by username, case-insensitively', async () => {
    const app = await authApp();
    await register(app, { username: 'Bat.Erdene' });
    for (const identifier of [
      EMAIL,
      'BAT@Example.com',
      'bat.erdene',
      'BAT.ERDENE',
      '  bat.erdene ',
    ]) {
      const res = await login(app, identifier);
      expect(res.statusCode, identifier).toBe(200);
      expect(res.json().user.email).toBe(EMAIL);
    }
  });

  it('lets an unverified user log in', async () => {
    const app = await authApp();
    await register(app);
    const res = await login(app, EMAIL);
    expect(res.statusCode).toBe(200);
    expect(res.json().user.emailVerified).toBe(false);
  });

  it('returns a 15 min HS256 access token and stores only the refresh token hash', async () => {
    const app = await authApp();
    await register(app);
    const res = await login(app, EMAIL);
    const body = res.json();
    expect(body.expiresIn).toBe(900);
    expect(decodeProtectedHeader(body.accessToken).alg).toBe('HS256');
    const claims = decodeJwt(body.accessToken);
    expect(claims.exp! - claims.iat!).toBe(900);
    expect(claims.sub).toBe(body.user.id);

    // Opaque 32-byte token, base64url.
    expect(Buffer.from(body.refreshToken, 'base64url')).toHaveLength(32);
    const session = await testDb.session.findFirstOrThrow();
    expect(session.refreshTokenHash).toBe(
      createHash('sha256').update(body.refreshToken).digest('hex'),
    );
    expect(session.refreshTokenHash).not.toBe(body.refreshToken);
    const days = (session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const app = await authApp();
    await register(app);
    const wrong = await login(app, EMAIL, device(1), {}, 'wrong-password-1');
    const unknown = await login(app, 'nobody@example.com');
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a disabled user', async () => {
    const app = await authApp();
    await register(app);
    await testDb.user.update({ where: { email: EMAIL }, data: { status: 'DISABLED' } });
    const res = await login(app, EMAIL);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_DISABLED');
  });

  it('validates the body', async () => {
    const app = await authApp();
    const res = await post(app, '/v1/auth/login', { identifier: EMAIL, password: PASSWORD });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('SPEC B: two devices', () => {
  it('refuses the 3rd device with DEVICE_LIMIT and the device list', async () => {
    const app = await authApp();
    await signedIn(app, { device: device(1, 'ios') });
    await loginOn(app, EMAIL, device(2));
    const third = await login(app, EMAIL, device(3));
    expect(third.statusCode).toBe(403);
    const err = third.json().error;
    expect(err.code).toBe('DEVICE_LIMIT');
    expect(err.details.devices).toHaveLength(2);
    expect(err.details.devices[0]).toEqual({
      id: expect.any(String),
      platform: expect.any(String),
      model: expect.any(String),
      lastSeenAt: expect.any(String),
    });
    // Nothing was created for the refused device.
    expect(await testDb.device.count()).toBe(2);
    expect(await testDb.session.count({ where: { deviceId: device(3).deviceId } })).toBe(0);
  });

  it('lets a known device log in again without counting as a new one', async () => {
    const app = await authApp();
    await signedIn(app);
    await loginOn(app, EMAIL, device(2));
    const again = await login(app, EMAIL, device(1));
    expect(again.statusCode).toBe(200);
    expect(await testDb.device.count()).toBe(2);
    // Earlier sessions of that device are replaced.
    expect(
      await testDb.session.count({ where: { deviceId: device(1).deviceId, revokedAt: null } }),
    ).toBe(1);
  });

  it('removes a device with the password at login, then lets the 3rd in', async () => {
    const app = await authApp();
    const first = await signedIn(app);
    await loginOn(app, EMAIL, device(2));
    const limit = await login(app, EMAIL, device(3));
    const victim = limit
      .json()
      .error.details.devices.find((d: { model: string }) => d.model === 'Phone 1');

    const wrongPw = await login(
      app,
      EMAIL,
      device(3),
      { removeDeviceId: victim.id },
      'bad-password-1',
    );
    expect(wrongPw.statusCode).toBe(401);
    expect(await testDb.device.count()).toBe(2);

    const ok = await login(app, EMAIL, device(3), { removeDeviceId: victim.id });
    expect(ok.statusCode).toBe(200);
    expect(await testDb.device.count()).toBe(2);
    // The removed device is signed out immediately.
    expect((await send(app, 'GET', '/v1/me', first.accessToken)).statusCode).toBe(401);
    const refresh = await post(app, '/v1/auth/refresh', {
      refreshToken: first.refreshToken,
      deviceId: first.deviceId,
    });
    expect(refresh.statusCode).toBe(401);
  });

  it("does not let removeDeviceId touch another user's device", async () => {
    const app = await authApp();
    await signedIn(app);
    await signedIn(app, { email: 'other@example.com', device: device(9) });
    await loginOn(app, EMAIL, device(2));
    const foreign = await testDb.device.findFirstOrThrow({
      where: { deviceId: device(9).deviceId },
    });
    const res = await login(app, EMAIL, device(3), { removeDeviceId: foreign.id });
    expect(res.json().error.code).toBe('DEVICE_LIMIT');
    expect(await testDb.device.count({ where: { id: foreign.id } })).toBe(1);
  });

  it('never ends up with 3 devices when logins race', async () => {
    const app = await authApp();
    await register(app);
    const results = await Promise.all([1, 2, 3, 4].map((n) => login(app, EMAIL, device(n))));
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2);
    expect(results.filter((r) => r.json().error?.code === 'DEVICE_LIMIT')).toHaveLength(2);
    expect(await testDb.device.count()).toBe(2);
  });

  it('logout frees the device slot', async () => {
    const app = await authApp();
    const first = await signedIn(app);
    await loginOn(app, EMAIL, device(2));
    const out = await post(app, '/v1/auth/logout', { refreshToken: first.refreshToken });
    expect(out.statusCode).toBe(204);
    expect((await login(app, EMAIL, device(3))).statusCode).toBe(200);
  });
});

describe('SPEC B: refresh', () => {
  const refresh = (app: Awaited<ReturnType<typeof authApp>>, refreshToken: string, d = device(1)) =>
    post(app, '/v1/auth/refresh', { refreshToken, deviceId: d.deviceId });

  it('rotates: the new token works, the old one does not', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await refresh(app, s.refreshToken);
    expect(res.statusCode).toBe(200);
    const next = res.json();
    expect(next.refreshToken).not.toBe(s.refreshToken);
    expect(next.expiresIn).toBe(900);
    expect((await send(app, 'GET', '/v1/me', next.accessToken)).statusCode).toBe(200);
    // Same family, one live session.
    const sessions = await testDb.session.findMany();
    expect(new Set(sessions.map((x) => x.familyId)).size).toBe(1);
    expect(sessions.filter((x) => !x.revokedAt)).toHaveLength(1);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const rotated = (await refresh(app, s.refreshToken)).json();
    const another = await loginOn(app, EMAIL, device(2));

    const reuse = await refresh(app, s.refreshToken);
    expect(reuse.statusCode).toBe(401);
    expect(reuse.json().error.code).toBe('UNAUTHORIZED');

    // The legitimate holder of the newest token is cut off too ...
    expect((await refresh(app, rotated.refreshToken)).statusCode).toBe(401);
    expect((await send(app, 'GET', '/v1/me', rotated.accessToken)).statusCode).toBe(401);
    // ... but other devices (other families) are untouched.
    expect((await send(app, 'GET', '/v1/me', another.accessToken)).statusCode).toBe(200);
    expect((await refresh(app, another.refreshToken, device(2))).statusCode).toBe(200);
  });

  it('lets only one of two parallel refreshes with the same token succeed, and revokes the family', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const results = await Promise.all([refresh(app, s.refreshToken), refresh(app, s.refreshToken)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 401]);
    const winner = results.find((r) => r.statusCode === 200)!.json();
    expect((await refresh(app, winner.refreshToken)).statusCode).toBe(401);
    expect(await testDb.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('treats a token presented from another device as theft and revokes the family', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await refresh(app, s.refreshToken, device(7));
    expect(res.statusCode).toBe(401);
    expect(await testDb.session.count({ where: { revokedAt: null } })).toBe(0);
    expect(await testDb.device.count({ where: { deviceId: device(7).deviceId } })).toBe(0);
  });

  it('refuses unknown, expired and logged-out tokens', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    expect((await refresh(app, 'x'.repeat(43))).statusCode).toBe(401);

    await testDb.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(app, s.refreshToken)).statusCode).toBe(401);

    const b = await loginOn(app, EMAIL, device(2));
    await post(app, '/v1/auth/logout', { refreshToken: b.refreshToken });
    expect((await refresh(app, b.refreshToken, device(2))).statusCode).toBe(401);
  });

  it('refuses a deleted user and a disabled user', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await testDb.user.update({ where: { id: s.userId }, data: { status: 'DISABLED' } });
    const res = await refresh(app, s.refreshToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_DISABLED');
    await testDb.user.update({ where: { id: s.userId }, data: { status: 'DELETED' } });
    expect((await refresh(app, s.refreshToken)).statusCode).toBe(401);
  });

  it('enforces the device limit on refresh for a device that is no longer registered', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    // Device 1 lost its slot (row gone) while two other devices took both slots.
    await testDb.device.deleteMany({ where: { deviceId: device(1).deviceId } });
    await testDb.device.createMany({
      data: [
        { userId: s.userId, deviceId: device(2).deviceId, platform: 'ios' },
        { userId: s.userId, deviceId: device(3).deviceId, platform: 'ios' },
      ],
    });
    const res = await refresh(app, s.refreshToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('DEVICE_LIMIT');
    // The refusal rolled back the rotation: the token is still usable once a slot is free.
    await testDb.device.deleteMany({ where: { deviceId: device(3).deviceId } });
    expect((await refresh(app, s.refreshToken)).statusCode).toBe(200);
  });
});

describe('access tokens', () => {
  it('rejects missing, malformed, tampered, wrong-secret and expired tokens', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const secret = new TextEncoder().encode('test-jwt-secret-0123456789abcdef012345');
    const session = await testDb.session.findFirstOrThrow();

    const sign = (key: Uint8Array, exp: string | number, alg = 'HS256') =>
      new SignJWT({ sid: session.id })
        .setProtectedHeader({ alg })
        .setSubject(s.userId)
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(key);

    const good = await sign(secret, '5m');
    expect((await send(app, 'GET', '/v1/me', good)).statusCode).toBe(200);

    const bad = [
      '',
      'garbage',
      `${s.accessToken}x`,
      await sign(new TextEncoder().encode('another-secret-0123456789abcdef01234567'), '5m'),
      await sign(secret, Math.floor(Date.now() / 1000) - 60),
      await sign(secret, '5m', 'HS512'),
    ];
    for (const token of bad) {
      const res = await send(app, 'GET', '/v1/me', token || undefined);
      expect(res.statusCode, token.slice(0, 12)).toBe(401);
      expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
    }
  });

  it('stops working at once after logout, not after 15 minutes', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await post(app, '/v1/auth/logout', { refreshToken: s.refreshToken });
    expect((await send(app, 'GET', '/v1/me', s.accessToken)).statusCode).toBe(401);
    // Logout twice is fine.
    expect((await post(app, '/v1/auth/logout', { refreshToken: s.refreshToken })).statusCode).toBe(
      204,
    );
  });

  it('hashes with the same function the tests expect', () => {
    expect(hashRefreshToken('abc')).toBe(createHash('sha256').update('abc').digest('hex'));
  });
});

describe('rate limits', () => {
  it('limits login per identifier, whatever the IP', async () => {
    const app = await authApp({ AUTH_RATE_LIMIT_IDENTIFIER_MAX: '3' });
    await register(app);
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        remoteAddress: `10.0.0.${i + 1}`,
        payload: { identifier: EMAIL, password: 'wrong-password-1', ...device(1) },
      });
      statuses.push(res.statusCode);
    }
    expect(statuses).toEqual([401, 401, 401, 429, 429]);
    const limited = await login(app, 'Bat@Example.com'); // same identifier, other case
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe('RATE_LIMITED');
    // A different identifier is not affected.
    expect((await login(app, 'someone-else')).statusCode).toBe(401);
  });

  it('limits login per IP across identifiers', async () => {
    const app = await authApp({ AUTH_RATE_LIMIT_IP_MAX: '3' });
    const from = (ip: string, n: number) =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        remoteAddress: ip,
        payload: { identifier: `user${n}`, password: 'wrong-password-1', ...device(1) },
      });
    const codes = [];
    for (let n = 1; n <= 5; n++) codes.push((await from('10.1.1.1', n)).statusCode);
    expect(codes).toEqual([401, 401, 401, 429, 429]);
    expect((await from('10.2.2.2', 99)).statusCode).toBe(401);
  });

  it('limits register and the code endpoints', async () => {
    const app = await authApp({ AUTH_RATE_LIMIT_IDENTIFIER_MAX: '2' });
    const codes = [];
    for (let i = 0; i < 3; i++) {
      codes.push(
        (await post(app, '/v1/auth/verify-email', { email: EMAIL, code: '123456' })).statusCode,
      );
    }
    expect(codes).toEqual([400, 400, 429]);
    const forgot = [];
    for (let i = 0; i < 3; i++) {
      forgot.push(
        (await post(app, '/v1/auth/forgot-password', { email: 'f@example.com' })).statusCode,
      );
    }
    expect(forgot).toEqual([204, 204, 429]);
    const reg = [];
    for (let i = 0; i < 3; i++)
      reg.push((await register(app, { email: 'r@example.com', password: 'x' })).statusCode);
    expect(reg).toEqual([400, 400, 400]); // invalid bodies are rejected before they count
    const reg2 = [];
    for (let i = 0; i < 3; i++)
      reg2.push((await register(app, { email: 'r@example.com' })).statusCode);
    expect(reg2).toEqual([201, 409, 429]);
  });

  it('WindowCounter resets after the window', () => {
    let now = 1_000;
    const counter = new WindowCounter(2, 60_000, () => now);
    expect([counter.hit('k'), counter.hit('k'), counter.hit('k')]).toEqual([true, true, false]);
    now += 60_001;
    expect(counter.hit('k')).toBe(true);
  });

  it('AuthLimiter counts IP and identifier separately', () => {
    const limiter = new AuthLimiter({ ipMax: 2, identifierMax: 5, windowSeconds: 60 });
    const req = (ip: string) => ({ ip }) as never;
    limiter.check(req('1.1.1.1'), 'login', 'a');
    limiter.check(req('1.1.1.1'), 'login', 'b');
    expect(() => limiter.check(req('1.1.1.1'), 'login', 'c')).toThrow();
    expect(() => limiter.check(req('2.2.2.2'), 'login', 'c')).not.toThrow();
    // Different scope, same IP: separate counter.
    expect(() => limiter.check(req('1.1.1.1'), 'register', 'a')).not.toThrow();
  });
});
