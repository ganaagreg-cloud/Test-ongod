import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  changeEmailRequestSchema,
  changeEmailVerifyRequestSchema,
  changePasswordRequestSchema,
  devicesResponseSchema,
  meResponseSchema,
  notificationsResponseSchema,
  pushTokenRequestSchema,
  removeDeviceRequestSchema,
  updateProfileRequestSchema,
} from '@ongod/shared';
import type { NotificationService } from '../notifications/service';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { AuthLimiter } from '../auth/rate-limit';
import { toUserDto, type AuthService } from '../auth/service';

const deviceParams = z.object({ id: z.string().min(1).max(64) });

/** /v1/me/*: the signed-in user (SPEC H). Every route requires a valid access token. */
/** PUT /v1/me/push-token calls one address may make a minute. */
export const PUSH_TOKEN_MAX_PER_MINUTE = 20;

export async function meRoutes(
  app: FastifyInstance,
  opts: {
    auth: AuthService;
    limiter: AuthLimiter;
    notifications: NotificationService;
    requireAuth: ReturnType<typeof createAuthGuard>;
  },
) {
  const { auth, limiter, notifications } = opts;
  app.addHook('preHandler', opts.requireAuth);

  app.get('/me', { config: { allowPending: true } }, async (req) =>
    meResponseSchema.parse({ user: toUserDto(authOf(req).user) }),
  );

  app.patch('/me', async (req) => {
    const { user } = authOf(req);
    const body = updateProfileRequestSchema.parse(req.body);
    return meResponseSchema.parse({ user: await auth.updateProfile(user, body) });
  });

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

  // The app's push token for this device, or null to stop push here (ADR-0055).
  // Its own small limit (audit 2026-11-12): on 2026-11-11 one phone sent about 70,000 of these
  // in two hours, used up the shared per-address limit and locked people out of login. A phone
  // needs a handful a day; past the limit only this route answers 429.
  app.put(
    '/me/push-token',
    { config: { rateLimit: { max: PUSH_TOKEN_MAX_PER_MINUTE, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const { user, session } = authOf(req);
      const { token } = pushTokenRequestSchema.parse(req.body);
      await auth.setPushToken(user.id, session.deviceId, token);
      return reply.code(204).send();
    },
  );

  // The bell on Нүүр (ADR-0099): the member's own notifications, and "all read".
  app.get('/me/notifications', async (req, reply) => {
    reply.header('cache-control', 'private, no-store');
    return notificationsResponseSchema.parse(await notifications.list(authOf(req).user.id));
  });
  app.post('/me/notifications/read', async (req, reply) => {
    await notifications.markAllRead(authOf(req).user.id);
    return reply.code(204).send();
  });

  app.delete('/me', async (req, reply) => {
    await auth.deleteAccount(authOf(req).user.id);
    return reply.code(204).send();
  });
}
