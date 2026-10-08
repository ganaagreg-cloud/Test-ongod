import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { CODE_LENGTH } from '@ongod/shared';

// Only proven primitives (argon2, jose, node:crypto SHA-256/HMAC/CSPRNG) - ADR-0008.

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/**
 * Verifies against a throwaway hash so "no such user" costs the same time as "wrong password".
 * Always returns false.
 */
export async function burnPasswordCheck(password: string): Promise<false> {
  dummyHash ??= hashPassword('not-a-real-password');
  await verifyPassword(await dummyHash, password);
  return false;
}

// ---- Access token (JWT, HS256) ----

const accessClaims = z.object({
  sub: z.string().min(1),
  sid: z.string().min(1),
});

export interface AccessTokenConfig {
  secret: string;
  ttlSeconds: number;
}

export async function signAccessToken(
  cfg: AccessTokenConfig,
  claims: { userId: string; sessionId: string },
): Promise<string> {
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${cfg.ttlSeconds}s`)
    .sign(new TextEncoder().encode(cfg.secret));
}

/** Returns the user and session ids, or null for any invalid or expired token. */
export async function verifyAccessToken(
  cfg: AccessTokenConfig,
  token: string,
): Promise<{ userId: string; sessionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(cfg.secret), {
      algorithms: ['HS256'],
    });
    const claims = accessClaims.parse(payload);
    return { userId: claims.sub, sessionId: claims.sid };
  } catch {
    return null;
  }
}

// ---- Refresh token (opaque) ----

export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');

// ---- Email codes ----

export const newEmailCode = () =>
  String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');

/**
 * Keyed hash of a 6-digit code. Plain SHA-256 of 10^6 values is reversible in
 * milliseconds if the table leaks, so the server secret is mixed in (HMAC-SHA256).
 */
export const hashEmailCode = (secret: string, userId: string, purpose: string, code: string) =>
  createHmac('sha256', secret).update(`${userId}:${purpose}:${code}`).digest('hex');

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
