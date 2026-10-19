import type { FastifyRequest } from 'fastify';
import { authOf, type createAuthGuard } from '../auth/guard';
import { AppError } from '../errors';

/**
 * Guard for /v1/admin/*: a signed-in ADMIN or OWNER (password login only, ADR-0040).
 * The role is read from the database on every request, so a demoted admin is locked out at once.
 */
export function createAdminGuards(requireAuth: ReturnType<typeof createAuthGuard>) {
  async function requireAdmin(req: FastifyRequest): Promise<void> {
    await requireAuth(req);
    const { role } = authOf(req).user;
    if (role !== 'ADMIN' && role !== 'OWNER') throw new AppError(403, 'FORBIDDEN');
  }

  return { requireAdmin };
}

export type AdminGuards = ReturnType<typeof createAdminGuards>;
