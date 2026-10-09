import type { FastifyRequest } from 'fastify';
import { authOf, type createAuthGuard } from '../auth/guard';
import { AppError } from '../errors';

/**
 * Guards for /v1/admin/*:
 * - `requireAdmin`: a signed-in ADMIN or OWNER. Used by the TOTP routes themselves.
 * - `requireAdminTotp`: the same, and this session has passed the TOTP check. Everything else.
 * The role is read from the database on every request, so a demoted admin is locked out at once.
 */
export function createAdminGuards(requireAuth: ReturnType<typeof createAuthGuard>) {
  async function requireAdmin(req: FastifyRequest): Promise<void> {
    await requireAuth(req);
    const { role } = authOf(req).user;
    if (role !== 'ADMIN' && role !== 'OWNER') throw new AppError(403, 'FORBIDDEN');
  }

  async function requireAdminTotp(req: FastifyRequest): Promise<void> {
    await requireAdmin(req);
    const { user, session } = authOf(req);
    if (!user.totpEnabledAt) throw new AppError(403, 'TOTP_SETUP_REQUIRED');
    if (!session.totpVerifiedAt) throw new AppError(403, 'TOTP_REQUIRED');
  }

  return { requireAdmin, requireAdminTotp };
}

export type AdminGuards = ReturnType<typeof createAdminGuards>;
