import type { AdminSubscriptionDto, AuditEntryDto, ListSubscriptionsQuery } from '@ongod/shared';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { AuditLog, User } from '../generated/prisma/client';
import { mn } from '../i18n/mn';
import { DAY_MS, ubDate, ubDateTime, ubDayStart } from '../lib/dates';
import { escapeLike } from '../lib/like';
import { toAdminSubscriptionDto, toSubscriptionDto } from '../subscriptions/dto';
import type { ReceiptStore } from '../subscriptions/receipts';
import { audit } from './audit';

type Page = { page: number; limit: number };

const subInclude = { plan: true, user: true, decidedBy: true } as const;
const EXPORT_ROW_LIMIT = 50_000;
const BOM = String.fromCharCode(0xfeff);

/** Every word must match some field, so "бат 9911" finds a name plus a phone fragment. */
const tokens = (q: string | undefined) => (q ? q.split(/\s+/).filter(Boolean).slice(0, 5) : []);

const userMatches = (token: string): Prisma.UserWhereInput => {
  const c = { contains: escapeLike(token) };
  return {
    OR: [{ username: c }, { email: c }, { phone: c }, { firstName: c }, { lastName: c }],
  };
};

export const toAdminUserDto = (u: User) => ({
  id: u.id,
  username: u.username,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone,
  status: u.status,
  role: u.role,
  emailVerified: u.emailVerifiedAt !== null,
  accessUntil: u.accessUntil?.toISOString() ?? null,
  createdAt: u.createdAt.toISOString(),
});

const toAuditDto = (a: AuditLog & { actor: Pick<User, 'id' | 'username'> }): AuditEntryDto => ({
  id: a.id,
  actor: { id: a.actor.id, username: a.actor.username },
  action: a.action,
  targetType: a.targetType,
  targetId: a.targetId,
  data: a.data,
  createdAt: a.createdAt.toISOString(),
});

/** A cell that starts with = + - @ is a formula in Excel/Sheets; a leading quote keeps it text. */
function csvCell(value: string | number | null): string {
  if (value === null) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=@\t\r]|^[+-](?![\d\s-]*$)/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function createAdminQueries(deps: {
  db: Db;
  receipts: ReceiptStore;
  now?: (() => Date) | undefined;
}) {
  const { db, receipts } = deps;
  const now = deps.now ?? (() => new Date());
  const skipTake = ({ page, limit }: Page) => ({ skip: (page - 1) * limit, take: limit });

  return {
    async listSubscriptions(query: ListSubscriptionsQuery) {
      const where: Prisma.SubscriptionWhereInput = {
        status: query.status,
        AND: tokens(query.q).map((t) => ({
          OR: [{ referenceCode: { contains: escapeLike(t) } }, { user: userMatches(t) }],
        })),
      };
      const [rows, total] = await Promise.all([
        db.subscription.findMany({
          where,
          include: subInclude,
          // The queue is first come, first served; history shows the newest first.
          orderBy:
            query.status === 'PAYMENT_SUBMITTED' ? { submittedAt: 'asc' } : { createdAt: 'desc' },
          ...skipTake(query),
        }),
        db.subscription.count({ where }),
      ]);
      return {
        items: rows.map(toAdminSubscriptionDto),
        total,
        page: query.page,
        limit: query.limit,
      };
    },

    async getSubscription(id: string): Promise<AdminSubscriptionDto> {
      const sub = await db.subscription.findUnique({ where: { id }, include: subInclude });
      if (!sub) throw new AppError(404, 'NOT_FOUND');
      return toAdminSubscriptionDto(sub);
    },

    /** Everything the admins did to one subscription (approve, reject, revoke, grant), newest first. */
    async subscriptionHistory(id: string) {
      const exists = await db.subscription.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new AppError(404, 'NOT_FOUND');
      const entries = await db.auditLog.findMany({
        where: { targetType: 'Subscription', targetId: id },
        include: { actor: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return { items: entries.map(toAuditDto) };
    },

    /** Admin only (the route is behind the TOTP guard). Never cached, never a public URL. */
    async getReceipt(id: string) {
      const sub = await db.subscription.findUnique({
        where: { id },
        select: { proofImagePath: true },
      });
      if (!sub?.proofImagePath) throw new AppError(404, 'NOT_FOUND');
      const file = await receipts.read(sub.proofImagePath);
      if (!file) throw new AppError(404, 'NOT_FOUND');
      return file;
    },

    async listUsers(query: { q?: string | undefined } & Page) {
      const where: Prisma.UserWhereInput = { AND: tokens(query.q).map(userMatches) };
      const [rows, total] = await Promise.all([
        db.user.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query) }),
        db.user.count({ where }),
      ]);
      return { items: rows.map(toAdminUserDto), total, page: query.page, limit: query.limit };
    },

    async userDetail(id: string) {
      const user = await db.user.findUnique({
        where: { id },
        include: {
          devices: { orderBy: { lastSeenAt: 'desc' } },
          subscriptions: { orderBy: { createdAt: 'desc' }, include: { plan: true } },
        },
      });
      if (!user) throw new AppError(404, 'NOT_FOUND');
      // The history of the user and of each of their subscriptions.
      const targets = [user.id, ...user.subscriptions.map((s) => s.id)];
      const entries = await db.auditLog.findMany({
        where: { targetId: { in: targets } },
        include: { actor: { select: { id: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
      return {
        user: toAdminUserDto(user),
        devices: user.devices.map((d) => ({
          id: d.id,
          platform: d.platform,
          model: d.model,
          lastSeenAt: d.lastSeenAt.toISOString(),
        })),
        subscriptions: user.subscriptions.map(toSubscriptionDto),
        audit: entries.map(toAuditDto),
      };
    },

    async dashboard() {
      const at = now();
      const active = { accessUntil: { gt: at }, status: { not: 'DELETED' as const } };
      const [activeUsers, pendingPayment, paymentSubmitted, expiringIn30Days, newUsersThisWeek] =
        await Promise.all([
          db.user.count({ where: active }),
          db.subscription.count({ where: { status: 'PENDING_PAYMENT' } }),
          db.subscription.count({ where: { status: 'PAYMENT_SUBMITTED' } }),
          db.user.count({
            where: {
              ...active,
              accessUntil: { gt: at, lte: new Date(at.getTime() + 30 * DAY_MS) },
            },
          }),
          db.user.count({
            where: {
              role: 'USER',
              status: { not: 'DELETED' },
              createdAt: { gte: new Date(at.getTime() - 7 * DAY_MS) },
            },
          }),
        ]);
      return { activeUsers, pendingPayment, paymentSubmitted, expiringIn30Days, newUsersThisWeek };
    },

    async listAudit(
      query: {
        actorId?: string | undefined;
        action?: string | undefined;
        targetType?: string | undefined;
      } & Page,
    ) {
      const where: Prisma.AuditLogWhereInput = {
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.targetType ? { targetType: query.targetType } : {}),
      };
      const [rows, total] = await Promise.all([
        db.auditLog.findMany({
          where,
          include: { actor: { select: { id: true, username: true } } },
          orderBy: { createdAt: 'desc' },
          ...skipTake(query),
        }),
        db.auditLog.count({ where }),
      ]);
      return { items: rows.map(toAuditDto), total, page: query.page, limit: query.limit };
    },

    /** CSV of payments for the accountant. The export itself is written to the audit log. */
    async exportPayments(
      actor: User,
      range: { from?: string | undefined; to?: string | undefined },
    ) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (range.from) createdAt.gte = ubDayStart(range.from);
      // "to" is inclusive: up to the start of the next day.
      if (range.to) createdAt.lt = new Date(ubDayStart(range.to).getTime() + DAY_MS);

      const payments = await db.payment.findMany({
        where: { createdAt },
        include: { subscription: { include: { plan: true, user: true } } },
        orderBy: { createdAt: 'asc' },
        take: EXPORT_ROW_LIMIT,
      });
      const lines = [mn.csv.columns.map(csvCell).join(',')];
      for (const p of payments) {
        const s = p.subscription;
        lines.push(
          [
            ubDateTime(p.createdAt),
            s.referenceCode,
            s.user.username,
            s.user.lastName,
            s.user.firstName,
            s.user.email,
            s.user.phone,
            s.plan.name,
            p.method,
            p.amountMnt,
            p.status,
            s.startsAt ? ubDate(s.startsAt) : null,
            s.endsAt ? ubDate(s.endsAt) : null,
          ]
            .map(csvCell)
            .join(','),
        );
      }
      await audit(db, actor.id, 'payments.export', 'Export', 'payments', {
        from: range.from ?? null,
        to: range.to ?? null,
        rows: payments.length,
      });
      // BOM so Excel reads the Mongolian text as UTF-8.
      return { csv: `${BOM}${lines.join('\r\n')}\r\n`, filename: `payments-${ubDate(now())}.csv` };
    },
  };
}

export type AdminQueries = ReturnType<typeof createAdminQueries>;
