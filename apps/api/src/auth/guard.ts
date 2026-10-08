import type { FastifyRequest } from 'fastify';
import type { Db } from '../db';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { Session, User } from '../generated/prisma/client';
import { verifyAccessToken } from './crypto';

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Route stays reachable for PENDING_PROFILE users. Default: PROFILE_INCOMPLETE (403). */
    allowPending?: boolean;
  }

  interface FastifyRequest {
    /** Set by the auth guard on authenticated routes. */
    auth?: { user: User; session: Session };
  }
}

/**
 * preHandler for authenticated routes. Besides the JWT signature and expiry it checks the
 * session row, so logout, device removal, password reset and account deletion take effect
 * immediately instead of after the 15-minute token lifetime.
 */
export function createAuthGuard(deps: { db: Db; env: Env }) {
  const cfg = { secret: deps.env.JWT_ACCESS_SECRET, ttlSeconds: deps.env.ACCESS_TOKEN_TTL_SECONDS };

  return async function requireAuth(req: FastifyRequest): Promise<void> {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
    const claims = token ? await verifyAccessToken(cfg, token) : null;
    if (!claims) throw new AppError(401, 'UNAUTHORIZED');

    const session = await deps.db.session.findUnique({
      where: { id: claims.sessionId },
      include: { user: true },
    });
    if (
      !session ||
      session.userId !== claims.userId ||
      session.revokedAt ||
      session.expiresAt <= new Date()
    ) {
      throw new AppError(401, 'UNAUTHORIZED');
    }
    const { user, ...rest } = session;
    if (user.status === 'DISABLED') throw new AppError(403, 'ACCOUNT_DISABLED');
    if (user.status === 'DELETED') throw new AppError(401, 'UNAUTHORIZED');
    // SPEC C: until "complete profile" is done, only routes that opt in are reachable
    // (complete-profile and GET /me; logout is public and takes a refresh token).
    if (user.status === 'PENDING_PROFILE' && !req.routeOptions.config.allowPending) {
      throw new AppError(403, 'PROFILE_INCOMPLETE');
    }
    req.auth = { user, session: rest };
  };
}

/** The authenticated user and session; only call from routes behind `requireAuth`. */
export function authOf(req: FastifyRequest) {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED');
  return req.auth;
}
