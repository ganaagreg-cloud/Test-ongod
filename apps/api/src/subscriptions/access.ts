import type { Prisma } from '../db';

type Tx = Prisma.TransactionClient;

/** The end of the latest ACTIVE period: the single source the `User.accessUntil` cache is rebuilt from. */
export async function latestActiveEnd(tx: Tx, userId: string): Promise<Date | null> {
  const agg = await tx.subscription.aggregate({
    where: { userId, status: 'ACTIVE' },
    _max: { endsAt: true },
  });
  return agg._max.endsAt;
}

export async function refreshAccessUntil(tx: Tx, userId: string): Promise<Date | null> {
  const accessUntil = await latestActiveEnd(tx, userId);
  await tx.user.update({ where: { id: userId }, data: { accessUntil } });
  return accessUntil;
}
