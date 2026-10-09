import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env';
import { AppError } from '../errors';

/** Refresh-token cookies. The portal and the admin share an origin, so each has its own cookie: a customer logging in must not replace the owner's admin session. */
export const REFRESH_COOKIE = 'ongod_rt';
export const ADMIN_REFRESH_COOKIE = 'ongod_art';

export type WebApp = 'web' | 'admin';
const cookieName = (app: WebApp) => (app === 'admin' ? ADMIN_REFRESH_COOKIE : REFRESH_COOKIE);

/**
 * The portal keeps its refresh token in an httpOnly cookie, so scripts (and any XSS) cannot read
 * it, and the access token only in memory (ADR-0026). The cookie is scoped to /v1/auth, is
 * SameSite=Strict (the portal and the API share one origin), and Secure whenever the site is
 * served over https. Requests that rely on the cookie must also come from our own origin.
 */
export function createWebSession(
  env: Pick<Env, 'PUBLIC_BASE_URL' | 'CORS_ORIGINS' | 'REFRESH_TOKEN_TTL_DAYS'>,
) {
  const secure = env.PUBLIC_BASE_URL.startsWith('https://');
  const allowedOrigins = new Set([new URL(env.PUBLIC_BASE_URL).origin, ...env.CORS_ORIGINS]);
  const options = { httpOnly: true, secure, sameSite: 'strict', path: '/v1/auth' } as const;

  return {
    set(reply: FastifyReply, token: string, app: WebApp = 'web') {
      reply.setCookie(cookieName(app), token, {
        ...options,
        maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
      });
    },
    clear(reply: FastifyReply, app: WebApp = 'web') {
      reply.clearCookie(cookieName(app), options);
    },
    read(req: FastifyRequest, app: WebApp = 'web'): string | undefined {
      const value = req.cookies[cookieName(app)];
      return value && value.length > 0 ? value : undefined;
    },
    /**
     * Defence in depth on top of SameSite=Strict: a cookie-authenticated request that names a
     * foreign Origin is refused. (Browsers always send Origin on cross-origin POSTs.)
     */
    assertSameOrigin(req: FastifyRequest) {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.has(origin)) throw new AppError(403, 'FORBIDDEN');
    },
  };
}

export type WebSession = ReturnType<typeof createWebSession>;
