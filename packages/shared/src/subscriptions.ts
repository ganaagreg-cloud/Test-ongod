import { z } from 'zod';

// /v1/plans and /v1/subscriptions (SPEC D). Portal only: the mobile apps never call these.

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
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

/** Where to send the money; shown in the portal only, with the amount and the reference code. */
export const bankDetailsSchema = z.object({
  bankName: z.string(),
  accountNumber: z.string(),
  accountHolder: z.string(),
});
export type BankDetails = z.infer<typeof bankDetailsSchema>;

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
  createdAt: z.iso.datetime(),
});
export type SubscriptionDto = z.infer<typeof subscriptionSchema>;

export const createSubscriptionRequestSchema = z.object({ planId: z.string().min(1).max(64) });
export const createSubscriptionResponseSchema = z.object({
  subscription: subscriptionSchema,
  bank: bankDetailsSchema,
});

export const currentSubscriptionResponseSchema = z.object({
  /** The open request if there is one, else the latest subscription, else null. */
  subscription: subscriptionSchema.nullable(),
  accessUntil: z.iso.datetime().nullable(),
  /** Only while the request is PENDING_PAYMENT (the user still has to pay). */
  bank: bankDetailsSchema.nullable(),
});

export const subscriptionParamsSchema = z.object({ id: z.string().min(1).max(64) });

const emptyToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

/** The text fields of POST /v1/subscriptions/:id/submitted (multipart; the file is `receipt`). */
export const submitPaymentFieldsSchema = z.object({
  payerNote: z.preprocess(emptyToUndefined, z.string().trim().max(1000).optional()),
  transferAt: z.iso.datetime({ offset: true }),
});
