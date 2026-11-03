import type { AuditEntryDto } from '@ongod/shared';

export const DAY_MS = 86_400_000;
/** The most days one grant may add (grantRequestSchema in packages/shared). */
export const MAX_GRANT_DAYS = 3660;

export type AccessState = 'ACTIVE' | 'EXPIRED' | 'NONE';

/** Whether the account has access now, had it and lost it, or never had it. */
export function accessState(accessUntil: string | null, now: number): AccessState {
  if (accessUntil === null) return 'NONE';
  return Date.parse(accessUntil) > now ? 'ACTIVE' : 'EXPIRED';
}

export const isValidGrantDays = (days: number | undefined): days is number =>
  days !== undefined && Number.isInteger(days) && days >= 1 && days <= MAX_GRANT_DAYS;

/**
 * The period a grant would get: the same rule as the API (computePeriod in
 * apps/api/src/subscriptions/period.ts). It starts when the current access ends if that is still
 * ahead, otherwise now, and lasts `days`. The API uses its own clock when the grant is confirmed,
 * so the start can differ by the time spent on the confirmation.
 */
export function previewPeriod(now: number, accessUntil: string | null, days: number | undefined) {
  if (!isValidGrantDays(days)) return null;
  const current = accessUntil === null ? null : Date.parse(accessUntil);
  const extends_ = current !== null && current > now;
  const start = extends_ ? current : now;
  return { start, end: start + days * DAY_MS, extends: extends_ };
}

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value : null;

/** What the audit log says about one subscription; each field is null when the log has nothing. */
export function auditOf(audit: AuditEntryDto[], subscriptionId: string) {
  const own = (action: string) =>
    audit.find(
      (e) =>
        e.targetType === 'Subscription' && e.targetId === subscriptionId && e.action === action,
    );
  const grant = own('subscription.grant');
  const revoke = own('subscription.revoke');
  return {
    grant: grant
      ? { admin: grant.actor.username, note: text(record(grant.data).note), at: grant.createdAt }
      : null,
    revoke: revoke
      ? {
          admin: revoke.actor.username,
          reason: text(record(revoke.data).reason),
          refund: record(revoke.data).refund === true,
          at: revoke.createdAt,
        }
      : null,
  };
}
