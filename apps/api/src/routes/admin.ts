import type { FastifyInstance } from 'fastify';
import {
  adminIdParamsSchema,
  adminSubscriptionResponseSchema,
  adminSubscriptionsPageSchema,
  adminUserDetailResponseSchema,
  adminUsersPageSchema,
  auditPageSchema,
  dashboardResponseSchema,
  exportPaymentsQuerySchema,
  grantRequestSchema,
  historyResponseSchema,
  listAuditQuerySchema,
  listSubscriptionsQuerySchema,
  listUsersQuerySchema,
  rejectRequestSchema,
  revokeRequestSchema,
} from '@ongod/shared';
import type { AdminQueries } from '../admin/queries';
import type { DecisionService } from '../admin/decisions';
import type { AdminGuards } from '../admin/guard';
import { authOf } from '../auth/guard';

/**
 * /v1/admin/* (SPEC E). Needs an ADMIN/OWNER session (password login only, ADR-0040).
 * Admin responses are never cached.
 */
export async function adminRoutes(
  app: FastifyInstance,
  opts: {
    guards: AdminGuards;
    decisions: DecisionService;
    queries: AdminQueries;
  },
) {
  const { guards, decisions, queries } = opts;
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'private, no-store');
  });

  await app.register(async (admin) => {
    admin.addHook('preHandler', guards.requireAdmin);

    admin.get('/admin/dashboard', async () =>
      dashboardResponseSchema.parse(await queries.dashboard()),
    );

    admin.get('/admin/subscriptions', async (req) =>
      adminSubscriptionsPageSchema.parse(
        await queries.listSubscriptions(listSubscriptionsQuerySchema.parse(req.query)),
      ),
    );

    admin.get('/admin/subscriptions/:id', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      return adminSubscriptionResponseSchema.parse({
        subscription: await queries.getSubscription(id),
      });
    });

    admin.get('/admin/subscriptions/:id/history', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      return historyResponseSchema.parse(await queries.subscriptionHistory(id));
    });

    admin.post('/admin/subscriptions/:id/approve', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const subscription = await decisions.approve(authOf(req).user, id);
      return adminSubscriptionResponseSchema.parse({ subscription });
    });

    admin.post('/admin/subscriptions/:id/reject', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = rejectRequestSchema.parse(req.body);
      const subscription = await decisions.reject(authOf(req).user, id, body.reason);
      return adminSubscriptionResponseSchema.parse({ subscription });
    });

    admin.post('/admin/subscriptions/:id/revoke', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = revokeRequestSchema.parse(req.body);
      const subscription = await decisions.revoke(authOf(req).user, id, body);
      return adminSubscriptionResponseSchema.parse({ subscription });
    });

    admin.get('/admin/users', async (req) =>
      adminUsersPageSchema.parse(await queries.listUsers(listUsersQuerySchema.parse(req.query))),
    );

    admin.get('/admin/users/:id', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      return adminUserDetailResponseSchema.parse(await queries.userDetail(id));
    });

    admin.post('/admin/users/:id/grants', async (req, reply) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = grantRequestSchema.parse(req.body);
      const subscription = await decisions.grant(authOf(req).user, id, body);
      return reply.code(201).send(adminSubscriptionResponseSchema.parse({ subscription }));
    });

    admin.get('/admin/audit', async (req) =>
      auditPageSchema.parse(await queries.listAudit(listAuditQuerySchema.parse(req.query))),
    );

    admin.get('/admin/payments.csv', async (req, reply) => {
      const range = exportPaymentsQuerySchema.parse(req.query);
      const { csv, filename } = await queries.exportPayments(authOf(req).user, range);
      return reply
        .type('text/csv; charset=utf-8')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(csv);
    });
  });
}
