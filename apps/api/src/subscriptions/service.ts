import { PENDING_PAYMENT_TTL_DAYS, type PlanDto, type SubscriptionDto } from '@ongod/shared';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { DAY_MS } from '../lib/dates';
import type { PaymentService } from '../payments/service';
import { toSubscriptionDto } from './dto';
import { generateReferenceCode } from './period';

/** The only open state: QPay requests are paid at the checkout (ADR-0041, ADR-0046). */
const OPEN_STATUSES = ['PENDING_PAYMENT'] as const;
const CODE_RETRIES = 5;

/** Portal side of SPEC D: plans, apply (QPay checkout), status. */
export function createSubscriptionService(deps: {
  db: Db;
  payments: PaymentService;
  now?: (() => Date) | undefined;
}) {
  const { db, payments } = deps;
  const now = deps.now ?? (() => new Date());
  const pendingCutoff = (at: Date) => new Date(at.getTime() - PENDING_PAYMENT_TTL_DAYS * DAY_MS);

  return {
    async listPlans(): Promise<PlanDto[]> {
      const plans = await db.plan.findMany({
        where: { active: true },
        orderBy: { priceMnt: 'asc' },
      });
      return plans.map((p) => ({
        id: p.id,
        name: p.name,
        durationDays: p.durationDays,
        priceMnt: p.priceMnt,
      }));
    },

    /**
     * SPEC D: verified email only, one open request per user. Gives the request its QPay checkout
     * (ADR-0041); asking again for the same plan returns the same request and checkout.
     */
    async create(user: User, planId: string): Promise<{ subscription: SubscriptionDto }> {
      if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED');
      payments.mode(); // 503 now, before a request row exists, if no payment method is configured
      const plan = await db.plan.findFirst({ where: { id: planId, active: true } });
      if (!plan) throw new AppError(404, 'NOT_FOUND');

      for (let attempt = 1; ; attempt++) {
        try {
          const subscription = await db.$transaction(async (tx) => {
            // First statement: serialises concurrent requests of this user (ADR-0018 #6).
            await lockUser(tx, user.id);
            const at = now();
            // A stale PENDING_PAYMENT is as good as expired even if the cron has not run yet.
            await tx.subscription.updateMany({
              where: {
                userId: user.id,
                status: 'PENDING_PAYMENT',
                createdAt: { lt: pendingCutoff(at) },
              },
              data: { status: 'EXPIRED' },
            });
            const open = await tx.subscription.findFirst({
              where: { userId: user.id, status: { in: [...OPEN_STATUSES] } },
              include: { plan: true },
            });
            if (open) {
              // A payment may already be running on it, so only the same unpaid request is reused.
              if (
                open.status === 'PENDING_PAYMENT' &&
                open.paymentProvider !== 'NONE' &&
                open.planId === plan.id
              ) {
                return open;
              }
              throw new AppError(409, 'OPEN_SUBSCRIPTION_EXISTS', undefined, {
                subscriptionId: open.id,
              });
            }
            return tx.subscription.create({
              data: {
                userId: user.id,
                planId: plan.id,
                referenceCode: generateReferenceCode(),
                amountMnt: plan.priceMnt,
                // Set now, so a failed Wire call leaves a request the retry can pick up again.
                paymentProvider: payments.mode(),
                createdAt: at,
              },
              include: { plan: true },
            });
          });
          // The Wire call is outside the transaction: it is slow and the member is waiting for it.
          const ready = await payments.startCheckout(subscription);
          return { subscription: toSubscriptionDto(ready) };
        } catch (err) {
          // Two users drew the same code: draw again.
          if (isUniqueViolation(err) && attempt < CODE_RETRIES) continue;
          throw err;
        }
      }
    },

    /** The open request, else the latest subscription, plus the access end. */
    async current(user: User) {
      const include = { plan: true } as const;
      const find = async () =>
        (await db.subscription.findFirst({
          where: { userId: user.id, status: { in: [...OPEN_STATUSES] } },
          orderBy: { createdAt: 'desc' },
          include,
        })) ??
        (await db.subscription.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          include,
        }));
      let sub = await find();
      let accessUntil = user.accessUntil;
      if (sub?.status === 'PENDING_PAYMENT' && sub.paymentProvider === 'WIRE') {
        // Ask Wire, so a paid request turns ACTIVE even before the webhook arrives.
        await payments.sync(sub);
        sub = await find();
        if (sub?.status === 'ACTIVE') {
          const fresh = await db.user.findUnique({
            where: { id: user.id },
            select: { accessUntil: true },
          });
          accessUntil = fresh?.accessUntil ?? null;
        }
      }
      return {
        subscription: sub ? toSubscriptionDto(sub) : null,
        accessUntil: accessUntil?.toISOString() ?? null,
      };
    },
  };
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;
