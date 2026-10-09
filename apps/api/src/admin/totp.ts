import { generateSecret, generateURI, verifySync } from 'otplib';
import type { Db } from '../db';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { Session, User } from '../generated/prisma/client';
import { audit } from './audit';

/** A code from the previous or next 30 s step is accepted (phone clock drift). */
const TOLERANCE_SECONDS = 30;

/** Admin TOTP 2FA (SPEC surfaces, ADR-0010). The proof is stored on the session, see ADR-0022. */
export function createTotpService(deps: { db: Db; env: Env; now?: (() => Date) | undefined }) {
  const { db, env } = deps;
  const now = deps.now ?? (() => new Date());

  return {
    status(user: User, session: Session) {
      return { enabled: user.totpEnabledAt !== null, verified: session.totpVerifiedAt !== null };
    },

    /**
     * Starts (or restarts) the setup: a fresh secret that only counts once a code from it has been
     * verified. Refused after TOTP is enabled, so a stolen password cannot swap the second factor.
     */
    async setup(user: User): Promise<{ secret: string; otpauthUri: string }> {
      if (user.totpEnabledAt) throw new AppError(409, 'TOTP_ALREADY_ENABLED');
      const secret = generateSecret();
      const saved = await db.user.updateMany({
        where: { id: user.id, totpEnabledAt: null },
        data: { totpSecret: secret, totpLastStep: null },
      });
      if (saved.count !== 1) throw new AppError(409, 'TOTP_ALREADY_ENABLED');
      return {
        secret,
        otpauthUri: generateURI({ issuer: env.TOTP_ISSUER, label: user.email, secret }),
      };
    },

    /** Checks a code and marks this session as verified. The first valid code enables TOTP. */
    async verify(user: User, session: Session, code: string): Promise<void> {
      if (!user.totpSecret) throw new AppError(403, 'TOTP_SETUP_REQUIRED');

      const result = verifySync({
        secret: user.totpSecret,
        token: code,
        epochTolerance: TOLERANCE_SECONDS,
        // A code (or an older one) that was already accepted cannot be used again.
        ...(user.totpLastStep !== null ? { afterTimeStep: user.totpLastStep } : {}),
      });
      if (!result.valid || !('timeStep' in result)) throw new AppError(400, 'TOTP_INVALID');

      const at = now();
      await db.$transaction(async (tx) => {
        // Precondition on the last step: two requests with the same code cannot both pass.
        const claimed = await tx.user.updateMany({
          where: { id: user.id, totpLastStep: user.totpLastStep },
          data: {
            totpLastStep: result.timeStep,
            ...(user.totpEnabledAt ? {} : { totpEnabledAt: at }),
          },
        });
        if (claimed.count !== 1) throw new AppError(400, 'TOTP_INVALID');
        await tx.session.update({ where: { id: session.id }, data: { totpVerifiedAt: at } });
        if (!user.totpEnabledAt) {
          await audit(tx, user.id, 'admin.totp_enabled', 'User', user.id, {});
        }
      });
    },
  };
}

export type TotpService = ReturnType<typeof createTotpService>;
