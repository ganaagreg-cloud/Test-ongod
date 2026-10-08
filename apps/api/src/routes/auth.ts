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

/** /v1/auth/*: public endpoints (SPEC A, B, H). */
export async function authRoutes(
  app: FastifyInstance,
  opts: { auth: AuthService; limiter: AuthLimiter },
) {
  const { auth, limiter } = opts;

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

  app.post('/auth/login', async (req) => {
    const body = loginRequestSchema.parse(req.body);
    limiter.check(req, 'login', body.identifier);
    const { tokens, user } = await auth.login(body);
    return loginResponseSchema.parse({ ...tokens, user });
  });

  app.post('/auth/refresh', async (req) => {
    const body = refreshRequestSchema.parse(req.body);
    // Per IP only: the token is the identifier and is unguessable.
    limiter.check(req, 'refresh', body.deviceId);
    return tokenPairSchema.parse(await auth.refresh(body.refreshToken, body.deviceId));
  });

  app.post('/auth/logout', async (req, reply) => {
    const body = logoutRequestSchema.parse(req.body);
    await auth.logout(body.refreshToken);
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
