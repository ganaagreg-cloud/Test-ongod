import type { AdminSubscriptionDto, BankDetails, SubscriptionDto } from '@ongod/shared';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { Plan, Subscription, User } from '../generated/prisma/client';

export type SubscriptionWithPlan = Subscription & { plan: Plan };

const iso = (d: Date | null) => d?.toISOString() ?? null;

export const toSubscriptionDto = (s: SubscriptionWithPlan): SubscriptionDto => ({
  id: s.id,
  status: s.status,
  referenceCode: s.referenceCode,
  amountMnt: s.amountMnt,
  plan: { id: s.plan.id, name: s.plan.name, durationDays: s.plan.durationDays },
  payerNote: s.payerNote,
  transferAt: iso(s.transferAt),
  hasReceipt: s.proofImagePath !== null,
  submittedAt: iso(s.submittedAt),
  startsAt: iso(s.startsAt),
  endsAt: iso(s.endsAt),
  rejectReason: s.rejectReason,
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

/** The bank account from env. A missing value is a configuration error, never shown as empty text. */
export function bankDetails(env: Env): BankDetails {
  if (!env.BANK_NAME || !env.BANK_ACCOUNT || !env.BANK_ACCOUNT_HOLDER) {
    throw new AppError(503, 'SERVICE_UNAVAILABLE');
  }
  return {
    bankName: env.BANK_NAME,
    accountNumber: env.BANK_ACCOUNT,
    accountHolder: env.BANK_ACCOUNT_HOLDER,
  };
}
