import { z } from 'zod';
import { giftStatusSchema } from './gifts';
import { subscriptionSchema, subscriptionStatusSchema } from './subscriptions';

// /v1/admin/* (SPEC E). Roles ADMIN and OWNER, password login only (ADR-0040).

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const idSchema = z.string().min(1).max(64);
const reasonSchema = z.string().trim().min(1).max(500);

export const adminIdParamsSchema = z.object({ id: idSchema });

// ---- Subscriptions (the payments list) ----

export const PAGE_SIZE_DEFAULT = 25;
export const PAGE_SIZE_MAX = 100;

const pageQuery = {
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(PAGE_SIZE_MAX).default(PAGE_SIZE_DEFAULT),
};
const searchQuery = z.preprocess(emptyToUndefined, z.string().trim().min(1).max(100).optional());

export const adminUserSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
});

export const adminSubscriptionSchema = subscriptionSchema.extend({
  user: adminUserSummarySchema,
  decidedBy: z.object({ id: z.string(), username: z.string() }).nullable(),
  decidedAt: z.iso.datetime().nullable(),
});
export type AdminSubscriptionDto = z.infer<typeof adminSubscriptionSchema>;

/**
 * The states the admin payments list filters by. PAYMENT_SUBMITTED and REJECTED belonged to the
 * removed bank-transfer path (ADR-0046): old rows still parse, but nothing creates them.
 */
export const adminStatusFilterSchema = subscriptionStatusSchema.exclude([
  'PAYMENT_SUBMITTED',
  'REJECTED',
]);
export type AdminStatusFilter = z.infer<typeof adminStatusFilterSchema>;

export const listSubscriptionsQuerySchema = z.object({
  /** Default: ACTIVE. Newest first. */
  status: adminStatusFilterSchema.default('ACTIVE'),
  /** Reference code, username, email, phone or name. */
  q: searchQuery,
  ...pageQuery,
});
export type ListSubscriptionsQuery = z.infer<typeof listSubscriptionsQuerySchema>;
export const adminSubscriptionsPageSchema = z.object({
  items: z.array(adminSubscriptionSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const adminSubscriptionResponseSchema = z.object({ subscription: adminSubscriptionSchema });

export const revokeRequestSchema = z.object({
  reason: reasonSchema,
  /** Mark the payments of this subscription REFUNDED (default: false, e.g. fraud). */
  refund: z.boolean().default(false),
});
export const grantRequestSchema = z.object({
  planId: idSchema,
  /** Overrides the plan's duration (gift, demo account). */
  days: z.number().int().min(1).max(3660).optional(),
  note: z.string().trim().max(500).optional(),
  /**
   * One key per grant the admin means to make: a retried request with the same key returns the
   * first grant instead of adding another period (audit F02).
   */
  requestId: z.uuid().optional(),
});

// ---- Plans (SPEC K, ADR-0059) ----

export const PLAN_PRICE_MIN_MNT = 100;
export const PLAN_PRICE_MAX_MNT = 100_000_000;

export const adminPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationDays: z.number().int().positive(),
  priceMnt: z.number().int().nonnegative(),
  active: z.boolean(),
  /** Every subscription on the plan, open or closed. The days are fixed once this is above 0. */
  subscriptionCount: z.number().int().nonnegative(),
});
export type AdminPlanDto = z.infer<typeof adminPlanSchema>;
export const adminPlansResponseSchema = z.object({ plans: z.array(adminPlanSchema) });
export const adminPlanResponseSchema = z.object({ plan: adminPlanSchema });

const planFields = {
  name: z.string().trim().min(2).max(60),
  durationDays: z.number().int().min(1).max(3660),
  priceMnt: z.number().int().min(PLAN_PRICE_MIN_MNT).max(PLAN_PRICE_MAX_MNT),
  active: z.boolean(),
};
export const createPlanRequestSchema = z.object({
  ...planFields,
  active: planFields.active.default(true),
});
export type CreatePlanRequest = z.input<typeof createPlanRequestSchema>;
export const updatePlanRequestSchema = z
  .object(planFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' });
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

// ---- Users ----

export const listUsersQuerySchema = z.object({ q: searchQuery, ...pageQuery });

export const adminUserSchema = adminUserSummarySchema.extend({
  status: z.enum(['PENDING_PROFILE', 'ACTIVE', 'DISABLED', 'DELETED']),
  role: z.enum(['USER', 'ADMIN', 'OWNER']),
  emailVerified: z.boolean(),
  accessUntil: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const adminUsersPageSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const auditEntrySchema = z.object({
  id: z.string(),
  actor: z.object({ id: z.string(), username: z.string() }),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  data: z.unknown(),
  createdAt: z.iso.datetime(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

export const historyResponseSchema = z.object({ items: z.array(auditEntrySchema) });

export const adminUserDetailResponseSchema = z.object({
  user: adminUserSchema,
  devices: z.array(
    z.object({
      id: z.string(),
      platform: z.string(),
      model: z.string().nullable(),
      lastSeenAt: z.iso.datetime(),
    }),
  ),
  subscriptions: z.array(subscriptionSchema),
  audit: z.array(auditEntrySchema),
});

// ---- Dashboard, audit, export ----

const dashboardMemberSchema = z.object({
  id: idSchema,
  username: z.string(),
  firstName: z.string(),
  lastName: z.string(),
});

/** GET /v1/admin/dashboard (ADR-0056). Months are Ulaanbaatar calendar months. */
export const dashboardResponseSchema = z.object({
  /** Users whose access has not ended. */
  activeUsers: z.number().int(),
  pendingPayment: z.number().int(),
  /** Users whose access ends within 30 days. */
  expiringIn30Days: z.number().int(),
  /** Registered in the last 7 days. */
  newUsersThisWeek: z.number().int(),
  /** COMPLETED payments that carry money (no manual grants, no refunds). */
  revenue: z.object({
    thisMonthMnt: z.number().int(),
    lastMonthMnt: z.number().int(),
    paymentsThisMonth: z.number().int(),
  }),
  recentPayments: z.array(
    z.object({
      id: idSchema,
      subscriptionId: idSchema,
      referenceCode: z.string(),
      amountMnt: z.number().int(),
      method: z.enum(['QPAY', 'BANK_TRANSFER']),
      createdAt: z.iso.datetime(),
      user: dashboardMemberSchema,
    }),
  ),
  upcoming: z.array(z.object({ id: idSchema, title: z.string(), scheduledFor: z.iso.datetime() })),
  mediaProblems: z.object({
    failed: z.number().int(),
    stuck: z.number().int(),
    items: z.array(
      z.object({
        episodeId: idSchema,
        title: z.string(),
        status: z.enum(['FAILED', 'UPLOADING']),
        failReason: z.string().nullable(),
        updatedAt: z.iso.datetime(),
      }),
    ),
  }),
  expiringSoon: z.array(dashboardMemberSchema.extend({ accessUntil: z.iso.datetime() })),
});
export type DashboardDto = z.infer<typeof dashboardResponseSchema>;

export const listAuditQuerySchema = z.object({
  actorId: z.preprocess(emptyToUndefined, idSchema.optional()),
  action: z.preprocess(emptyToUndefined, z.string().trim().max(64).optional()),
  targetType: z.preprocess(emptyToUndefined, z.string().trim().max(64).optional()),
  ...pageQuery,
});
export const auditPageSchema = z.object({
  items: z.array(auditEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const exportPaymentsQuerySchema = z.object({
  /** Inclusive dates, YYYY-MM-DD (Ulaanbaatar time). Default: everything. */
  from: z.preprocess(emptyToUndefined, z.iso.date().optional()),
  to: z.preprocess(emptyToUndefined, z.iso.date().optional()),
});

// ---- Gifts (SPEC J, ADR-0060) ----

export const adminGiftSchema = z.object({
  id: z.string(),
  status: giftStatusSchema,
  plan: z.object({ id: z.string(), name: z.string() }),
  amountMnt: z.number().int().nonnegative(),
  durationDays: z.number().int().positive(),
  code: z.string().nullable(),
  buyer: adminUserSummarySchema,
  redeemedBy: adminUserSummarySchema.nullable(),
  paidAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  redeemedAt: z.iso.datetime().nullable(),
  voidReason: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type AdminGiftDto = z.infer<typeof adminGiftSchema>;
export const adminGiftResponseSchema = z.object({ gift: adminGiftSchema });

export const listGiftsQuerySchema = z.object({
  /** Default: PAID, the gifts waiting to be redeemed. */
  status: giftStatusSchema.default('PAID'),
  /** Code, buyer or recipient: username, email, phone or name. */
  q: searchQuery,
  ...pageQuery,
});
export type ListGiftsQuery = z.infer<typeof listGiftsQuerySchema>;
export const adminGiftsPageSchema = z.object({
  items: z.array(adminGiftSchema),
  total: z.number().int(),
  /** The money behind the PAID gifts that nobody has redeemed yet. */
  unredeemedMnt: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
});

export const voidGiftRequestSchema = z.object({ reason: reasonSchema });
