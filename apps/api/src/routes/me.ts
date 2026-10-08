import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  changeEmailRequestSchema,
  changeEmailVerifyRequestSchema,
  changePasswordRequestSchema,
  devicesResponseSchema,
  meResponseSchema,
  removeDeviceRequestSchema,
} from '@ongod/shared';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { AuthLimiter } from '../auth/rate-limit';
import { toUserDto, type AuthService } from '../auth/service';

const deviceParams = z.object({ id: z.string().min(1).max(64) });

/** /v1/me/*: the signed-in user (SPEC H). Every route requires a valid access token. */
export async function meRoutes(
  app: FastifyInstance,
  opts: {
    auth: AuthService;
    limiter: AuthLimiter;
    requireAuth: ReturnType<typeof createAuthGuard>;
  },
) {
  const { auth, limiter } = opts;
  app.addHook('preHandler', opts.requireAuth);

  app.get('/me', { config: { allowPending: true } }, async (req) =>
    meResponseSchema.parse({ user: toUserDto(authOf(req).user) }),
  );

  app.post('/me/change-password', async (req, reply) => {
    const { user, session } = authOf(req);
    const body = changePasswordRequestSchema.parse(req.body);
    limiter.check(req, 'password', user.id);
    await auth.changePassword(user, session.id, body.currentPassword, body.newPassword);
    return reply.code(204).send();
  });

  app.post('/me/change-email', async (req, reply) => {
    const { user } = authOf(req);
    const body = changeEmailRequestSchema.parse(req.body);
    limiter.check(req, 'change-email', user.id);
    await auth.requestEmailChange(user, body.newEmail, body.password);
    return reply.code(204).send();
  });

  app.post('/me/change-email/verify', async (req) => {
    const { user } = authOf(req);
    const body = changeEmailVerifyRequestSchema.parse(req.body);
    limiter.check(req, 'change-email', user.id);
    return meResponseSchema.parse({ user: await auth.confirmEmailChange(user, body.code) });
  });

  app.get('/me/devices', async (req) => {
    const { user, session } = authOf(req);
    return devicesResponseSchema.parse({
      devices: await auth.listDevices(user.id, session.deviceId),
    });
  });

  app.delete('/me/devices/:id', async (req, reply) => {
    const { user } = authOf(req);
    const { id } = deviceParams.parse(req.params);
    const body = removeDeviceRequestSchema.parse(req.body);
    limiter.check(req, 'password', user.id);
    await auth.removeDevice(user, id, body.password);
    return reply.code(204).send();
  });

  app.delete('/me', async (req, reply) => {
    await auth.deleteAccount(authOf(req).user.id);
    return reply.code(204).send();
  });
}
