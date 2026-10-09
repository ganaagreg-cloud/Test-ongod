import type { Prisma } from '../db';

/**
 * Appends to the audit log. Always call it with the transaction client of the change it
 * describes, so the log and the change commit together. `data` holds ids and amounts, never
 * secrets, passwords or free-form personal data.
 */
export function audit(
  tx: Prisma.TransactionClient,
  actorId: string,
  action: string,
  targetType: 'User' | 'Subscription' | 'Export' | 'Episode' | 'Category',
  targetId: string,
  data: Prisma.InputJsonObject,
) {
  return tx.auditLog.create({ data: { actorId, action, targetType, targetId, data } });
}
