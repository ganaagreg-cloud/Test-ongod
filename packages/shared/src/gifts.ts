import { z } from 'zod';
import { planSchema, subscriptionSchema } from './subscriptions';

// /v1/gifts (SPEC J, ADR-0060). Portal only: the mobile apps never call these.

/** A paid gift can be redeemed for this long after payment (ASSUMPTION for open question #29). */
export const GIFT_VALID_DAYS = 365;
/** Unpaid gifts a member can have at once. */
export const GIFT_MAX_UNPAID = 5;

export const giftStatusSchema = z.enum([
  'PENDING_PAYMENT',
  'PAID',
  'REDEEMED',
  'CANCELLED',
  'EXPIRED',
  'VOID',
]);
export type GiftStatus = z.infer<typeof giftStatusSchema>;

/** The code as people type it: letters and digits only, upper case ("abcd-efgh ijkl" works). */
export const normalizeGiftCode = (raw: string) => raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
/** "ABCD-EFGH-JKMN" from 12 letters and digits. */
export const formatGiftCode = (normalized: string) => normalized.replace(/(.{4})(?=.)/g, '$1-');

export const giftSchema = z.object({
  id: z.string(),
  status: giftStatusSchema,
  plan: planSchema.pick({ id: true, name: true }),
  amountMnt: z.number().int().nonnegative(),
  durationDays: z.number().int().positive(),
  /** Only while the gift is PAID: the buyer reads it here and passes it on. */
  code: z.string().nullable(),
  /** Where to pay; only while PENDING_PAYMENT. */
  checkoutUrl: z.string().nullable(),
  paidAt: z.iso.datetime().nullable(),
  expiresAt: z.iso.datetime().nullable(),
  redeemedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type GiftDto = z.infer<typeof giftSchema>;

export const createGiftRequestSchema = z.object({ planId: z.string().min(1).max(64) });
export const giftResponseSchema = z.object({ gift: giftSchema });
export const giftsResponseSchema = z.object({ gifts: z.array(giftSchema) });
export const giftParamsSchema = z.object({ id: z.string().min(1).max(64) });

export const redeemGiftRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .max(40)
    .transform(normalizeGiftCode)
    .refine((c) => c.length === 12, { message: 'Invalid code' }),
});
export const redeemGiftResponseSchema = z.object({
  subscription: subscriptionSchema,
  accessUntil: z.iso.datetime().nullable(),
});
