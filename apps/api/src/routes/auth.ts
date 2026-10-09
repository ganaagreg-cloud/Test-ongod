import type { FastifyInstance } from 'fastify';
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutRequestSchema,
  refreshRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  resendCodeRequestSchema,
  resetPasswordRequestSchema,
  tokenPairSchema,
  verifyEmailRequestSchema,
} from '@ongod/shared';
import type { AuthLimiter } from '../auth/rate-limit';
import type { AuthService } from '../auth/service';
import type { WebSession } from '../auth/web-session';
import { AppError } from '../errors';

/** /v1/auth/*: public endpoints (SPEC A, B, H). */
export async function authRoutes(
  app: FastifyInstance,
  opts: { auth: AuthService; limiter: AuthLimiter; webSession: WebSession },
) {
  const { auth, limiter, webSession } = opts;

  app.post('/auth/register', async (req, reply) => {
    const body = registerRequestSchema.parse(req.body);
    limiter.check(req, 'register', body.email);
    const user = await auth.register(body);
    return reply.code(201).send(registerResponseSchema.parse({ user }));
  });

  app.post('/auth/verify-email', async (req, reply) => {
    const body = verifyEmailRequestSchema.parse(req.body);
    limiter.check(req, 'code', body.email);
    await auth.verifyEmail(body.email, body.code);
    return reply.code(204).send();
  });

  app.post('/auth/resend-code', async (req, reply) => {
    const body = resendCodeRequestSchema.parse(req.body);
    limiter.check(req, 'code', body.email);
    await auth.resendVerifyCode(body.email);
    return reply.code(204).send();
  });

  app.post('/auth/login', async (req, reply) => {
    const body = loginRequestSchema.parse(req.body);
    limiter.check(req, 'login', body.identifier);
    const { tokens, user } = await auth.login(body);
    if (body.platform === 'web' || body.platform === 'admin') {
      // Web: the refresh token goes into the httpOnly cookie and never into the body.
      webSession.set(reply, tokens.refreshToken!, body.platform);
      return loginResponseSchema.parse({
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        user,
      });
    }
    return loginResponseSchema.parse({ ...tokens, user });
  });

  app.post('/auth/refresh', async (req, reply) => {
    const body = refreshRequestSchema.parse(req.body);
    // Native apps send the token in the body; the portal relies on its cookie.
    const viaCookie = body.refreshToken === undefined;
    const app = body.platform ?? 'web';
    const token = body.refreshToken ?? webSession.read(req, app);
    if (!token) throw new AppError(401, 'UNAUTHORIZED');
    if (viaCookie) webSession.assertSameOrigin(req);
    // Per device only: the token is unguessable, and many phones can share one carrier IP.
    limiter.checkIdentifier('refresh', body.deviceId);

    let tokens;
    try {
      tokens = await auth.refresh(token, body.deviceId);
    } catch (err) {
      // A dead or reused token: stop the browser from sending it again.
      if (viaCookie) webSession.clear(reply, app);
      throw err;
    }
    if (viaCookie) {
      webSession.set(reply, tokens.refreshToken!, app);
      return tokenPairSchema.parse({
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      });
    }
    return tokenPairSchema.parse(tokens);
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = logoutRequestSchema.parse(req.body);
    const viaCookie = body.refreshToken === undefined;
    const app = body.platform ?? 'web';
    const token = body.refreshToken ?? webSession.read(req, app);
    if (viaCookie) webSession.assertSameOrigin(req);
    if (token) await auth.logout(token);
    if (viaCookie) webSession.clear(reply, app);
    return reply.code(204).send();
  });

  app.post('/auth/forgot-password', async (req, reply) => {
    const body = forgotPasswordRequestSchema.parse(req.body);
    limiter.check(req, 'code', body.email);
    await auth.forgotPassword(body.email);
    return reply.code(204).send();
  });

  app.post('/auth/reset-password', async (req, reply) => {
    const body = resetPasswordRequestSchema.parse(req.body);
    limiter.check(req, 'code', body.email);
    await auth.resetPassword(body.email, body.code, body.newPassword);
    return reply.code(204).send();
  });
}
