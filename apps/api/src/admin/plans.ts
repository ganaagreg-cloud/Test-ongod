import type { AdminPlanDto, CreatePlanRequest, UpdatePlanRequest } from '@ongod/shared';
import type { Db, Prisma } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { audit } from './audit';

type Tx = Prisma.TransactionClient;

/**
 * Admin plans (SPEC K, ADR-0059): add, edit and switch off. No delete. The days of a plan
 * that has subscriptions are fixed, and the last active plan cannot be switched off.
 */
export function createPlanService(deps: { db: Db }) {
  const { db } = deps;

  const dto = (p: {
    id: string;
    name: string;
    durationDays: number;
    priceMnt: number;
    active: boolean;
    _count: { subscriptions: number };
  }): AdminPlanDto => ({
    id: p.id,
    name: p.name,
    durationDays: p.durationDays,
    priceMnt: p.priceMnt,
    active: p.active,
    subscriptionCount: p._count.subscriptions,
  });

  const include = { _count: { select: { subscriptions: true } } } as const;

  const load = async (id: string) => {
    const row = await db.plan.findUnique({ where: { id }, include });
    if (!row) throw new AppError(404, 'NOT_FOUND');
    return dto(row);
  };

  /** Same name, ignoring case (compared in memory so a case-sensitive collation also works). */
  const nameTaken = async (tx: Tx, name: string, exceptId?: string) => {
    const lower = name.toLocaleLowerCase('mn');
    const all = await tx.plan.findMany({ select: { id: true, name: true } });
    return all.some((p) => p.id !== exceptId && p.name.toLocaleLowerCase('mn') === lower);
  };

  return {
    async list() {
      const rows = await db.plan.findMany({
        orderBy: [{ active: 'desc' }, { priceMnt: 'asc' }, { id: 'asc' }],
        include,
      });
      return rows.map(dto);
    },

    async create(actor: User, input: CreatePlanRequest) {
      const id = await db.$transaction(async (tx) => {
        if (await nameTaken(tx, input.name)) throw new AppError(409, 'PLAN_NAME_TAKEN');
        const data = {
          name: input.name,
          durationDays: input.durationDays,
          priceMnt: input.priceMnt,
          active: input.active ?? true,
        };
        const plan = await tx.plan.create({ data });
        await audit(tx, actor.id, 'plan.create', 'Plan', plan.id, data);
        return plan.id;
      });
      return load(id);
    },

    async update(actor: User, id: string, input: UpdatePlanRequest) {
      await db.$transaction(async (tx) => {
        // Switching a plan off: lock the active plans before any read, so two admins switching
        // off two different plans at once cannot each see the other one still on (re-audit).
        if (input.active === false) {
          await tx.plan.updateMany({ where: { active: true }, data: { active: true } });
        }
        const plan = await tx.plan.findUnique({ where: { id }, include });
        if (!plan) throw new AppError(404, 'NOT_FOUND');
        if (input.name !== undefined && (await nameTaken(tx, input.name, id))) {
          throw new AppError(409, 'PLAN_NAME_TAKEN');
        }
        if (
          input.durationDays !== undefined &&
          input.durationDays !== plan.durationDays &&
          plan._count.subscriptions > 0
        ) {
          throw new AppError(409, 'PLAN_IN_USE');
        }
        if (input.active === false && plan.active) {
          const others = await tx.plan.count({ where: { active: true, id: { not: id } } });
          if (others === 0) throw new AppError(409, 'LAST_ACTIVE_PLAN');
        }
        // Only what changes goes into the row and the audit.
        const changed = Object.fromEntries(
          Object.entries(input).filter(
            ([key, value]) => value !== undefined && plan[key as keyof typeof input] !== value,
          ),
        );
        if (Object.keys(changed).length === 0) return;
        // The status precondition: the row still holds what was read (two admins at once).
        const { count } = await tx.plan.updateMany({
          where: {
            id,
            name: plan.name,
            durationDays: plan.durationDays,
            priceMnt: plan.priceMnt,
            active: plan.active,
          },
          data: changed,
        });
        if (count !== 1) throw new AppError(409, 'PLAN_CHANGED');
        const before = Object.fromEntries(
          Object.keys(changed).map((key) => [key, plan[key as keyof typeof input]]),
        );
        await audit(tx, actor.id, 'plan.update', 'Plan', id, { before, after: changed });
      });
      return load(id);
    },
  };
}

export type PlanService = ReturnType<typeof createPlanService>;
