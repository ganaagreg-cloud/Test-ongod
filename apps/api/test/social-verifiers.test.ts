import { createHash } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWTPayload } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  APPLE_ISSUER,
  createAppleVerifier,
  createGoogleVerifier,
  nonceMatches,
  type GoogleClientLike,
} from '../src/auth/social';

// No network: Apple tokens are signed with a local key pair and verified against a local JWKS.

type Key = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

const NONCE = 'raw-nonce-0123456789';
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

let privateKey: Key;
let otherKey: Key;
let verify: ReturnType<typeof createAppleVerifier>;

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  const other = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  otherKey = other.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  verify = createAppleVerifier(
    ['com.ongod.app', 'com.ongod.web'],
    createLocalJWKSet({ keys: [jwk] }),
  );
});

function appleToken(
  claims: JWTPayload = {},
  o: { key?: Key; iss?: string; aud?: string; exp?: string | number; kid?: string } = {},
) {
  return new SignJWT({ nonce: NONCE, email: 'ana@example.com', email_verified: 'true', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: o.kid ?? 'k1' })
    .setIssuer(o.iss ?? APPLE_ISSUER)
    .setAudience(o.aud ?? 'com.ongod.app')
    .setSubject('apple-sub-1')
    .setIssuedAt()
    .setExpirationTime(o.exp ?? '5m')
    .sign(o.key ?? privateKey);
}

const rejects = (p: Promise<unknown>) =>
  expect(p).rejects.toMatchObject({ statusCode: 401, code: 'SOCIAL_TOKEN_INVALID' });

describe('Apple ID token verification (jose)', () => {
  it('accepts a valid token and returns the identity', async () => {
    expect(await verify(await appleToken(), NONCE)).toEqual({
      subject: 'apple-sub-1',
      email: 'ana@example.com',
      emailVerified: true,
      isPrivateRelay: false,
    });
  });

  it('accepts every configured audience (iOS bundle ID and web Services ID)', async () => {
    await verify(await appleToken({}, { aud: 'com.ongod.web' }), NONCE);
  });

  it('handles private relay emails and boolean or string flags', async () => {
    const relay = 'abc123@privaterelay.appleid.com';
    const str = await verify(
      await appleToken({ email: relay, is_private_email: 'true', email_verified: 'true' }),
      NONCE,
    );
    expect(str).toMatchObject({ email: relay, isPrivateRelay: true, emailVerified: true });
    const bool = await verify(
      await appleToken({ email: relay, is_private_email: true, email_verified: true }),
      NONCE,
    );
    expect(bool).toMatchObject({ isPrivateRelay: true, emailVerified: true });
    const no = await verify(
      await appleToken({ is_private_email: 'false', email_verified: 'false' }),
      NONCE,
    );
    expect(no).toMatchObject({ isPrivateRelay: false, emailVerified: false });
  });

  it('lowercases the email and tolerates a missing one', async () => {
    expect((await verify(await appleToken({ email: 'Ana@Example.COM' }), NONCE)).email).toBe(
      'ana@example.com',
    );
    expect((await verify(await appleToken({ email: undefined }), NONCE)).email).toBeUndefined();
  });

  it('checks the nonce: raw or SHA-256 form matches, anything else or none fails', async () => {
    await verify(await appleToken({ nonce: sha256(NONCE) }), NONCE);
    await rejects(verify(await appleToken({ nonce: 'someone-elses-nonce' }), NONCE));
    await rejects(verify(await appleToken({ nonce: undefined }), NONCE));
    await rejects(verify(await appleToken(), 'a-different-nonce-123'));
  });

  it('checks the issuer', async () => {
    await rejects(verify(await appleToken({}, { iss: 'https://evil.example' }), NONCE));
  });

  it('checks the audience', async () => {
    await rejects(verify(await appleToken({}, { aud: 'com.someone.else' }), NONCE));
  });

  it('rejects expired tokens', async () => {
    await rejects(
      verify(await appleToken({}, { exp: Math.floor(Date.now() / 1000) - 120 }), NONCE),
    );
  });

  it('rejects a token signed by another key, an unknown kid, garbage, and alg=HS256', async () => {
    await rejects(verify(await appleToken({}, { key: otherKey }), NONCE));
    await rejects(verify(await appleToken({}, { kid: 'unknown' }), NONCE));
    await rejects(verify('not.a.jwt', NONCE));
    const hs = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: 'HS256', kid: 'k1' })
      .setIssuer(APPLE_ISSUER)
      .setAudience('com.ongod.app')
      .setSubject('x')
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('secret-0123456789abcdef0123456789'));
    await rejects(verify(hs, NONCE));
  });

  it('rejects a token without sub', async () => {
    const t = await new SignJWT({ nonce: NONCE })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(APPLE_ISSUER)
      .setAudience('com.ongod.app')
      .setExpirationTime('5m')
      .sign(privateKey);
    await rejects(verify(t, NONCE));
  });
});

describe('Google ID token verification (google-auth-library)', () => {
  type Payload = { sub: string; email?: string; email_verified?: boolean; nonce?: string };
  function client(payload: () => Payload | undefined) {
    const calls: { idToken: string; audience: string[] }[] = [];
    const fake: GoogleClientLike = {
      verifyIdToken: async (opts) => {
        calls.push(opts);
        return { getPayload: () => payload() };
      },
    };
    return { fake, calls };
  }

  it('passes the idToken and all configured audiences (web, iOS, Android) to the library', async () => {
    const { fake, calls } = client(() => ({
      sub: 'g-1',
      email: 'Ana@Gmail.com',
      email_verified: true,
    }));
    const verifyGoogle = createGoogleVerifier(['web-id', 'ios-id', 'android-id'], fake);
    expect(await verifyGoogle('the-id-token')).toEqual({
      subject: 'g-1',
      email: 'ana@gmail.com',
      emailVerified: true,
      isPrivateRelay: false,
    });
    expect(calls).toEqual([
      { idToken: 'the-id-token', audience: ['web-id', 'ios-id', 'android-id'] },
    ]);
  });

  it('checks the nonce only when one is sent', async () => {
    const { fake } = client(() => ({
      sub: 'g-1',
      email: 'a@b.co',
      email_verified: true,
      nonce: NONCE,
    }));
    const verifyGoogle = createGoogleVerifier(['web-id'], fake);
    await verifyGoogle('t');
    await verifyGoogle('t', NONCE);
    await rejects(verifyGoogle('t', 'another-nonce-0123456'));
    expect(nonceMatches(sha256(NONCE), NONCE)).toBe(true);
  });

  it('reports email_verified false and rejects missing sub or library errors', async () => {
    const unverified = createGoogleVerifier(
      ['w'],
      client(() => ({ sub: 'g', email: 'a@b.co' })).fake,
    );
    expect((await unverified('t')).emailVerified).toBe(false);

    await rejects(createGoogleVerifier(['w'], client(() => ({ sub: '' })).fake)('t'));
    const throwing: GoogleClientLike = {
      verifyIdToken: async () => {
        throw new Error('Wrong recipient, payload audience != requiredAudience');
      },
    };
    await rejects(createGoogleVerifier(['w'], throwing)('t'));
  });
});
