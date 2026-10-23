import type { FastifyInstance } from 'fastify';
import {
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
import type { PaymentService } from '../payments/service';
import type { SubscriptionService } from '../subscriptions/service';

/** /v1/plans and /v1/subscriptions: the portal side of SPEC D. Never called by the mobile apps. */
export async function subscriptionRoutes(
  app: FastifyInstance,
  opts: {
    subscriptions: SubscriptionService;
    payments: PaymentService;
    requireAuth: ReturnType<typeof createAuthGuard>;
  },
) {
  const { subscriptions, payments } = opts;

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
  });
}
