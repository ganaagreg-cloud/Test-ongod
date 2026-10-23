import type { AdminSubscriptionDto, SubscriptionDto } from '@ongod/shared';
import type { Plan, Subscription, User } from '../generated/prisma/client';

export type SubscriptionWithPlan = Subscription & { plan: Plan };

const iso = (d: Date | null) => d?.toISOString() ?? null;

export const toSubscriptionDto = (s: SubscriptionWithPlan): SubscriptionDto => ({
  id: s.id,
  status: s.status,
  referenceCode: s.referenceCode,
  amountMnt: s.amountMnt,
  plan: { id: s.plan.id, name: s.plan.name, durationDays: s.plan.durationDays },
  startsAt: iso(s.startsAt),
  endsAt: iso(s.endsAt),
  paymentProvider: s.paymentProvider,
  checkoutUrl: s.status === 'PENDING_PAYMENT' ? s.checkoutUrl : null,
  createdAt: s.createdAt.toISOString(),
});

export const toAdminSubscriptionDto = (
  s: SubscriptionWithPlan & {
    user: User;
    decidedBy: Pick<User, 'id' | 'username'> | null;
  },
): AdminSubscriptionDto => ({
  ...toSubscriptionDto(s),
  user: {
    id: s.user.id,
    username: s.user.username,
    email: s.user.email,
    firstName: s.user.firstName,
    lastName: s.user.lastName,
    phone: s.user.phone,
  },
  decidedBy: s.decidedBy ? { id: s.decidedBy.id, username: s.decidedBy.username } : null,
  decidedAt: iso(s.decidedAt),
});
