import {
  PENDING_PAYMENT_TTL_DAYS,
  type BankDetails,
  type PlanDto,
  type SubscriptionDto,
} from '@ongod/shared';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db } from '../db';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { DAY_MS } from '../lib/dates';
import { bankDetails, toSubscriptionDto } from './dto';
import { generateReferenceCode } from './period';
import type { ReceiptStore, ReceiptType } from './receipts';

const OPEN_STATUSES = ['PENDING_PAYMENT', 'PAYMENT_SUBMITTED'] as const;
const CODE_RETRIES = 5;
/** A transfer time slightly in the future is a clock difference, not a lie. */
const CLOCK_SKEW_MS = 60 * 60_000;

export interface SubmitInput {
  payerNote?: string | undefined;
  transferAt: string;
  receipt?: { data: Buffer; type: ReceiptType } | undefined;
}

/** Portal side of SPEC D: plans, apply, status, "Төлсөн". */
export function createSubscriptionService(deps: {
  db: Db;
  env: Env;
  receipts: ReceiptStore;
  now?: (() => Date) | undefined;
}) {
  const { db, env, receipts } = deps;
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

    /** SPEC D: verified email only, one open request per user. */
    async create(
      user: User,
      planId: string,
    ): Promise<{ subscription: SubscriptionDto; bank: BankDetails }> {
      if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED');
      const bank = bankDetails(env);
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
            });
            if (open) {
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
                createdAt: at,
              },
              include: { plan: true },
            });
          });
          return { subscription: toSubscriptionDto(subscription), bank };
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
      const sub =
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
      return {
        subscription: sub ? toSubscriptionDto(sub) : null,
        accessUntil: user.accessUntil?.toISOString() ?? null,
        bank: sub?.status === 'PENDING_PAYMENT' ? bankDetails(env) : null,
      };
    },

    /** "Төлсөн": PENDING_PAYMENT -> PAYMENT_SUBMITTED, once. */
    async submitted(user: User, id: string, input: SubmitInput): Promise<SubscriptionDto> {
      const at = now();
      const transferAt = new Date(input.transferAt);
      if (transferAt.getTime() > at.getTime() + CLOCK_SKEW_MS) {
        throw new AppError(400, 'VALIDATION_ERROR');
      }

      const found = await db.subscription.findFirst({ where: { id, userId: user.id } });
      if (!found) throw new AppError(404, 'NOT_FOUND');
      if (found.status !== 'PENDING_PAYMENT') throw new AppError(409, 'SUBSCRIPTION_STATE');
      if (found.createdAt < pendingCutoff(at)) throw new AppError(409, 'SUBSCRIPTION_EXPIRED');

      const key = input.receipt
        ? await receipts.save(input.receipt.data, input.receipt.type.ext)
        : null;
      try {
        // Status precondition: a double tap or two tabs submit only once.
        const updated = await db.subscription.updateMany({
          where: {
            id,
            userId: user.id,
            status: 'PENDING_PAYMENT',
            createdAt: { gte: pendingCutoff(at) },
          },
          data: {
            status: 'PAYMENT_SUBMITTED',
            payerNote: input.payerNote ?? null,
            transferAt,
            proofImagePath: key,
            submittedAt: at,
          },
        });
        if (updated.count !== 1) throw new AppError(409, 'SUBSCRIPTION_STATE');
      } catch (err) {
        if (key) await receipts.remove(key).catch(() => undefined);
        throw err;
      }

      const fresh = await db.subscription.findUniqueOrThrow({
        where: { id },
        include: { plan: true },
      });
      return toSubscriptionDto(fresh);
    },
  };
}

export type SubscriptionService = ReturnType<typeof createSubscriptionService>;
