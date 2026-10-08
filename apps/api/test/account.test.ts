import { describe, expect, it } from 'vitest';
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
const NEW_PASSWORD = 'brand-new-pass-2';

describe('access rules: every /me route needs a signed-in user', () => {
  it.each([
    ['GET', '/v1/me'],
    ['POST', '/v1/me/change-password'],
    ['POST', '/v1/me/change-email'],
    ['POST', '/v1/me/change-email/verify'],
    ['GET', '/v1/me/devices'],
    ['DELETE', '/v1/me/devices/abc'],
    ['DELETE', '/v1/me'],
  ] as const)('%s %s without a token is 401 in the error shape', async (method, url) => {
    const app = await authApp();
    const res = await send(app, method, url);
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });
});

describe('GET /v1/me', () => {
  it('returns the profile without secrets', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await send(app, 'GET', '/v1/me', s.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: {
        id: s.userId,
        username: EMAIL,
        email: EMAIL,
        emailVerified: false,
        firstName: 'Эрдэнэ',
        lastName: 'Бат',
        phone: '99112233',
        status: 'ACTIVE',
        role: 'USER',
        accessUntil: null,
      },
    });
  });

  it('reports accessUntil as ISO time', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const until = new Date('2027-01-01T00:00:00.000Z');
    await testDb.user.update({ where: { id: s.userId }, data: { accessUntil: until } });
    const res = await send(app, 'GET', '/v1/me', s.accessToken);
    expect(res.json().user.accessUntil).toBe(until.toISOString());
  });

  it('is refused for a disabled user', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await testDb.user.update({ where: { id: s.userId }, data: { status: 'DISABLED' } });
    const res = await send(app, 'GET', '/v1/me', s.accessToken);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('SPEC H: forgot and reset password', () => {
  it('emails a reset code for a known address', async () => {
    const app = await authApp();
    await register(app);
    const res = await post(app, '/v1/auth/forgot-password', { email: 'BAT@example.com' });
    expect(res.statusCode).toBe(204);
    const mails = await emailsTo(EMAIL);
    expect(mails.map((m) => m.template).sort()).toEqual(['resetPassword', 'verifyEmail']);
  });

  it('answers 204 and sends nothing for an unknown address', async () => {
    const app = await authApp();
    const res = await post(app, '/v1/auth/forgot-password', { email: 'nobody@example.com' });
    expect(res.statusCode).toBe(204);
    expect(await testDb.job.count()).toBe(0);
  });

  it('applies the 60 s cooldown silently', async () => {
    const app = await authApp();
    await register(app);
    await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    const again = await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    expect(again.statusCode).toBe(204);
    expect((await emailsTo(EMAIL)).filter((m) => m.template === 'resetPassword')).toHaveLength(1);
  });

  it('resets the password, revokes every session, and the code works once', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    const b = await loginOn(app, EMAIL, device(2));
    await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    const code = await lastCode(EMAIL);

    const res = await post(app, '/v1/auth/reset-password', {
      email: EMAIL,
      code,
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(204);

    expect((await send(app, 'GET', '/v1/me', a.accessToken)).statusCode).toBe(401);
    expect((await send(app, 'GET', '/v1/me', b.accessToken)).statusCode).toBe(401);
    expect((await login(app, EMAIL, device(1))).statusCode).toBe(401); // old password
    expect((await login(app, EMAIL, device(1), {}, NEW_PASSWORD)).statusCode).toBe(200);

    const replay = await post(app, '/v1/auth/reset-password', {
      email: EMAIL,
      code,
      newPassword: 'another-pass-3',
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json().error.code).toBe('CODE_INVALID');
    expect((await login(app, EMAIL, device(1), {}, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('rejects a wrong code, locks after 5 attempts, and refuses expired codes', async () => {
    const app = await authApp();
    await register(app);
    await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    const code = await lastCode(EMAIL);
    const wrong = code === '111111' ? '222222' : '111111';
    const body = (c: string) => ({ email: EMAIL, code: c, newPassword: NEW_PASSWORD });

    for (let i = 0; i < 5; i++) {
      const res = await post(app, '/v1/auth/reset-password', body(wrong));
      expect(res.json().error.code).toBe('CODE_INVALID');
    }
    const locked = await post(app, '/v1/auth/reset-password', body(code));
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
    expect((await login(app, EMAIL, device(1), {}, NEW_PASSWORD)).statusCode).toBe(401);

    // A fresh code after the cooldown works again; an expired one does not.
    await passCooldown(EMAIL);
    await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    const fresh = await lastCode(EMAIL);
    await expireCodes(EMAIL);
    const expired = await post(app, '/v1/auth/reset-password', body(fresh));
    expect(expired.json().error.code).toBe('CODE_EXPIRED');
  });

  it("does not reset a different user's password with someone else's code", async () => {
    const app = await authApp();
    await register(app);
    await register(app, { email: 'other@example.com' });
    await post(app, '/v1/auth/forgot-password', { email: 'other@example.com' });
    const othersCode = await lastCode('other@example.com');
    const res = await post(app, '/v1/auth/reset-password', {
      email: EMAIL,
      code: othersCode,
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(400);
    expect((await login(app, EMAIL, device(1))).statusCode).toBe(200);
  });

  it('enforces the minimum password length', async () => {
    const app = await authApp();
    const res = await post(app, '/v1/auth/reset-password', {
      email: EMAIL,
      code: '123456',
      newPassword: 'short',
    });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('SPEC H: change password', () => {
  it('needs the current password', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await send(app, 'POST', '/v1/me/change-password', s.accessToken, {
      currentPassword: 'not-my-password',
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    expect((await login(app, EMAIL, device(1))).statusCode).toBe(200);
  });

  it('changes it, keeps this session and signs the other devices out', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    const b = await loginOn(app, EMAIL, device(2));
    const res = await send(app, 'POST', '/v1/me/change-password', a.accessToken, {
      currentPassword: PASSWORD,
      newPassword: NEW_PASSWORD,
    });
    expect(res.statusCode).toBe(204);
    expect((await send(app, 'GET', '/v1/me', a.accessToken)).statusCode).toBe(200);
    expect((await send(app, 'GET', '/v1/me', b.accessToken)).statusCode).toBe(401);
    expect((await login(app, EMAIL, device(1))).statusCode).toBe(401);
    expect((await login(app, EMAIL, device(1), {}, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('enforces the minimum length', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await send(app, 'POST', '/v1/me/change-password', s.accessToken, {
      currentPassword: PASSWORD,
      newPassword: 'short',
    });
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('SPEC H: change email (re-verify)', () => {
  const NEW = 'new@example.com';

  it('emails a code to the NEW address and changes nothing until it is confirmed', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: 'New@Example.com',
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(204);
    expect(await emailsTo(NEW)).toEqual([expect.objectContaining({ template: 'changeEmail' })]);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: s.userId } })).email).toBe(EMAIL);
  });

  it('needs the password', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    const res = await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: NEW,
      password: 'not-my-password',
    });
    expect(res.statusCode).toBe(401);
    expect(await emailsTo(NEW)).toHaveLength(0);
  });

  it('refuses an address that is taken, in any case, and the current address', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await register(app, { email: 'taken@example.com' });
    const taken = await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: 'TAKEN@example.com',
      password: PASSWORD,
    });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('EMAIL_TAKEN');
    const same = await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: EMAIL,
      password: PASSWORD,
    });
    expect(same.statusCode).toBe(400);
  });

  it('confirms with the code: email changes, is verified, and the default username follows', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: NEW,
      password: PASSWORD,
    });
    const res = await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, {
      code: await lastCode(NEW),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: NEW, username: NEW, emailVerified: true });
    expect((await login(app, NEW)).statusCode).toBe(200);
    expect((await login(app, EMAIL)).statusCode).toBe(401);
  });

  it('keeps a custom username', async () => {
    const app = await authApp();
    const s = await signedIn(app, { username: 'bat.erdene' });
    await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: NEW,
      password: PASSWORD,
    });
    const res = await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, {
      code: await lastCode(NEW),
    });
    expect(res.json().user.username).toBe('bat.erdene');
  });

  it('rejects a wrong code, counts attempts, and the code works once', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: NEW,
      password: PASSWORD,
    });
    const code = await lastCode(NEW);
    const wrong = code === '111111' ? '222222' : '111111';
    const bad = await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, {
      code: wrong,
    });
    expect(bad.json().error.code).toBe('CODE_INVALID');
    for (let i = 0; i < 4; i++) {
      await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, { code: wrong });
    }
    const locked = await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, { code });
    expect(locked.json().error.code).toBe('CODE_ATTEMPTS_EXCEEDED');
    expect((await testDb.user.findUniqueOrThrow({ where: { id: s.userId } })).email).toBe(EMAIL);
  });

  it('cannot use an email code issued for a different user', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    const b = await signedIn(app, { email: 'b@example.com', device: device(5) });
    await send(app, 'POST', '/v1/me/change-email', a.accessToken, {
      newEmail: NEW,
      password: PASSWORD,
    });
    const res = await send(app, 'POST', '/v1/me/change-email/verify', b.accessToken, {
      code: await lastCode(NEW),
    });
    expect(res.statusCode).toBe(400);
    expect((await testDb.user.findUniqueOrThrow({ where: { id: b.userId } })).email).toBe(
      'b@example.com',
    );
  });

  it('refuses the confirmation if the address was taken in the meantime', async () => {
    const app = await authApp();
    const s = await signedIn(app);
    await send(app, 'POST', '/v1/me/change-email', s.accessToken, {
      newEmail: NEW,
      password: PASSWORD,
    });
    const code = await lastCode(NEW); // before the other user's registration mail reaches NEW
    await register(app, { email: NEW });
    const res = await send(app, 'POST', '/v1/me/change-email/verify', s.accessToken, { code });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('EMAIL_TAKEN');
    expect((await testDb.user.findUniqueOrThrow({ where: { id: s.userId } })).email).toBe(EMAIL);
  });
});

describe('SPEC H/B: devices', () => {
  it('lists devices and marks the current one', async () => {
    const app = await authApp();
    const a = await signedIn(app, { device: device(1, 'ios') });
    await loginOn(app, EMAIL, device(2));
    const res = await send(app, 'GET', '/v1/me/devices', a.accessToken);
    expect(res.statusCode).toBe(200);
    const list = res.json().devices as { platform: string; current: boolean }[];
    expect(list).toHaveLength(2);
    expect(list.filter((d) => d.current).map((d) => d.platform)).toEqual(['ios']);
  });

  it("only lists the user's own devices", async () => {
    const app = await authApp();
    const a = await signedIn(app);
    await signedIn(app, { email: 'other@example.com', device: device(9) });
    const res = await send(app, 'GET', '/v1/me/devices', a.accessToken);
    expect(res.json().devices).toHaveLength(1);
  });

  it('removes a device only with the password, and signs that device out', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    const b = await loginOn(app, EMAIL, device(2));
    const other = (await send(app, 'GET', '/v1/me/devices', a.accessToken))
      .json()
      .devices.find((d: { current: boolean }) => !d.current);

    const wrong = await send(app, 'DELETE', `/v1/me/devices/${other.id}`, a.accessToken, {
      password: 'not-my-password',
    });
    expect(wrong.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe('INVALID_CREDENTIALS');
    expect(await testDb.device.count()).toBe(2);

    const missing = await send(app, 'DELETE', `/v1/me/devices/${other.id}`, a.accessToken);
    expect(missing.statusCode).toBe(400);

    const ok = await send(app, 'DELETE', `/v1/me/devices/${other.id}`, a.accessToken, {
      password: PASSWORD,
    });
    expect(ok.statusCode).toBe(204);
    expect(await testDb.device.count()).toBe(1);
    expect((await send(app, 'GET', '/v1/me', b.accessToken)).statusCode).toBe(401);
    expect((await send(app, 'GET', '/v1/me', a.accessToken)).statusCode).toBe(200);
    // A slot is free again.
    expect((await login(app, EMAIL, device(3))).statusCode).toBe(200);
  });

  it("cannot remove another user's device", async () => {
    const app = await authApp();
    const a = await signedIn(app);
    await signedIn(app, { email: 'other@example.com', device: device(9) });
    const foreign = await testDb.device.findFirstOrThrow({
      where: { deviceId: device(9).deviceId },
    });
    const res = await send(app, 'DELETE', `/v1/me/devices/${foreign.id}`, a.accessToken, {
      password: PASSWORD,
    });
    expect(res.statusCode).toBe(404);
    expect(await testDb.device.count({ where: { id: foreign.id } })).toBe(1);
  });
});

describe('SPEC H: delete account', () => {
  it('soft deletes, anonymizes, revokes sessions and removes devices', async () => {
    const app = await authApp();
    const a = await signedIn(app, { username: 'bat.erdene' });
    const b = await loginOn(app, EMAIL, device(2));
    await testDb.authIdentity.create({
      data: { userId: a.userId, provider: 'GOOGLE', providerSubject: 'g-1', email: EMAIL },
    });

    const res = await send(app, 'DELETE', '/v1/me', a.accessToken);
    expect(res.statusCode).toBe(204);

    const user = await testDb.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user).toMatchObject({
      status: 'DELETED',
      username: `deleted-${a.userId}`,
      email: `deleted-${a.userId}@deleted.invalid`,
      phone: '',
      passwordHash: null,
      totpSecret: null,
      emailVerifiedAt: null,
    });
    expect(user.deletedAt).not.toBeNull();
    expect(JSON.stringify(user)).not.toMatch(/bat\.erdene|Бат|Эрдэнэ|99112233/);
    expect(await testDb.session.count({ where: { userId: a.userId, revokedAt: null } })).toBe(0);
    expect(await testDb.device.count({ where: { userId: a.userId } })).toBe(0);
    expect(await testDb.authIdentity.count({ where: { userId: a.userId } })).toBe(0);
    expect(await testDb.emailCode.count({ where: { userId: a.userId } })).toBe(0);

    for (const token of [a.accessToken, b.accessToken]) {
      expect((await send(app, 'GET', '/v1/me', token)).statusCode).toBe(401);
    }
    const refresh = await post(app, '/v1/auth/refresh', {
      refreshToken: a.refreshToken,
      deviceId: a.deviceId,
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('a deleted user cannot log in (by email, username or after a password reset)', async () => {
    const app = await authApp();
    const a = await signedIn(app, { username: 'bat.erdene' });
    await send(app, 'DELETE', '/v1/me', a.accessToken);

    for (const id of [
      EMAIL,
      'bat.erdene',
      `deleted-${a.userId}`,
      `deleted-${a.userId}@deleted.invalid`,
    ]) {
      const res = await login(app, id);
      expect(res.statusCode, id).toBe(401);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    }
  });

  it('refuses a DELETED row on status alone, even with the right password', async () => {
    const app = await authApp();
    await register(app);
    await testDb.user.update({ where: { email: EMAIL }, data: { status: 'DELETED' } });
    const res = await login(app, EMAIL);
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    const forgot = await post(app, '/v1/auth/forgot-password', { email: EMAIL });
    expect(forgot.statusCode).toBe(204);
    expect(await emailsTo(EMAIL)).toHaveLength(1); // only the registration mail
  });

  it('keeps subscriptions and payments', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    const plan = await testDb.plan.create({
      data: { name: 'Жил', durationDays: 365, priceMnt: 100000 },
    });
    const sub = await testDb.subscription.create({
      data: {
        userId: a.userId,
        planId: plan.id,
        status: 'ACTIVE',
        referenceCode: 'ONG-AAAAA',
        amountMnt: 100000,
      },
    });
    await testDb.payment.create({
      data: { subscriptionId: sub.id, method: 'BANK_TRANSFER', amountMnt: 100000 },
    });
    await send(app, 'DELETE', '/v1/me', a.accessToken);
    expect(await testDb.subscription.count({ where: { userId: a.userId } })).toBe(1);
    expect(await testDb.payment.count()).toBe(1);
  });

  it('frees the email and username for a new registration', async () => {
    const app = await authApp();
    const a = await signedIn(app, { username: 'bat.erdene' });
    await send(app, 'DELETE', '/v1/me', a.accessToken);
    const again = await register(app, { username: 'bat.erdene' });
    expect(again.statusCode).toBe(201);
    expect(again.json().user.id).not.toBe(a.userId);
  });

  it('is idempotent at the data layer: deleting twice does not change the first deletion', async () => {
    const app = await authApp();
    const a = await signedIn(app);
    await send(app, 'DELETE', '/v1/me', a.accessToken);
    const first = await testDb.user.findUniqueOrThrow({ where: { id: a.userId } });
    const second = await send(app, 'DELETE', '/v1/me', a.accessToken);
    expect(second.statusCode).toBe(401); // the token died with the first deletion
    const after = await testDb.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(after.deletedAt).toEqual(first.deletedAt);
  });
});
