import { z } from 'zod';
import { subscriptionSchema, subscriptionStatusSchema } from './subscriptions';

// /v1/admin/* (SPEC E). Roles ADMIN and OWNER, with TOTP 2FA.

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const idSchema = z.string().min(1).max(64);
const reasonSchema = z.string().trim().min(1).max(500);

export const adminIdParamsSchema = z.object({ id: idSchema });

// ---- TOTP ----

export const totpSetupResponseSchema = z.object({
  /** Base32 secret, for manual entry. */
  secret: z.string(),
  /** otpauth:// URI for the QR code. */
  otpauthUri: z.string(),
});
export const totpVerifyRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export const totpStatusResponseSchema = z.object({ enabled: z.boolean(), verified: z.boolean() });

// ---- Queue and subscriptions ----

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

export const listSubscriptionsQuerySchema = z.object({
  /** Default: the queue (PAYMENT_SUBMITTED). */
  status: subscriptionStatusSchema.default('PAYMENT_SUBMITTED'),
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

export const rejectRequestSchema = z.object({ reason: reasonSchema });
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
});

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

export const dashboardResponseSchema = z.object({
  /** Users whose access has not ended. */
  activeUsers: z.number().int(),
  pendingPayment: z.number().int(),
  paymentSubmitted: z.number().int(),
  /** Users whose access ends within 30 days. */
  expiringIn30Days: z.number().int(),
  /** Registered in the last 7 days. */
  newUsersThisWeek: z.number().int(),
});

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
