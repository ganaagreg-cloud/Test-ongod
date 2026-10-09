import type { AdminSubscriptionDto } from '@ongod/shared';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db, Prisma } from '../db';
import { enqueueEmail } from '../email';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { ubDate } from '../lib/dates';
import { mn } from '../i18n/mn';
import { enqueuePush } from '../push';
import { toAdminSubscriptionDto } from '../subscriptions/dto';
import { computePeriod, generateReferenceCode } from '../subscriptions/period';
import { audit } from './audit';

type Tx = Prisma.TransactionClient;

const CODE_RETRIES = 5;
const include = { plan: true, user: true, decidedBy: true } as const;

/** The end of the latest ACTIVE period: the single source the `User.accessUntil` cache is rebuilt from. */
async function latestActiveEnd(tx: Tx, userId: string): Promise<Date | null> {
  const agg = await tx.subscription.aggregate({
    where: { userId, status: 'ACTIVE' },
    _max: { endsAt: true },
  });
  return agg._max.endsAt;
}

async function refreshAccessUntil(tx: Tx, userId: string): Promise<Date | null> {
  const accessUntil = await latestActiveEnd(tx, userId);
  await tx.user.update({ where: { id: userId }, data: { accessUntil } });
  return accessUntil;
}

/**
 * Every change that grants or removes access (CLAUDE.md): one transaction, the user row locked
 * first (ADR-0018 #6), a status precondition in the UPDATE, the audit entry and the email/push
 * jobs in the same commit. The first statement of each transaction is the lock, so the reads
 * after it see everything the previous holder committed.
 */
export function createDecisionService(deps: { db: Db; now?: (() => Date) | undefined }) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());

  /** The owner of a subscription, found before the transaction so the lock can be its first statement. */
  async function ownerOf(id: string): Promise<string> {
    const found = await db.subscription.findUnique({ where: { id }, select: { userId: true } });
    if (!found) throw new AppError(404, 'NOT_FOUND');
    return found.userId;
  }

  const view = async (id: string): Promise<AdminSubscriptionDto> =>
    toAdminSubscriptionDto(await db.subscription.findUniqueOrThrow({ where: { id }, include }));

  return {
    /** SPEC E. Double approval is impossible: the second call finds the status already ACTIVE. */
    async approve(actor: User, id: string): Promise<AdminSubscriptionDto> {
      const userId = await ownerOf(id);
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const sub = await tx.subscription.findUnique({
          where: { id },
          include: { plan: true, user: true },
        });
        if (!sub || sub.status !== 'PAYMENT_SUBMITTED')
          throw new AppError(409, 'SUBSCRIPTION_STATE');
        if (sub.user.status === 'DELETED') throw new AppError(409, 'SUBSCRIPTION_STATE');

        const at = now();
        const { startsAt, endsAt } = computePeriod(
          at,
          await latestActiveEnd(tx, userId),
          sub.plan.durationDays,
        );
        const decided = await tx.subscription.updateMany({
          where: { id, status: 'PAYMENT_SUBMITTED' },
          data: { status: 'ACTIVE', startsAt, endsAt, decidedById: actor.id, decidedAt: at },
        });
        if (decided.count !== 1) throw new AppError(409, 'SUBSCRIPTION_STATE');

        await tx.payment.create({
          data: { subscriptionId: id, method: 'BANK_TRANSFER', amountMnt: sub.amountMnt },
        });
        await refreshAccessUntil(tx, userId);
        await audit(tx, actor.id, 'subscription.approve', 'Subscription', id, {
          userId,
          referenceCode: sub.referenceCode,
          amountMnt: sub.amountMnt,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        });
        const until = ubDate(endsAt);
        await enqueueEmail(tx, sub.user.email, 'paymentApproved', {
          firstName: sub.user.firstName,
          endsAt: until,
        });
        await enqueuePush(tx, {
          userId,
          title: mn.push.paymentApproved.title,
          body: mn.push.paymentApproved.body({ endsAt: until }),
          data: { type: 'access_granted' },
        });
      });
      return view(id);
    },

    async reject(actor: User, id: string, reason: string): Promise<AdminSubscriptionDto> {
      const userId = await ownerOf(id);
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const sub = await tx.subscription.findUnique({ where: { id }, include: { user: true } });
        if (!sub) throw new AppError(404, 'NOT_FOUND');
        const decided = await tx.subscription.updateMany({
          where: { id, status: 'PAYMENT_SUBMITTED' },
          data: {
            status: 'REJECTED',
            rejectReason: reason,
            decidedById: actor.id,
            decidedAt: now(),
          },
        });
        if (decided.count !== 1) throw new AppError(409, 'SUBSCRIPTION_STATE');

        await audit(tx, actor.id, 'subscription.reject', 'Subscription', id, {
          userId,
          referenceCode: sub.referenceCode,
          reason,
        });
        await enqueueEmail(tx, sub.user.email, 'paymentRejected', {
          firstName: sub.user.firstName,
          reason,
        });
      });
      return view(id);
    },

    /** Refund or fraud: ends an ACTIVE subscription now and rebuilds the access cache. */
    async revoke(
      actor: User,
      id: string,
      input: { reason: string; refund: boolean },
    ): Promise<AdminSubscriptionDto> {
      const userId = await ownerOf(id);
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const sub = await tx.subscription.findUnique({ where: { id } });
        if (!sub) throw new AppError(404, 'NOT_FOUND');
        const revoked = await tx.subscription.updateMany({
          where: { id, status: 'ACTIVE' },
          data: { status: 'REVOKED' },
        });
        if (revoked.count !== 1) throw new AppError(409, 'SUBSCRIPTION_STATE');

        if (input.refund) {
          await tx.payment.updateMany({
            where: { subscriptionId: id, status: 'COMPLETED' },
            data: { status: 'REFUNDED' },
          });
        }
        const accessUntil = await refreshAccessUntil(tx, userId);
        await audit(tx, actor.id, 'subscription.revoke', 'Subscription', id, {
          userId,
          referenceCode: sub.referenceCode,
          reason: input.reason,
          refund: input.refund,
          accessUntil: accessUntil?.toISOString() ?? null,
        });
      });
      return view(id);
    },

    /** A gift or a store-reviewer demo account: an ACTIVE subscription without a transfer. */
    async grant(
      actor: User,
      userId: string,
      input: { planId: string; days?: number | undefined; note?: string | undefined },
    ): Promise<AdminSubscriptionDto> {
      const target = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!target || target.status === 'DELETED') throw new AppError(404, 'NOT_FOUND');
      const plan = await db.plan.findUnique({ where: { id: input.planId } });
      if (!plan) throw new AppError(404, 'NOT_FOUND');

      for (let attempt = 1; ; attempt++) {
        try {
          const id = await db.$transaction(async (tx) => {
            await lockUser(tx, userId);
            const at = now();
            const days = input.days ?? plan.durationDays;
            const { startsAt, endsAt } = computePeriod(at, await latestActiveEnd(tx, userId), days);
            const sub = await tx.subscription.create({
              data: {
                userId,
                planId: plan.id,
                status: 'ACTIVE',
                referenceCode: generateReferenceCode(),
                amountMnt: 0,
                startsAt,
                endsAt,
                decidedById: actor.id,
                decidedAt: at,
                createdAt: at,
              },
            });
            await tx.payment.create({
              data: { subscriptionId: sub.id, method: 'MANUAL_GRANT', amountMnt: 0 },
            });
            await refreshAccessUntil(tx, userId);
            await audit(tx, actor.id, 'subscription.grant', 'Subscription', sub.id, {
              userId,
              planId: plan.id,
              days,
              note: input.note ?? null,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            });
            return sub.id;
          });
          return view(id);
        } catch (err) {
          if (isUniqueViolation(err) && attempt < CODE_RETRIES) continue;
          throw err;
        }
      }
    },
  };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
