import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  appleLoginRequestSchema,
  completeProfileRequestSchema,
  completeProfileResponseSchema,
  googleLoginRequestSchema,
  identitiesResponseSchema,
  linkAppleRequestSchema,
  linkGoogleRequestSchema,
  linkResponseSchema,
  loginResponseSchema,
} from '@ongod/shared';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { AuthLimiter } from '../auth/rate-limit';
import type { SocialService } from '../auth/social-service';
import type { SocialVerifiers } from '../auth/social';

const identityParams = z.object({ id: z.string().min(1).max(64) });

/**
 * Registered only when SOCIAL_LOGIN is on (otherwise these paths are plain 404s).
 * /auth/google and /auth/apple are public; complete-profile and /me/* need a token.
 */
export async function socialRoutes(
  app: FastifyInstance,
  opts: {
    social: SocialService;
    verifiers: SocialVerifiers;
    limiter: AuthLimiter;
    requireAuth: ReturnType<typeof createAuthGuard>;
  },
) {
  const { social, verifiers, limiter, requireAuth } = opts;

  app.post('/auth/google', async (req) => {
    const body = googleLoginRequestSchema.parse(req.body);
    limiter.check(req, 'social', body.deviceId);
    const identity = await verifiers.google(body.idToken, body.nonce);
    return loginResponseSchema.parse(await flatten(social.signIn('GOOGLE', identity, body)));
  });

  app.post('/auth/apple', async (req) => {
    const body = appleLoginRequestSchema.parse(req.body);
    limiter.check(req, 'social', body.deviceId);
    const identity = await verifiers.apple(body.idToken, body.nonce);
    return loginResponseSchema.parse(await flatten(social.signIn('APPLE', identity, body)));
  });

  // The only write route a PENDING_PROFILE user can reach.
  app.post(
    '/auth/complete-profile',
    { preHandler: requireAuth, config: { allowPending: true } },
    async (req) => {
      const { user } = authOf(req);
      const body = completeProfileRequestSchema.parse(req.body);
      limiter.check(req, 'complete-profile', user.id);
      return completeProfileResponseSchema.parse({
        user: await social.completeProfile(user, body),
      });
    },
  );

  app.post('/me/link/google', { preHandler: requireAuth }, async (req) => {
    const { user } = authOf(req);
    const body = linkGoogleRequestSchema.parse(req.body);
    limiter.check(req, 'link', user.id);
    const identity = await verifiers.google(body.idToken, body.nonce);
    return linkResponseSchema.parse({ identity: await social.link(user, 'GOOGLE', identity) });
  });

  app.post('/me/link/apple', { preHandler: requireAuth }, async (req) => {
    const { user } = authOf(req);
    const body = linkAppleRequestSchema.parse(req.body);
    limiter.check(req, 'link', user.id);
    const identity = await verifiers.apple(body.idToken, body.nonce);
    return linkResponseSchema.parse({ identity: await social.link(user, 'APPLE', identity) });
  });

  app.get('/me/identities', { preHandler: requireAuth }, async (req) =>
    identitiesResponseSchema.parse({
      identities: await social.listIdentities(authOf(req).user.id),
    }),
  );

  app.delete('/me/identities/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = identityParams.parse(req.params);
    await social.unlink(authOf(req).user.id, id);
    return reply.code(204).send();
  });
}

const flatten = async (p: ReturnType<SocialService['signIn']>) => {
  const { tokens, user } = await p;
  return { ...tokens, user };
};
