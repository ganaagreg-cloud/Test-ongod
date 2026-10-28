import { GIFT_VALID_DAYS, type SubscriptionDto } from '@ongod/shared';
import { audit } from '../admin/audit';
import { isUniqueViolation, lockUser } from '../auth/service';
import type { Db } from '../db';
import { enqueueEmail } from '../email';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { Gift, Plan, Subscription, User } from '../generated/prisma/client';
import { mn } from '../i18n/mn';
import { DAY_MS, ubDate } from '../lib/dates';
import { generateGiftCode } from '../gifts/code';
import { enqueuePush } from '../push';
import { latestActiveEnd, refreshAccessUntil } from '../subscriptions/access';
import { toSubscriptionDto } from '../subscriptions/dto';
import { computePeriod } from '../subscriptions/period';
import {
  isDead,
  isSucceeded,
  toMinor,
  verifyWebhook,
  type WireGateway,
  type WireIntent,
} from './wire';

/**
 * A verified payment may still arrive after the request went stale (the member paid on the last
 * day, or the 7-day expiry ran first). The money is taken, so the access is granted. REJECTED and
 * REVOKED are admin decisions and stay as they are. An EXPIRED request counts only if it was never
 * granted (startsAt empty): one that was paid and then ran out is also EXPIRED, and its intent
 * still reads succeeded, so it must not be granted again (ADR-0047).
 */
const PAYABLE_WHERE = {
  OR: [
    { status: { in: ['PENDING_PAYMENT' as const, 'CANCELLED' as const] } },
    { status: 'EXPIRED' as const, startsAt: null },
  ],
};
const isPayable = (sub: Pick<Subscription, 'status' | 'startsAt'>) =>
  sub.status === 'PENDING_PAYMENT' ||
  sub.status === 'CANCELLED' ||
  (sub.status === 'EXPIRED' && sub.startsAt === null);

/** Same rule for a gift (ADR-0060): paid late, or after the checkout was cancelled, still counts. */
const GIFT_PAYABLE_WHERE = {
  OR: [
    { status: { in: ['PENDING_PAYMENT' as const, 'CANCELLED' as const] } },
    { status: 'EXPIRED' as const, paidAt: null },
  ],
};

type SubscriptionRow = Subscription & { plan: Plan };
type GiftRow = Gift & { plan: Plan };

/** What a Wire intent pays for: a subscription (SPEC D) or a gift (SPEC J). */
type Target = { kind: 'subscription' | 'gift'; id: string; amountMnt: number };

export type WebhookReply = { status: number; body: Record<string, unknown> };

/** QPay through Wire, ADR-0041: start a checkout, then turn a verified payment into access. */
export function createPaymentService(deps: {
  db: Db;
  env: Env;
  /** null = no WIRE_API_KEY: development uses the mock checkout. */
  gateway: WireGateway | null;
  log?: { error: (obj: object, msg: string) => void } | undefined;
  now?: (() => Date) | undefined;
}) {
  const { db, env, gateway } = deps;
  const now = deps.now ?? (() => new Date());
  const report = (obj: object, msg: string) => deps.log?.error(obj, msg);

  const mockAllowed = () => env.NODE_ENV !== 'production' || env.ALLOW_MOCK_PAYMENTS;
  const view = async (id: string): Promise<SubscriptionDto> =>
    toSubscriptionDto(
      await db.subscription.findUniqueOrThrow({ where: { id }, include: { plan: true } }),
    );

  /**
   * The one place access is granted for a payment (webhook, status poll and mock all end here).
   * One transaction, the user row locked first (ADR-0018 #6), a status precondition in the UPDATE:
   * running it twice grants once. Returns whether this call did the grant.
   */
  async function grant(subscriptionId: string, providerRef: string): Promise<boolean> {
    const found = await db.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true },
    });
    if (!found) return false;
    const { userId } = found;
    return db.$transaction(async (tx) => {
      await lockUser(tx, userId);
      const sub = await tx.subscription.findUnique({
        where: { id: subscriptionId },
        include: { plan: true, user: true },
      });
      if (!sub || !isPayable(sub)) return false;
      if (sub.user.status === 'DELETED') return false;

      const at = now();
      const { startsAt, endsAt } = computePeriod(
        at,
        await latestActiveEnd(tx, userId),
        sub.plan.durationDays,
      );
      const granted = await tx.subscription.updateMany({
        where: { id: subscriptionId, ...PAYABLE_WHERE },
        data: { status: 'ACTIVE', startsAt, endsAt, decidedAt: at },
      });
      if (granted.count !== 1) return false;

      await tx.payment.create({
        data: { subscriptionId, method: 'QPAY', amountMnt: sub.amountMnt, providerRef },
      });
      await refreshAccessUntil(tx, userId);
      // The member is the actor: there is no admin step for an automatic payment.
      await audit(tx, userId, 'subscription.paid', 'Subscription', subscriptionId, {
        referenceCode: sub.referenceCode,
        amountMnt: sub.amountMnt,
        provider: sub.paymentProvider,
        providerRef,
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
      return true;
    });
  }

  /** The payment was cancelled or failed: a request that is still waiting for money is closed. */
  async function markDead(subscriptionId: string): Promise<void> {
    await db.subscription.updateMany({
      where: { id: subscriptionId, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * A gift payment arrived: the gift becomes PAID and gets its code. Same shape as `grant`: one
   * transaction, the buyer row locked first, a status precondition in the UPDATE, so running it
   * twice issues one code. Returns whether this call did it.
   */
  async function grantGift(giftId: string, providerRef: string): Promise<boolean> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await db.$transaction(async (tx) => {
          const found = await tx.gift.findUnique({
            where: { id: giftId },
            include: { plan: true, buyer: true },
          });
          if (!found) return false;
          await lockUser(tx, found.buyerId);
          const at = now();
          const code = generateGiftCode();
          const expiresAt = new Date(at.getTime() + GIFT_VALID_DAYS * DAY_MS);
          const paid = await tx.gift.updateMany({
            where: { id: giftId, ...GIFT_PAYABLE_WHERE },
            data: {
              status: 'PAID',
              code,
              paidAt: at,
              expiresAt,
            },
          });
          if (paid.count !== 1) return false;
          await audit(tx, found.buyerId, 'gift.paid', 'Gift', giftId, {
            amountMnt: found.amountMnt,
            planId: found.planId,
            provider: found.paymentProvider,
            providerRef,
            expiresAt: expiresAt.toISOString(),
          });
          await enqueueEmail(tx, found.buyer.email, 'giftPurchased', {
            firstName: found.buyer.firstName,
            code,
            planName: found.plan.name,
            validUntil: ubDate(expiresAt),
          });
          return true;
        });
      } catch (err) {
        // Two gifts drew the same code: draw again.
        if (isUniqueViolation(err) && attempt < 5) continue;
        throw err;
      }
    }
  }

  async function markGiftDead(giftId: string): Promise<void> {
    await db.gift.updateMany({
      where: { id: giftId, status: 'PENDING_PAYMENT' },
      data: { status: 'CANCELLED' },
    });
  }

  /**
   * What Wire says about a payment, applied. Never trusts a webhook payload: the caller passes an
   * intent that was just read from Wire. Success needs the exact amount, and in production a live
   * (not test) intent, so a leftover sk_test key cannot unlock anything for free.
   */
  async function applyIntent(target: Target, intent: WireIntent): Promise<string> {
    if (isSucceeded(intent)) {
      const exact = intent.amount === toMinor(target.amountMnt);
      const live = env.NODE_ENV !== 'production' || intent.livemode;
      if (!exact || !live) {
        report(
          { [`${target.kind}Id`]: target.id, intentId: intent.id, amount: intent.amount, live },
          'wire payment succeeded but amount or livemode did not match: not granted',
        );
        return 'rejected';
      }
      if (target.kind === 'gift') await grantGift(target.id, intent.id);
      else await grant(target.id, intent.id);
      return 'paid';
    }
    if (isDead(intent)) {
      if (target.kind === 'gift') await markGiftDead(target.id);
      else await markDead(target.id);
      return 'dead';
    }
    return 'pending';
  }

  /** Real Wire when a key is set, else the mock (development), else not available. */
  function mode(): 'WIRE' | 'MOCK' {
    if (gateway) return 'WIRE';
    if (mockAllowed()) return 'MOCK';
    throw new AppError(503, 'SERVICE_UNAVAILABLE');
  }

  return {
    mode,

    /** Gives a PENDING_PAYMENT request its checkout. Repeating it returns the same checkout. */
    async startCheckout(sub: SubscriptionRow): Promise<SubscriptionRow> {
      if (sub.checkoutUrl) return sub;
      if (mode() === 'MOCK' || !gateway) {
        return db.subscription.update({
          where: { id: sub.id },
          data: { paymentProvider: 'MOCK', checkoutUrl: `/pay/mock/${sub.id}` },
          include: { plan: true },
        });
      }
      const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
      try {
        const checkout = await gateway.createCheckout({
          subscriptionId: sub.id,
          amountMnt: sub.amountMnt,
          description: `Онгод · ${sub.plan.name}`,
          successUrl: `${base}/status`,
          cancelUrl: `${base}/pay?canceled=1`,
        });
        return await db.subscription.update({
          where: { id: sub.id },
          data: {
            paymentProvider: 'WIRE',
            wirePaymentIntentId: checkout.paymentIntentId,
            checkoutUrl: checkout.checkoutUrl,
          },
          include: { plan: true },
        });
      } catch (err) {
        report({ err, subscriptionId: sub.id }, 'wire checkout could not be created');
        throw new AppError(503, 'SERVICE_UNAVAILABLE');
      }
    },

    /**
     * Asks Wire about a waiting payment, so access arrives even before the webhook does (status
     * page), or after a lost webhook (cron, ADR-0045: also a request that expired meanwhile).
     */
    async sync(sub: SubscriptionRow): Promise<void> {
      if (
        !gateway ||
        (sub.status !== 'PENDING_PAYMENT' && sub.status !== 'EXPIRED') ||
        sub.paymentProvider !== 'WIRE' ||
        !sub.wirePaymentIntentId
      ) {
        return;
      }
      try {
        await applyIntent(
          { kind: 'subscription', id: sub.id, amountMnt: sub.amountMnt },
          await gateway.retrieveIntent(sub.wirePaymentIntentId),
        );
      } catch (err) {
        // The status page asks again in a few seconds, the cron on its next tick; a Wire outage
        // must not break either.
        report({ err, subscriptionId: sub.id }, 'wire status check failed');
      }
    },

    /** Gives an unpaid gift its checkout (ADR-0060). Repeating it returns the same checkout. */
    async startGiftCheckout(gift: GiftRow): Promise<GiftRow> {
      if (gift.checkoutUrl) return gift;
      if (mode() === 'MOCK' || !gateway) {
        return db.gift.update({
          where: { id: gift.id },
          data: { paymentProvider: 'MOCK', checkoutUrl: `/pay/mock/gift/${gift.id}` },
          include: { plan: true },
        });
      }
      const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
      try {
        const checkout = await gateway.createCheckout({
          subscriptionId: `gift_${gift.id}`,
          amountMnt: gift.amountMnt,
          description: `Онгод бэлэг · ${gift.plan.name}`,
          successUrl: `${base}/gifts`,
          cancelUrl: `${base}/gift?canceled=1`,
        });
        return await db.gift.update({
          where: { id: gift.id },
          data: {
            paymentProvider: 'WIRE',
            wirePaymentIntentId: checkout.paymentIntentId,
            checkoutUrl: checkout.checkoutUrl,
          },
          include: { plan: true },
        });
      } catch (err) {
        report({ err, giftId: gift.id }, 'wire checkout could not be created for a gift');
        throw new AppError(503, 'SERVICE_UNAVAILABLE');
      }
    },

    /** Asks Wire about a waiting gift payment (the gifts page and the cron), like `sync`. */
    async syncGift(gift: Gift): Promise<void> {
      if (
        !gateway ||
        (gift.status !== 'PENDING_PAYMENT' && gift.status !== 'EXPIRED') ||
        gift.paymentProvider !== 'WIRE' ||
        !gift.wirePaymentIntentId
      ) {
        return;
      }
      try {
        await applyIntent(
          { kind: 'gift', id: gift.id, amountMnt: gift.amountMnt },
          await gateway.retrieveIntent(gift.wirePaymentIntentId),
        );
      } catch (err) {
        report({ err, giftId: gift.id }, 'wire status check failed for a gift');
      }
    },

    /** POST /v1/webhooks/wire. `rawBody` must be the untouched request body. */
    async handleWebhook(rawBody: string, signature: string): Promise<WebhookReply> {
      const secret = env.WIRE_WEBHOOK_SECRET;
      if (!secret) return { status: 503, body: { error: 'not configured' } };

      let event;
      try {
        event = verifyWebhook(rawBody, signature, secret);
      } catch {
        return { status: 400, body: { error: 'bad signature' } };
      }

      // Wire retries; the same event id is handled once.
      try {
        await db.webhookEvent.create({ data: { id: event.eventId, type: event.type } });
      } catch (err) {
        if (isUniqueViolation(err)) return { status: 200, body: { ok: true, duplicate: true } };
        throw err;
      }

      if (!event.type.startsWith('payment_intent.') || !event.intentId) {
        return { status: 200, body: { ok: true, ignored: true } };
      }
      const sub = await db.subscription.findUnique({
        where: { wirePaymentIntentId: event.intentId },
        include: { plan: true },
      });
      const gift = sub
        ? null
        : await db.gift.findUnique({ where: { wirePaymentIntentId: event.intentId } });
      const target: Target | null = sub
        ? { kind: 'subscription', id: sub.id, amountMnt: sub.amountMnt }
        : gift
          ? { kind: 'gift', id: gift.id, amountMnt: gift.amountMnt }
          : null;
      if (!target) return { status: 200, body: { ok: true, unknown: true } };

      try {
        if (event.type === 'payment_intent.succeeded') {
          if (!gateway) throw new Error('webhook received but WIRE_API_KEY is not set');
          // Never trust the payload alone: read the intent again from Wire.
          await applyIntent(target, await gateway.retrieveIntent(event.intentId));
        } else if (
          event.type === 'payment_intent.canceled' ||
          event.type === 'payment_intent.payment_failed'
        ) {
          if (target.kind === 'gift') await markGiftDead(target.id);
          else await markDead(target.id);
        }
      } catch (err) {
        // Forget the event so Wire's retry is handled instead of skipped as a duplicate.
        await db.webhookEvent.delete({ where: { id: event.eventId } }).catch(() => undefined);
        throw err;
      }
      return { status: 200, body: { ok: true } };
    },

    /** Development only: the mock checkout's "Simulate success" and "Cancel". */
    async mockOutcome(
      user: User,
      subscriptionId: string,
      outcome: 'success' | 'cancel',
    ): Promise<SubscriptionDto> {
      if (!mockAllowed()) throw new AppError(404, 'NOT_FOUND');
      const sub = await db.subscription.findFirst({
        where: { id: subscriptionId, userId: user.id, paymentProvider: 'MOCK' },
      });
      if (!sub) throw new AppError(404, 'NOT_FOUND');
      if (outcome === 'success') await grant(sub.id, `mock:${sub.id}`);
      else await markDead(sub.id);
      return view(sub.id);
    },

    /** Development only: the mock checkout for a gift. Returns whether the gift is now PAID. */
    async mockGiftOutcome(
      user: User,
      giftId: string,
      outcome: 'success' | 'cancel',
    ): Promise<void> {
      if (!mockAllowed()) throw new AppError(404, 'NOT_FOUND');
      const gift = await db.gift.findFirst({
        where: { id: giftId, buyerId: user.id, paymentProvider: 'MOCK' },
      });
      if (!gift) throw new AppError(404, 'NOT_FOUND');
      if (outcome === 'success') await grantGift(gift.id, `mock:gift:${gift.id}`);
      else await markGiftDead(gift.id);
    },
  };
}

export type PaymentService = ReturnType<typeof createPaymentService>;
