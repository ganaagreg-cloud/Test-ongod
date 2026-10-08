import { describe, expect, it } from 'vitest';
import { AppError } from '../src/errors';
import type { SocialIdentity, SocialVerifiers } from '../src/auth/social';
import { PASSWORD, authApp, device, login, post, register, send, signedIn } from './auth-helpers';
import { testDb, testEnv } from './helpers';

const SOCIAL_ENV = {
  SOCIAL_LOGIN: 'true',
  GOOGLE_CLIENT_IDS: 'g-web,g-ios',
  APPLE_CLIENT_IDS: 'a-1',
};

/** Fake provider: a token string maps to the identity the real verifier would return. */
function fakeProviders() {
  const known = new Map<string, SocialIdentity>();
  let n = 0;
  const verify = async (token: string) => {
    const identity = known.get(token);
    if (!identity) throw new AppError(401, 'SOCIAL_TOKEN_INVALID');
    return identity;
  };
  const verifiers: SocialVerifiers = { google: verify, apple: verify };
  const token = (identity: Partial<SocialIdentity> & { subject: string }) => {
    const t = `fake-id-token-${++n}-0123456789`;
    known.set(t, { emailVerified: true, isPrivateRelay: false, ...identity });
    return t;
  };
  return { verifiers, token };
}

async function socialApp() {
  const providers = fakeProviders();
  const app = await authApp(SOCIAL_ENV, { socialVerifiers: providers.verifiers });
  return { app, ...providers };
}

const google = (
  app: Awaited<ReturnType<typeof socialApp>>['app'],
  idToken: string,
  dev = device(1),
  extra: Record<string, unknown> = {},
) => post(app, '/v1/auth/google', { idToken, ...dev, ...extra });

const apple = (
  app: Awaited<ReturnType<typeof socialApp>>['app'],
  idToken: string,
  dev = device(1),
  extra: Record<string, unknown> = {},
) => post(app, '/v1/auth/apple', { idToken, nonce: 'nonce-0123456789', ...dev, ...extra });

const profile = {
  username: 'ana.bat',
  password: PASSWORD,
  lastName: 'Бат',
  firstName: 'Ану',
  phone: '99112233',
};

describe('SOCIAL_LOGIN flag', () => {
  it('is off by default: none of the social routes exist', async () => {
    const app = await authApp();
    for (const [method, url] of [
      ['POST', '/v1/auth/google'],
      ['POST', '/v1/auth/apple'],
      ['POST', '/v1/auth/complete-profile'],
      ['POST', '/v1/me/link/google'],
      ['POST', '/v1/me/link/apple'],
      ['GET', '/v1/me/identities'],
      ['DELETE', '/v1/me/identities/x'],
    ] as const) {
      const res = await send(app, method, url);
      expect(res.statusCode, url).toBe(404);
      expect(res.json().error.code).toBe('NOT_FOUND');
    }
  });

  it('needs Google and Apple client IDs when on (Apple 4.8: both ship together)', () => {
    expect(() => testEnv({ SOCIAL_LOGIN: 'true' })).toThrowError(
      /GOOGLE_CLIENT_IDS[\s\S]*APPLE_CLIENT_IDS/,
    );
    expect(() => testEnv({ SOCIAL_LOGIN: 'true', GOOGLE_CLIENT_IDS: 'g' })).toThrowError(
      /APPLE_CLIENT_IDS/,
    );
    expect(testEnv(SOCIAL_ENV).GOOGLE_CLIENT_IDS).toEqual(['g-web', 'g-ios']);
    expect(testEnv({ SOCIAL_LOGIN: 'false' }).SOCIAL_LOGIN).toBe(false);
  });
});

describe('SPEC C: new user', () => {
  it('creates a PENDING_PROFILE user with a verified email and gives tokens', async () => {
    const { app, token } = await socialApp();
    const res = await google(app, token({ subject: 'g-1', email: 'ana@example.com' }));
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user).toMatchObject({
      email: 'ana@example.com',
      emailVerified: true,
      status: 'PENDING_PROFILE',
      role: 'USER',
    });
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();

    const user = await testDb.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(await testDb.authIdentity.findFirstOrThrow()).toMatchObject({
      userId: user.id,
      provider: 'GOOGLE',
      providerSubject: 'g-1',
      email: 'ana@example.com',
    });
    expect(await testDb.device.count({ where: { userId: user.id } })).toBe(1);
  });

  it('works the same for Apple, including a private relay email', async () => {
    const { app, token } = await socialApp();
    const relay = 'x7k2abc@privaterelay.appleid.com';
    const res = await apple(app, token({ subject: 'apple-1', email: relay, isPrivateRelay: true }));
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({ email: relay, status: 'PENDING_PROFILE' });
    expect((await testDb.authIdentity.findFirstOrThrow()).provider).toBe('APPLE');
  });

  it('requires a nonce for Apple', async () => {
    const { app, token } = await socialApp();
    const res = await post(app, '/v1/auth/apple', {
      idToken: token({ subject: 'apple-1', email: 'a@example.com' }),
      ...device(1),
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses invalid tokens in the error shape', async () => {
    const { app } = await socialApp();
    const res = await google(app, 'not-a-known-token-0123456789');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'SOCIAL_TOKEN_INVALID', message: expect.any(String) },
    });
    expect(await testDb.user.count()).toBe(0);
  });

  it('refuses an email the provider has not verified, and a new account without an email', async () => {
    const { app, token } = await socialApp();
    const unverified = await google(
      app,
      token({ subject: 'g-1', email: 'ana@example.com', emailVerified: false }),
    );
    expect(unverified.statusCode).toBe(401);
    const none = await apple(app, token({ subject: 'apple-9' }));
    expect(none.statusCode).toBe(400);
    expect(none.json().error.code).toBe('SOCIAL_EMAIL_REQUIRED');
    expect(await testDb.user.count()).toBe(0);
  });

  it('creates one user when the first sign-ins race', async () => {
    const { app, token } = await socialApp();
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    const results = await Promise.all([google(app, t), google(app, t, device(2))]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200]);
    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.authIdentity.count()).toBe(1);
  });
});

describe('SPEC C: PENDING_PROFILE is locked until complete-profile', () => {
  async function pending() {
    const ctx = await socialApp();
    const res = await google(ctx.app, ctx.token({ subject: 'g-1', email: 'ana@example.com' }));
    const body = res.json();
    return { ...ctx, access: body.accessToken as string, refresh: body.refreshToken as string };
  }

  it('answers 403 PROFILE_INCOMPLETE everywhere except complete-profile, me and logout', async () => {
    const { app, access } = await pending();
    const blocked = [
      ['GET', '/v1/me/devices'],
      ['POST', '/v1/me/change-password'],
      ['POST', '/v1/me/change-email'],
      ['POST', '/v1/me/change-email/verify'],
      ['DELETE', '/v1/me/devices/abc'],
      ['DELETE', '/v1/me'],
      ['GET', '/v1/me/identities'],
      ['DELETE', '/v1/me/identities/abc'],
      ['POST', '/v1/me/link/google'],
      ['POST', '/v1/me/link/apple'],
    ] as const;
    for (const [method, url] of blocked) {
      const res = await send(app, method, url, access, {});
      expect(res.statusCode, `${method} ${url}`).toBe(403);
      expect(res.json()).toEqual({
        error: { code: 'PROFILE_INCOMPLETE', message: expect.any(String) },
      });
    }
    expect((await send(app, 'GET', '/v1/me', access)).statusCode).toBe(200);
  });

  it('lets a pending user log out', async () => {
    const { app, access, refresh } = await pending();
    expect((await post(app, '/v1/auth/logout', { refreshToken: refresh })).statusCode).toBe(204);
    expect((await send(app, 'GET', '/v1/me', access)).statusCode).toBe(401);
  });

  it('completes the profile once: ACTIVE, password set, everything unlocked', async () => {
    const { app, access } = await pending();
    const res = await send(app, 'POST', '/v1/auth/complete-profile', access, profile);
    expect(res.statusCode).toBe(200);
    expect(res.json().user).toMatchObject({
      status: 'ACTIVE',
      username: 'ana.bat',
      firstName: 'Ану',
      lastName: 'Бат',
      phone: '99112233',
      emailVerified: true,
    });
    expect((await testDb.user.findFirstOrThrow()).passwordHash).toMatch(/^\$argon2id\$/);
    expect((await send(app, 'GET', '/v1/me/devices', access)).statusCode).toBe(200);
    expect((await login(app, 'ANA.BAT', device(2))).statusCode).toBe(200); // username + password now works
    expect((await login(app, 'ana@example.com', device(2))).statusCode).toBe(200);

    const again = await send(app, 'POST', '/v1/auth/complete-profile', access, profile);
    expect(again.statusCode).toBe(409);
  });

  it('accepts the email as the username (the prefilled default)', async () => {
    const { app, access } = await pending();
    const res = await send(app, 'POST', '/v1/auth/complete-profile', access, {
      ...profile,
      username: 'Ana@Example.com',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.username).toBe('ana@example.com');
  });

  it("validates: taken username, someone else's email, short password, missing fields", async () => {
    const { app, access } = await pending();
    await register(app, { email: 'other@example.com', username: 'ana.bat' });
    const cases: [Record<string, unknown>, number, string][] = [
      [{ ...profile }, 409, 'USERNAME_TAKEN'],
      [{ ...profile, username: 'ANA.BAT' }, 409, 'USERNAME_TAKEN'],
      [{ ...profile, username: 'other@example.com' }, 400, 'VALIDATION_ERROR'],
      [{ ...profile, username: 'fresh.name', password: 'short' }, 400, 'VALIDATION_ERROR'],
      [{ ...profile, username: 'fresh.name', firstName: '' }, 400, 'VALIDATION_ERROR'],
    ];
    for (const [body, status, code] of cases) {
      const res = await send(app, 'POST', '/v1/auth/complete-profile', access, body);
      expect(res.statusCode, JSON.stringify(body)).toBe(status);
      expect(res.json().error.code).toBe(code);
    }
    expect(
      (await testDb.user.findFirstOrThrow({ where: { email: 'ana@example.com' } })).status,
    ).toBe('PENDING_PROFILE');
  });

  it('needs a token, and an already active user cannot use it', async () => {
    const { app } = await pending();
    expect(
      (await send(app, 'POST', '/v1/auth/complete-profile', undefined, profile)).statusCode,
    ).toBe(401);
    const active = await signedIn(app, { email: 'pw@example.com', device: device(5) });
    const res = await send(app, 'POST', '/v1/auth/complete-profile', active.accessToken, {
      ...profile,
      username: 'someone.else',
    });
    expect(res.statusCode).toBe(409);
  });

  it('lets an unfinished user sign in again and carry on', async () => {
    const { app, token } = await socialApp();
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    await google(app, t);
    const second = await google(app, t, device(2));
    expect(second.statusCode).toBe(200);
    expect(second.json().user.status).toBe('PENDING_PROFILE');
    expect(await testDb.user.count()).toBe(1);
  });
});

describe('SPEC C: existing identity', () => {
  it('logs the same user in again, matched by provider subject (not by email)', async () => {
    const { app, token } = await socialApp();
    const first = await google(app, token({ subject: 'g-1', email: 'ana@example.com' }));
    const access = first.json().accessToken;
    await send(app, 'POST', '/v1/auth/complete-profile', access, profile);

    const again = await google(
      app,
      token({ subject: 'g-1', email: 'changed-at-google@example.com' }),
      device(2),
    );
    expect(again.statusCode).toBe(200);
    expect(again.json().user).toMatchObject({ id: first.json().user.id, status: 'ACTIVE' });
    expect(await testDb.user.count()).toBe(1);
  });

  it('needs no email for a known identity (Apple omits it after the first time)', async () => {
    const { app, token } = await socialApp();
    await apple(app, token({ subject: 'apple-1', email: 'ana@example.com' }));
    const again = await apple(app, token({ subject: 'apple-1' }), device(2));
    expect(again.statusCode).toBe(200);
  });

  it('keeps Google and Apple identities separate even with the same subject string', async () => {
    const { app, token } = await socialApp();
    await google(app, token({ subject: 'same', email: 'a@example.com' }));
    await apple(app, token({ subject: 'same', email: 'b@example.com' }));
    expect(await testDb.user.count()).toBe(2);
  });

  it('refuses a disabled user', async () => {
    const { app, token } = await socialApp();
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    await google(app, t);
    await testDb.user.updateMany({ data: { status: 'DISABLED' } });
    const res = await google(app, t);
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('ACCOUNT_DISABLED');
  });

  it('enforces 2 devices; the valid ID token authorises removeDeviceId', async () => {
    const { app, token } = await socialApp();
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    await google(app, t, device(1));
    await google(app, t, device(2));
    const third = await google(app, t, device(3));
    expect(third.statusCode).toBe(403);
    expect(third.json().error.code).toBe('DEVICE_LIMIT');
    expect(third.json().error.details.devices).toHaveLength(2);

    const victim = third.json().error.details.devices[0].id;
    const ok = await google(app, t, device(3), { removeDeviceId: victim });
    expect(ok.statusCode).toBe(200);
    expect(await testDb.device.count()).toBe(2);
  });
});

describe('SPEC C: email belongs to a password user -> LINK_REQUIRED', () => {
  it('refuses to log in or create anything, and tells the client to use the password', async () => {
    const { app, token } = await socialApp();
    await register(app, { email: 'ana@example.com' });
    const res = await google(app, token({ subject: 'g-1', email: 'ana@example.com' }));
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toEqual({
      code: 'LINK_REQUIRED',
      message: expect.any(String),
      details: { email: 'ana@example.com' },
    });
    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.authIdentity.count()).toBe(0);
    expect(await testDb.session.count()).toBe(0);
  });

  it('also applies to Apple', async () => {
    const { app, token } = await socialApp();
    await register(app, { email: 'ana@example.com' });
    const res = await apple(app, token({ subject: 'apple-1', email: 'ana@example.com' }));
    expect(res.json().error.code).toBe('LINK_REQUIRED');
  });

  it('works end to end: LINK_REQUIRED, password login, link, then social login succeeds', async () => {
    const { app, token } = await socialApp();
    await register(app, { email: 'ana@example.com' });
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    expect((await google(app, t)).json().error.code).toBe('LINK_REQUIRED');

    const pw = (await login(app, 'ana@example.com')).json();
    const link = await send(app, 'POST', '/v1/me/link/google', pw.accessToken, { idToken: t });
    expect(link.statusCode).toBe(200);

    const social = await google(app, t, device(2));
    expect(social.statusCode).toBe(200);
    expect(social.json().user).toMatchObject({ id: pw.user.id, status: 'ACTIVE' });
    expect(await testDb.user.count()).toBe(1);
  });
});

describe('linking (signed-in user)', () => {
  it('links Google and Apple after password login; the email may differ', async () => {
    const { app, token } = await socialApp();
    const s = await signedIn(app);
    const g = await send(app, 'POST', '/v1/me/link/google', s.accessToken, {
      idToken: token({ subject: 'g-1', email: 'other-address@gmail.com' }),
    });
    expect(g.statusCode).toBe(200);
    expect(g.json().identity).toEqual({
      id: expect.any(String),
      provider: 'GOOGLE',
      email: 'other-address@gmail.com',
    });
    const a = await send(app, 'POST', '/v1/me/link/apple', s.accessToken, {
      idToken: token({
        subject: 'apple-1',
        email: 'x@privaterelay.appleid.com',
        isPrivateRelay: true,
      }),
      nonce: 'nonce-0123456789',
    });
    expect(a.statusCode).toBe(200);

    const list = await send(app, 'GET', '/v1/me/identities', s.accessToken);
    expect(
      list
        .json()
        .identities.map((i: { provider: string }) => i.provider)
        .sort(),
    ).toEqual(['APPLE', 'GOOGLE']);
  });

  it('is idempotent for the same account', async () => {
    const { app, token } = await socialApp();
    const s = await signedIn(app);
    const t = token({ subject: 'g-1', email: 'x@gmail.com' });
    const first = await send(app, 'POST', '/v1/me/link/google', s.accessToken, { idToken: t });
    const second = await send(app, 'POST', '/v1/me/link/google', s.accessToken, { idToken: t });
    expect(second.statusCode).toBe(200);
    expect(second.json().identity.id).toBe(first.json().identity.id);
    expect(await testDb.authIdentity.count()).toBe(1);
  });

  it('refuses an account linked to another user, and a 2nd account of the same provider', async () => {
    const { app, token } = await socialApp();
    const a = await signedIn(app);
    const b = await signedIn(app, { email: 'b@example.com', device: device(7) });
    const t1 = token({ subject: 'g-1', email: 'x@gmail.com' });
    await send(app, 'POST', '/v1/me/link/google', a.accessToken, { idToken: t1 });

    const taken = await send(app, 'POST', '/v1/me/link/google', b.accessToken, { idToken: t1 });
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe('IDENTITY_TAKEN');

    const second = await send(app, 'POST', '/v1/me/link/google', a.accessToken, {
      idToken: token({ subject: 'g-2', email: 'y@gmail.com' }),
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('IDENTITY_TAKEN');
    expect(await testDb.authIdentity.count()).toBe(1);
  });

  it('needs a signed-in user and a valid token', async () => {
    const { app, token } = await socialApp();
    const s = await signedIn(app);
    const t = token({ subject: 'g-1', email: 'x@gmail.com' });
    expect(
      (await send(app, 'POST', '/v1/me/link/google', undefined, { idToken: t })).statusCode,
    ).toBe(401);
    const bad = await send(app, 'POST', '/v1/me/link/google', s.accessToken, {
      idToken: 'not-a-known-token-0123456789',
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().error.code).toBe('SOCIAL_TOKEN_INVALID');
    const noNonce = await send(app, 'POST', '/v1/me/link/apple', s.accessToken, { idToken: t });
    expect(noNonce.json().error.code).toBe('VALIDATION_ERROR');
  });
});

describe('unlinking', () => {
  async function linked() {
    const ctx = await socialApp();
    const s = await signedIn(ctx.app);
    const link = await send(ctx.app, 'POST', '/v1/me/link/google', s.accessToken, {
      idToken: ctx.token({ subject: 'g-1', email: 'x@gmail.com' }),
    });
    return { ...ctx, s, identityId: link.json().identity.id as string };
  }

  it('removes an identity while the user still has a password', async () => {
    const { app, s, identityId } = await linked();
    const res = await send(app, 'DELETE', `/v1/me/identities/${identityId}`, s.accessToken);
    expect(res.statusCode).toBe(204);
    expect(await testDb.authIdentity.count()).toBe(0);
    expect((await login(app, 'bat@example.com')).statusCode).toBe(200);
  });

  it('cannot unlink the last login method (no password)', async () => {
    const { app, s, identityId } = await linked();
    await testDb.user.update({ where: { id: s.userId }, data: { passwordHash: null } });
    const res = await send(app, 'DELETE', `/v1/me/identities/${identityId}`, s.accessToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('LAST_LOGIN_METHOD');
    expect(await testDb.authIdentity.count()).toBe(1);
  });

  it("cannot unlink another user's identity", async () => {
    const { app, identityId } = await linked();
    const other = await signedIn(app, { email: 'o@example.com', device: device(8) });
    const res = await send(app, 'DELETE', `/v1/me/identities/${identityId}`, other.accessToken);
    expect(res.statusCode).toBe(404);
    expect(await testDb.authIdentity.count()).toBe(1);
  });

  it('needs a token; afterwards the provider no longer logs in as that user', async () => {
    const { app, token, s, identityId } = await linked();
    expect((await send(app, 'DELETE', `/v1/me/identities/${identityId}`)).statusCode).toBe(401);
    await send(app, 'DELETE', `/v1/me/identities/${identityId}`, s.accessToken);
    // Same Google account, email of a password user: back to LINK_REQUIRED.
    const again = await google(app, token({ subject: 'g-1', email: 'bat@example.com' }), device(2));
    expect(again.json().error.code).toBe('LINK_REQUIRED');
  });
});

describe('account deletion with a social identity', () => {
  it('removes the identity so the same Google account can start fresh', async () => {
    const { app, token } = await socialApp();
    const t = token({ subject: 'g-1', email: 'ana@example.com' });
    const first = await google(app, t);
    await send(app, 'POST', '/v1/auth/complete-profile', first.json().accessToken, profile);
    expect((await send(app, 'DELETE', '/v1/me', first.json().accessToken)).statusCode).toBe(204);
    expect(await testDb.authIdentity.count()).toBe(0);

    const again = await google(app, t);
    expect(again.statusCode).toBe(200);
    expect(again.json().user.id).not.toBe(first.json().user.id);
    expect(again.json().user.status).toBe('PENDING_PROFILE');
  });
});

describe('rate limit', () => {
  it('limits social sign-in per IP', async () => {
    const providers = fakeProviders();
    const app = await authApp(
      { ...SOCIAL_ENV, AUTH_RATE_LIMIT_IP_MAX: '2' },
      { socialVerifiers: providers.verifiers },
    );
    const codes = [];
    for (let i = 0; i < 3; i++)
      codes.push((await google(app, 'unknown-token-0123456789')).statusCode);
    expect(codes).toEqual([401, 401, 429]);
  });
});
