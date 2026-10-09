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
  totpSetupResponseSchema,
  totpStatusResponseSchema,
  totpVerifyRequestSchema,
} from '@ongod/shared';
import type { AdminQueries } from '../admin/queries';
import type { DecisionService } from '../admin/decisions';
import type { AdminGuards } from '../admin/guard';
import type { TotpService } from '../admin/totp';
import { authOf } from '../auth/guard';
import type { AuthLimiter } from '../auth/rate-limit';

/**
 * /v1/admin/* (SPEC E). The TOTP routes need an ADMIN/OWNER session; everything else also needs
 * a session that passed the TOTP check. Admin responses are never cached.
 */
export async function adminRoutes(
  app: FastifyInstance,
  opts: {
    guards: AdminGuards;
    totp: TotpService;
    decisions: DecisionService;
    queries: AdminQueries;
    limiter: AuthLimiter;
  },
) {
  const { guards, totp, decisions, queries, limiter } = opts;
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'private, no-store');
  });

  // ---- 2FA: reachable before the session is verified ----
  await app.register(async (twoFactor) => {
    twoFactor.addHook('preHandler', guards.requireAdmin);

    twoFactor.get('/admin/totp', async (req) => {
      const { user, session } = authOf(req);
      return totpStatusResponseSchema.parse(totp.status(user, session));
    });

    twoFactor.post('/admin/totp/setup', async (req) => {
      const { user } = authOf(req);
      limiter.check(req, 'totp', user.id);
      return totpSetupResponseSchema.parse(await totp.setup(user));
    });

    twoFactor.post('/admin/totp/verify', async (req, reply) => {
      const { user, session } = authOf(req);
      const body = totpVerifyRequestSchema.parse(req.body);
      limiter.check(req, 'totp', user.id);
      await totp.verify(user, session, body.code);
      return reply.code(204).send();
    });
  });

  // ---- Everything else: ADMIN/OWNER with a TOTP-verified session ----
  await app.register(async (admin) => {
    admin.addHook('preHandler', guards.requireAdminTotp);

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

    admin.get('/admin/subscriptions/:id/receipt', async (req, reply) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const file = await queries.getReceipt(id);
      return reply
        .type(file.mime)
        .header('content-disposition', 'inline')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .send(file.data);
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
