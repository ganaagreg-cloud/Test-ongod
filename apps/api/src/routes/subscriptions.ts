import type { FastifyInstance } from 'fastify';
import {
  createGiftRequestSchema,
  giftParamsSchema,
  giftResponseSchema,
  giftsResponseSchema,
  redeemGiftRequestSchema,
  redeemGiftResponseSchema,
  createSubscriptionRequestSchema,
  createSubscriptionResponseSchema,
  currentSubscriptionResponseSchema,
  mockPaymentRequestSchema,
  plansResponseSchema,
  subscriptionParamsSchema,
  subscriptionSchema,
} from '@ongod/shared';
import { z } from 'zod';
import { authOf, type createAuthGuard } from '../auth/guard';
import type { GiftService } from '../gifts/service';
import type { PaymentService } from '../payments/service';
import type { SubscriptionService } from '../subscriptions/service';

/** /v1/plans and /v1/subscriptions: the portal side of SPEC D. Never called by the mobile apps. */
export async function subscriptionRoutes(
  app: FastifyInstance,
  opts: {
    subscriptions: SubscriptionService;
    payments: PaymentService;
    gifts: GiftService;
    requireAuth: ReturnType<typeof createAuthGuard>;
  },
) {
  const { subscriptions, payments, gifts } = opts;

  // Public: the landing page shows the plan and its price before anyone signs up. The mobile
  // apps never call it (ADR-0006), and /v1/app-config still carries no prices.
  app.get('/plans', async () =>
    plansResponseSchema.parse({ plans: await subscriptions.listPlans() }),
  );

  await app.register(async (authed) => {
    authed.addHook('preHandler', opts.requireAuth);

    authed.post('/subscriptions', async (req, reply) => {
      const body = createSubscriptionRequestSchema.parse(req.body);
      const created = await subscriptions.create(authOf(req).user, body.planId);
      return reply.code(201).send(createSubscriptionResponseSchema.parse(created));
    });

    authed.get('/subscriptions/current', async (req) =>
      currentSubscriptionResponseSchema.parse(await subscriptions.current(authOf(req).user)),
    );

    // Development only (404 in production): the mock checkout's buttons, ADR-0041.
    authed.post('/subscriptions/:id/mock', async (req) => {
      const { id } = subscriptionParamsSchema.parse(req.params);
      const { outcome } = mockPaymentRequestSchema.parse(req.body);
      const subscription = await payments.mockOutcome(authOf(req).user, id, outcome);
      return z.object({ subscription: subscriptionSchema }).parse({ subscription });
    });

    // ---- gifts (SPEC J, ADR-0060) ----

    authed.post('/gifts', async (req, reply) => {
      const body = createGiftRequestSchema.parse(req.body);
      const gift = await gifts.create(authOf(req).user, body.planId);
      return reply.code(201).send(giftResponseSchema.parse({ gift }));
    });

    authed.get('/gifts', async (req) =>
      giftsResponseSchema.parse({ gifts: await gifts.listMine(authOf(req).user) }),
    );

    // The code is long and random; the limit only bounds how fast one address can try (ADR-0060).
    authed.post(
      '/gifts/redeem',
      { config: { rateLimit: { max: 10, timeWindow: '15 minutes' } } },
      async (req) => {
        const body = redeemGiftRequestSchema.parse(req.body);
        return redeemGiftResponseSchema.parse(await gifts.redeem(authOf(req).user, body.code));
      },
    );

    // Development only (404 in production): the mock checkout's buttons for a gift.
    authed.post('/gifts/:id/mock', async (req, reply) => {
      const { id } = giftParamsSchema.parse(req.params);
      const { outcome } = mockPaymentRequestSchema.parse(req.body);
      await payments.mockGiftOutcome(authOf(req).user, id, outcome);
      return reply.code(204).send();
    });
  });
}
