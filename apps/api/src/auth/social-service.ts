import { randomUUID } from 'node:crypto';
import type { IdentityDto, TokenPair, UserDto } from '@ongod/shared';
import type { Db } from '../db';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import { hashPassword } from './crypto';
import { isUniqueViolation, lockUser, toUserDto, type AuthService } from './service';
import type { SocialIdentity } from './social';

export type Provider = 'GOOGLE' | 'APPLE';

interface DeviceInput {
  deviceId: string;
  platform: string;
  model?: string | undefined;
  removeDeviceId?: string | undefined;
}

const toIdentityDto = (i: { id: string; provider: Provider; email: string }): IdentityDto => ({
  id: i.id,
  provider: i.provider,
  email: i.email,
});

/** SPEC C: Google / Apple login, profile completion, linking and unlinking. */
export function createSocialService(deps: { db: Db; auth: AuthService }) {
  const { db, auth } = deps;

  async function openSession(user: User, dev: DeviceInput) {
    if (user.status === 'DISABLED') throw new AppError(403, 'ACCOUNT_DISABLED');
    if (user.status === 'DELETED') throw new AppError(401, 'SOCIAL_TOKEN_INVALID');
    const tokens: TokenPair = await auth.startSession(user.id, dev);
    return { tokens, user: toUserDto(user) };
  }

  return {
    /**
     * Existing identity -> log in. Email of an existing user -> LINK_REQUIRED (log in with the
     * password once, then link). Otherwise a new PENDING_PROFILE user with a verified email.
     */
    async signIn(
      provider: Provider,
      identity: SocialIdentity,
      dev: DeviceInput,
      retried = false,
    ): Promise<{ tokens: TokenPair; user: UserDto }> {
      const found = await db.authIdentity.findUnique({
        where: { provider_providerSubject: { provider, providerSubject: identity.subject } },
        include: { user: true },
      });
      if (found) return openSession(found.user, dev);

      // Apple only sends the email the first time; without it a new account cannot be made.
      if (!identity.email) throw new AppError(400, 'SOCIAL_EMAIL_REQUIRED');
      // Never trust (or link by) an email the provider has not verified.
      if (!identity.emailVerified) throw new AppError(401, 'SOCIAL_TOKEN_INVALID');
      const email = identity.email;

      const owner = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (owner) throw new AppError(409, 'LINK_REQUIRED', undefined, { email });

      let user: User;
      try {
        user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              // Placeholder until complete-profile; the real username is chosen there.
              username: `pending-${randomUUID()}`,
              email,
              emailVerifiedAt: new Date(),
              firstName: '',
              lastName: '',
              phone: '',
              status: 'PENDING_PROFILE',
            },
          });
          await tx.authIdentity.create({
            data: { userId: created.id, provider, providerSubject: identity.subject, email },
          });
          return created;
        });
      } catch (err) {
        // A parallel first sign-in won the race: evaluate again (identity now exists).
        if (isUniqueViolation(err) && !retried) return this.signIn(provider, identity, dev, true);
        throw err;
      }
      return openSession(user, dev);
    },

    /** The mandatory step after the first social sign-in. Runs once (status precondition). */
    async completeProfile(
      user: User,
      input: {
        username: string;
        password: string;
        lastName: string;
        firstName: string;
        phone: string;
      },
    ): Promise<UserDto> {
      // Same rule as register: an email-shaped username must be the user's own email.
      if (input.username.includes('@') && input.username !== user.email) {
        throw new AppError(400, 'VALIDATION_ERROR');
      }
      const clash = await db.user.findFirst({
        where: { username: input.username, id: { not: user.id } },
        select: { id: true },
      });
      if (clash) throw new AppError(409, 'USERNAME_TAKEN');

      const passwordHash = await hashPassword(input.password);
      try {
        return await db.$transaction(async (tx) => {
          await lockUser(tx, user.id);
          const done = await tx.user.updateMany({
            where: { id: user.id, status: 'PENDING_PROFILE' },
            data: {
              username: input.username,
              passwordHash,
              lastName: input.lastName,
              firstName: input.firstName,
              phone: input.phone,
              status: 'ACTIVE',
            },
          });
          if (done.count !== 1) throw new AppError(409, 'BAD_REQUEST');
          return toUserDto(await tx.user.findUniqueOrThrow({ where: { id: user.id } }));
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'USERNAME_TAKEN');
        throw err;
      }
    },

    async link(user: User, provider: Provider, identity: SocialIdentity): Promise<IdentityDto> {
      try {
        return await db.$transaction(async (tx) => {
          await lockUser(tx, user.id);
          const existing = await tx.authIdentity.findUnique({
            where: { provider_providerSubject: { provider, providerSubject: identity.subject } },
          });
          if (existing) {
            // Linking the same account twice is a no-op; someone else's account is refused.
            if (existing.userId !== user.id) throw new AppError(409, 'IDENTITY_TAKEN');
            return toIdentityDto(existing);
          }
          // One identity per provider per user.
          const sameProvider = await tx.authIdentity.findFirst({
            where: { userId: user.id, provider },
          });
          if (sameProvider) throw new AppError(409, 'IDENTITY_TAKEN');
          const created = await tx.authIdentity.create({
            data: {
              userId: user.id,
              provider,
              providerSubject: identity.subject,
              email: identity.email ?? '',
            },
          });
          return toIdentityDto(created);
        });
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'IDENTITY_TAKEN');
        throw err;
      }
    },

    async listIdentities(userId: string): Promise<IdentityDto[]> {
      const rows = await db.authIdentity.findMany({ where: { userId }, orderBy: { id: 'asc' } });
      return rows.map(toIdentityDto);
    },

    /** Only while the user still has a password, so there is always a way to log in. */
    async unlink(userId: string, identityId: string): Promise<void> {
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const identity = await tx.authIdentity.findFirst({ where: { id: identityId, userId } });
        if (!identity) throw new AppError(404, 'NOT_FOUND');
        const fresh = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { passwordHash: true },
        });
        if (!fresh.passwordHash) throw new AppError(409, 'LAST_LOGIN_METHOD');
        await tx.authIdentity.delete({ where: { id: identity.id } });
      });
    },
  };
}

export type SocialService = ReturnType<typeof createSocialService>;
