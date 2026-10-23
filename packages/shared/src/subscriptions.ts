import { z } from 'zod';

// /v1/plans and /v1/subscriptions (SPEC D). Portal only: the mobile apps never call these.

export const PENDING_PAYMENT_TTL_DAYS = 7;
export const REMINDER_DAYS_BEFORE_END = 14;

export const subscriptionStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAYMENT_SUBMITTED',
  'ACTIVE',
  'EXPIRED',
  'REJECTED',
  'CANCELLED',
  'REVOKED',
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  durationDays: z.number().int().positive(),
  priceMnt: z.number().int().nonnegative(),
});
export type PlanDto = z.infer<typeof planSchema>;
export const plansResponseSchema = z.object({ plans: z.array(planSchema) });

export const subscriptionSchema = z.object({
  id: z.string(),
  status: subscriptionStatusSchema,
  /** ONG-XXXXX: the transfer description. */
  referenceCode: z.string(),
  amountMnt: z.number().int().nonnegative(),
  plan: planSchema.pick({ id: true, name: true, durationDays: true }),
  payerNote: z.string().nullable(),
  transferAt: z.iso.datetime().nullable(),
  hasReceipt: z.boolean(),
  submittedAt: z.iso.datetime().nullable(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  rejectReason: z.string().nullable(),
  /** WIRE = QPay through Wire, MOCK = development checkout, NONE = an old bank-transfer request. */
  paymentProvider: z.enum(['WIRE', 'MOCK', 'NONE']),
  /** Where to pay; only while the request is PENDING_PAYMENT. */
  checkoutUrl: z.string().nullable(),
  createdAt: z.iso.datetime(),
});
export type SubscriptionDto = z.infer<typeof subscriptionSchema>;

export const createSubscriptionRequestSchema = z.object({ planId: z.string().min(1).max(64) });
export const createSubscriptionResponseSchema = z.object({ subscription: subscriptionSchema });

export const currentSubscriptionResponseSchema = z.object({
  /** The open request if there is one, else the latest subscription, else null. */
  subscription: subscriptionSchema.nullable(),
  accessUntil: z.iso.datetime().nullable(),
});

export const subscriptionParamsSchema = z.object({ id: z.string().min(1).max(64) });

/** POST /v1/subscriptions/:id/mock (development only): the mock checkout's two buttons. */
export const mockPaymentRequestSchema = z.object({ outcome: z.enum(['success', 'cancel']) });
