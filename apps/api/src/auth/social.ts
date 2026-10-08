import { createHash } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Env } from '../env';
import { AppError } from '../errors';

// Only proven libraries verify ID tokens (google-auth-library, jose + Apple JWKS) - ADR-0008.
// Source for the Apple values: https://appleid.apple.com/.well-known/openid-configuration
// ([[R-apple-id-token-verification]]).

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export interface SocialIdentity {
  /** Stable provider user id (`sub`). */
  subject: string;
  /** Lowercase. Missing when the provider sent none (Apple after the first sign-in). */
  email?: string;
  emailVerified: boolean;
  /** Apple "hide my email" relay address. */
  isPrivateRelay: boolean;
}

/** Tests replace this with fakes. Both throw AppError(401, SOCIAL_TOKEN_INVALID) on any failure. */
export interface SocialVerifiers {
  google(idToken: string, nonce?: string): Promise<SocialIdentity>;
  apple(idToken: string, nonce: string): Promise<SocialIdentity>;
}

const invalid = () => new AppError(401, 'SOCIAL_TOKEN_INVALID');

/** Apple sends booleans as `true` or as the string "true". */
const truthy = (v: unknown) => v === true || v === 'true';

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * The nonce claim holds what the app gave Apple/Google. Apps usually pass the SHA-256 of a
 * random value and send us the raw value, so both the raw and the hashed form are accepted.
 */
export const nonceMatches = (claim: unknown, nonce: string) =>
  typeof claim === 'string' && (claim === nonce || claim === sha256Hex(nonce));

const normalizeEmail = (email: unknown) =>
  typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : undefined;

export interface GoogleClientLike {
  verifyIdToken(opts: { idToken: string; audience: string[] }): Promise<{
    getPayload():
      { sub: string; email?: string; email_verified?: boolean; nonce?: string } | undefined;
  }>;
}

export function createGoogleVerifier(
  audiences: string[],
  client: GoogleClientLike = new OAuth2Client(),
): SocialVerifiers['google'] {
  return async (idToken, nonce) => {
    try {
      // The library checks the signature (Google certs), expiry, issuer and the audience list.
      const ticket = await client.verifyIdToken({ idToken, audience: audiences });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw invalid();
      if (nonce !== undefined && !nonceMatches(payload.nonce, nonce)) throw invalid();
      return {
        subject: payload.sub,
        email: normalizeEmail(payload.email),
        emailVerified: truthy(payload.email_verified),
        isPrivateRelay: false,
      };
    } catch (err) {
      throw err instanceof AppError ? err : invalid();
    }
  };
}

export function createAppleVerifier(
  audiences: string[],
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(APPLE_JWKS_URL)),
): SocialVerifiers['apple'] {
  return async (idToken, nonce) => {
    try {
      const { payload } = await jwtVerify(idToken, keys, {
        issuer: APPLE_ISSUER,
        audience: audiences,
        algorithms: ['RS256'],
      });
      if (!payload.sub) throw invalid();
      if (!nonceMatches(payload.nonce, nonce)) throw invalid();
      return {
        subject: payload.sub,
        email: normalizeEmail(payload.email),
        emailVerified: truthy(payload.email_verified),
        isPrivateRelay: truthy(payload.is_private_email),
      };
    } catch (err) {
      throw err instanceof AppError ? err : invalid();
    }
  };
}

export function createSocialVerifiers(env: Pick<Env, 'GOOGLE_CLIENT_IDS' | 'APPLE_CLIENT_IDS'>) {
  return {
    google: createGoogleVerifier(env.GOOGLE_CLIENT_IDS),
    apple: createAppleVerifier(env.APPLE_CLIENT_IDS),
  } satisfies SocialVerifiers;
}
