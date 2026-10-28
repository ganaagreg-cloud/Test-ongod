import {
  GIFT_MAX_UNPAID,
  formatGiftCode,
  type AdminGiftDto,
  type GiftDto,
  type ListGiftsQuery,
} from '@ongod/shared';
import { audit } from '../admin/audit';
import { tokens, userMatches } from '../admin/queries';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db, Prisma } from '../db';
import { enqueueEmail } from '../email';
import { AppError } from '../errors';
import type { Gift, Plan, User } from '../generated/prisma/client';
import { mn } from '../i18n/mn';
import { escapeLike } from '../lib/like';
import { ubDate } from '../lib/dates';
import type { PaymentService } from '../payments/service';
import { enqueuePush } from '../push';
import { refreshAccessUntil, latestActiveEnd } from '../subscriptions/access';
import { toSubscriptionDto } from '../subscriptions/dto';
import { computePeriod, generateReferenceCode } from '../subscriptions/period';

type GiftRow = Gift & { plan: Plan };
const CODE_RETRIES = 5;

const iso = (d: Date | null) => d?.toISOString() ?? null;

/** What the buyer sees. The code is shown only while the gift waits to be redeemed. */
export const toGiftDto = (g: GiftRow): GiftDto => ({
  id: g.id,
  status: g.status,
  plan: { id: g.plan.id, name: g.plan.name },
  amountMnt: g.amountMnt,
  durationDays: g.durationDays,
  code: g.status === 'PAID' ? g.code : null,
  checkoutUrl: g.status === 'PENDING_PAYMENT' ? g.checkoutUrl : null,
  paidAt: iso(g.paidAt),
  expiresAt: iso(g.expiresAt),
  redeemedAt: iso(g.redeemedAt),
  createdAt: g.createdAt.toISOString(),
});

type UserSummary = Pick<User, 'id' | 'username' | 'email' | 'firstName' | 'lastName' | 'phone'>;
const summary = (u: UserSummary) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone,
});

const adminInclude = {
  plan: true,
  buyer: true,
  redeemedBy: true,
} as const;

/** Gift access (SPEC J, ADR-0060): buy for someone else, redeem a code, and the admin side. */
export function createGiftService(deps: {
  db: Db;
  payments: PaymentService;
  now?: (() => Date) | undefined;
}) {
  const { db, payments } = deps;
  const now = deps.now ?? (() => new Date());

  const toAdminDto = (g: GiftRow & { buyer: User; redeemedBy: User | null }): AdminGiftDto => ({
    id: g.id,
    status: g.status,
    plan: { id: g.plan.id, name: g.plan.name },
    amountMnt: g.amountMnt,
    durationDays: g.durationDays,
    code: g.code,
    buyer: summary(g.buyer),
    redeemedBy: g.redeemedBy ? summary(g.redeemedBy) : null,
    paidAt: iso(g.paidAt),
    expiresAt: iso(g.expiresAt),
    redeemedAt: iso(g.redeemedAt),
    voidReason: g.voidReason,
    createdAt: g.createdAt.toISOString(),
  });

  return {
    /**
     * Buying a gift: verified email only, like a subscription. The same unpaid gift for the same
     * plan is returned again (so a double click or a reload starts one checkout, not two).
     */
    async create(user: User, planId: string): Promise<GiftDto> {
      if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED');
      payments.mode(); // 503 now, before a gift row exists, if no payment method is configured
      const plan = await db.plan.findFirst({ where: { id: planId, active: true } });
      if (!plan) throw new AppError(404, 'NOT_FOUND');

      const gift = await db.$transaction(async (tx) => {
        // First statement: serialises this member's gift requests (ADR-0018 #6).
        await lockUser(tx, user.id);
        const at = now();
        // A stale unpaid gift is as good as expired even if the cron has not run yet.
        await tx.gift.updateMany({
          where: {
            buyerId: user.id,
            status: 'PENDING_PAYMENT',
            createdAt: { lt: new Date(at.getTime() - 7 * 86_400_000) },
          },
          data: { status: 'EXPIRED' },
        });
        const unpaid = await tx.gift.findMany({
          where: { buyerId: user.id, status: 'PENDING_PAYMENT' },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
        });
        const same = unpaid.find((g) => g.planId === plan.id);
        if (same) return same;
        if (unpaid.length >= GIFT_MAX_UNPAID) throw new AppError(409, 'GIFT_LIMIT');
        return tx.gift.create({
          data: {
            buyerId: user.id,
            planId: plan.id,
            amountMnt: plan.priceMnt,
            durationDays: plan.durationDays,
            // Set now, so a failed Wire call leaves a gift the retry can pick up again.
            paymentProvider: payments.mode(),
            createdAt: at,
          },
          include: { plan: true },
        });
      });
      // The Wire call is outside the transaction: it is slow and the member is waiting for it.
      return toGiftDto(await payments.startGiftCheckout(gift));
    },

    /** The buyer's own gifts, newest first. Asks Wire about waiting ones, so a paid gift shows at once. */
    async listMine(user: User): Promise<GiftDto[]> {
      const find = () =>
        db.gift.findMany({
          where: { buyerId: user.id },
          include: { plan: true },
          orderBy: { createdAt: 'desc' },
          take: 100,
        });
      let rows = await find();
      const waiting = rows.filter(
        (g) => g.status === 'PENDING_PAYMENT' && g.paymentProvider === 'WIRE',
      );
      if (waiting.length > 0) {
        await Promise.all(waiting.map((g) => payments.syncGift(g)));
        rows = await find();
      }
      return rows.map(toGiftDto);
    },

    /**
     * Redeeming a code (SPEC J). One transaction, the recipient locked first, and the status
     * precondition in the UPDATE (PAID -> REDEEMED) decides a race: a code works once. A wrong, used,
     * voided or expired code all give the same answer, so codes cannot be probed.
     */
    async redeem(user: User, normalizedCode: string) {
      if (!user.emailVerifiedAt) throw new AppError(403, 'EMAIL_NOT_VERIFIED');
      const code = formatGiftCode(normalizedCode);
      for (let attempt = 1; ; attempt++) {
        try {
          return await db.$transaction(async (tx) => {
            await lockUser(tx, user.id);
            const at = now();
            const gift = await tx.gift.findUnique({ where: { code }, include: { plan: true } });
            if (!gift || gift.status !== 'PAID' || !gift.expiresAt || gift.expiresAt <= at) {
              throw new AppError(404, 'GIFT_NOT_REDEEMABLE');
            }
            const claimed = await tx.gift.updateMany({
              where: { id: gift.id, status: 'PAID', expiresAt: { gt: at } },
              data: { status: 'REDEEMED', redeemedById: user.id, redeemedAt: at },
            });
            if (claimed.count !== 1) throw new AppError(404, 'GIFT_NOT_REDEEMABLE');

            const { startsAt, endsAt } = computePeriod(
              at,
              await latestActiveEnd(tx, user.id),
              gift.durationDays,
            );
            const subscription = await tx.subscription.create({
              data: {
                userId: user.id,
                planId: gift.planId,
                status: 'ACTIVE',
                referenceCode: generateReferenceCode(),
                amountMnt: gift.amountMnt,
                startsAt,
                endsAt,
                decidedAt: at,
                paymentProvider: 'NONE',
              },
              include: { plan: true },
            });
            await tx.gift.update({
              where: { id: gift.id },
              data: { subscriptionId: subscription.id },
            });
            await tx.payment.create({
              data: {
                subscriptionId: subscription.id,
                method: 'QPAY',
                amountMnt: gift.amountMnt,
                providerRef: gift.wirePaymentIntentId ?? `mock:gift:${gift.id}`,
              },
            });
            const accessUntil = await refreshAccessUntil(tx, user.id);
            await audit(tx, user.id, 'gift.redeem', 'Gift', gift.id, {
              buyerId: gift.buyerId,
              subscriptionId: subscription.id,
              amountMnt: gift.amountMnt,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            });
            const until = ubDate(endsAt);
            await enqueueEmail(tx, user.email, 'paymentApproved', {
              firstName: user.firstName,
              endsAt: until,
            });
            await enqueuePush(tx, {
              userId: user.id,
              title: mn.push.paymentApproved.title,
              body: mn.push.paymentApproved.body({ endsAt: until }),
              data: { type: 'access_granted' },
            });
            return {
              subscription: toSubscriptionDto(subscription),
              accessUntil: accessUntil?.toISOString() ?? null,
            };
          });
        } catch (err) {
          // Two requests drew the same reference code: draw again.
          if (isUniqueViolation(err) && attempt < CODE_RETRIES) continue;
          throw err;
        }
      }
    },

    // ---- admin ----

    async adminList(query: ListGiftsQuery) {
      const where: Prisma.GiftWhereInput = {
        status: query.status,
        AND: tokens(query.q).map((t) => ({
          OR: [
            { code: { contains: escapeLike(t.toUpperCase()) } },
            { buyer: userMatches(t) },
            { redeemedBy: userMatches(t) },
          ],
        })),
      };
      const [rows, total, unredeemed] = await Promise.all([
        db.gift.findMany({
          where,
          include: adminInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        db.gift.count({ where }),
        db.gift.aggregate({ where: { status: 'PAID' }, _sum: { amountMnt: true } }),
      ]);
      return {
        items: rows.map(toAdminDto),
        total,
        unredeemedMnt: unredeemed._sum.amountMnt ?? 0,
        page: query.page,
        limit: query.limit,
      };
    },

    /** PAID -> VOID with a reason (a refund is paid back outside the app). Once: a status precondition. */
    async adminVoid(actor: User, id: string, reason: string): Promise<AdminGiftDto> {
      await db.$transaction(async (tx) => {
        const gift = await tx.gift.findUnique({ where: { id } });
        if (!gift) throw new AppError(404, 'NOT_FOUND');
        const voided = await tx.gift.updateMany({
          where: { id, status: 'PAID' },
          data: { status: 'VOID', voidedById: actor.id, voidReason: reason },
        });
        if (voided.count !== 1) throw new AppError(409, 'GIFT_STATE');
        await audit(tx, actor.id, 'gift.void', 'Gift', id, {
          reason,
          amountMnt: gift.amountMnt,
          buyerId: gift.buyerId,
        });
      });
      const row = await db.gift.findUniqueOrThrow({ where: { id }, include: adminInclude });
      return toAdminDto(row);
    },
  };
}

export type GiftService = ReturnType<typeof createGiftService>;
