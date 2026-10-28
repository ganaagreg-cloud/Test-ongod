import type { FastifyInstance } from 'fastify';
import {
  adminCommentsPageSchema,
  listAdminCommentsQuerySchema,
  muteUserResponseSchema,
  adminGiftResponseSchema,
  adminGiftsPageSchema,
  listGiftsQuerySchema,
  voidGiftRequestSchema,
  adminIdParamsSchema,
  adminPlanResponseSchema,
  adminPlansResponseSchema,
  createPlanRequestSchema,
  updatePlanRequestSchema,
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
  revokeRequestSchema,
} from '@ongod/shared';
import type { AdminQueries } from '../admin/queries';
import type { DecisionService } from '../admin/decisions';
import type { AdminGuards } from '../admin/guard';
import type { PlanService } from '../admin/plans';
import type { CommentService } from '../comments/service';
import type { GiftService } from '../gifts/service';
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
    plans: PlanService;
    gifts: GiftService;
    comments: CommentService;
  },
) {
  const { guards, decisions, queries, plans, gifts, comments } = opts;
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

    admin.post('/admin/subscriptions/:id/revoke', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = revokeRequestSchema.parse(req.body);
      const subscription = await decisions.revoke(authOf(req).user, id, body);
      return adminSubscriptionResponseSchema.parse({ subscription });
    });

    // ---- comments (SPEC L, ADR-0061) ----
    admin.get('/admin/comments', async (req) =>
      adminCommentsPageSchema.parse(
        await comments.adminList(listAdminCommentsQuerySchema.parse(req.query)),
      ),
    );

    for (const action of ['hide', 'restore', 'dismiss', 'delete'] as const) {
      admin.post(`/admin/comments/:id/${action}`, async (req, reply) => {
        const { id } = adminIdParamsSchema.parse(req.params);
        await comments.adminAct(authOf(req).user, id, action);
        return reply.code(204).send();
      });
    }

    admin.post('/admin/users/:id/comment-mute', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      return muteUserResponseSchema.parse({
        muted: await comments.adminMute(authOf(req).user, id, true),
      });
    });

    admin.delete('/admin/users/:id/comment-mute', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      return muteUserResponseSchema.parse({
        muted: await comments.adminMute(authOf(req).user, id, false),
      });
    });

    // ---- gifts (SPEC J, ADR-0060) ----
    admin.get('/admin/gifts', async (req) =>
      adminGiftsPageSchema.parse(await gifts.adminList(listGiftsQuerySchema.parse(req.query))),
    );

    admin.post('/admin/gifts/:id/void', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = voidGiftRequestSchema.parse(req.body);
      return adminGiftResponseSchema.parse({
        gift: await gifts.adminVoid(authOf(req).user, id, body.reason),
      });
    });

    // ---- plans (SPEC K, ADR-0059) ----
    admin.get('/admin/plans', async () =>
      adminPlansResponseSchema.parse({ plans: await plans.list() }),
    );

    admin.post('/admin/plans', async (req, reply) => {
      const body = createPlanRequestSchema.parse(req.body);
      const plan = await plans.create(authOf(req).user, body);
      return reply.code(201).send(adminPlanResponseSchema.parse({ plan }));
    });

    admin.patch('/admin/plans/:id', async (req) => {
      const { id } = adminIdParamsSchema.parse(req.params);
      const body = updatePlanRequestSchema.parse(req.body);
      return adminPlanResponseSchema.parse({
        plan: await plans.update(authOf(req).user, id, body),
      });
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
