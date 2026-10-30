import type { AdminSubscriptionDto } from '@ongod/shared';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { toAdminSubscriptionDto } from '../subscriptions/dto';
import { latestActiveEnd, refreshAccessUntil } from '../subscriptions/access';
import { computePeriod, generateReferenceCode } from '../subscriptions/period';
import { audit } from './audit';

const CODE_RETRIES = 5;
const include = { plan: true, user: true, decidedBy: true } as const;

/**
 * SPEC E, manual grant and revoke only (ADR-0046). Every change that grants or removes access
 * (CLAUDE.md): one transaction, the user row locked first (ADR-0018 #6), a status precondition
 * in the UPDATE where a row changes state, and the audit entry in the same commit. The first
 * statement of each transaction is the lock, so the reads after it see everything the previous
 * holder committed.
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
      input: {
        planId: string;
        days?: number | undefined;
        note?: string | undefined;
        requestId: string;
      },
    ): Promise<AdminSubscriptionDto> {
      // The same request again (a lost response, a double submit): the first grant, unchanged.
      const earlier = async () => {
        const found = await db.subscription.findUnique({
          where: { grantKey: input.requestId },
          select: { id: true, userId: true },
        });
        if (found && found.userId !== userId) throw new AppError(400, 'BAD_REQUEST');
        return found;
      };
      const seen = await earlier();
      if (seen) return view(seen.id);

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
                grantKey: input.requestId,
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
          if (isUniqueViolation(err)) {
            // The same request handled in parallel won the race: answer with its grant.
            const raced = await earlier();
            if (raced) return view(raced.id);
            if (attempt < CODE_RETRIES) continue; // a reference code clash
          }
          throw err;
        }
      }
    },
  };
}

export type DecisionService = ReturnType<typeof createDecisionService>;
