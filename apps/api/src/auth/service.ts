import {
  MAX_DEVICES,
  type DeviceDto,
  type LoginRequest,
  type RegisterRequest,
  type TokenPair,
  type UserDto,
} from '@ongod/shared';
import type { Db, Prisma } from '../db';
import { enqueueEmail } from '../email';
import type { Env } from '../env';
import { AppError } from '../errors';
import type { User } from '../generated/prisma/client';
import {
  burnPasswordCheck,
  hashEmailCode,
  hashPassword,
  hashRefreshToken,
  newEmailCode,
  newRefreshToken,
  safeEqualHex,
  signAccessToken,
  verifyPassword,
} from './crypto';

type Tx = Prisma.TransactionClient;
type CodePurpose = 'VERIFY' | 'RESET' | 'CHANGE_EMAIL';

export const CODE_TTL_MS = 10 * 60_000;
export const CODE_RESEND_COOLDOWN_MS = 60_000;
export const MAX_CODE_ATTEMPTS = 5;
const DAY_MS = 86_400_000;

export const isUniqueViolation = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';

export const toUserDto = (u: User): UserDto => ({
  id: u.id,
  username: u.username,
  email: u.email,
  emailVerified: u.emailVerifiedAt !== null,
  firstName: u.firstName,
  lastName: u.lastName,
  phone: u.phone,
  status: u.status,
  role: u.role,
  accessUntil: u.accessUntil?.toISOString() ?? null,
});

const toDeviceDto = (d: {
  id: string;
  platform: string;
  model: string | null;
  lastSeenAt: Date;
}): DeviceDto => ({
  id: d.id,
  platform: d.platform,
  model: d.model,
  lastSeenAt: d.lastSeenAt.toISOString(),
});

/**
 * Serialises the device/session changes of one user. The no-op UPDATE takes the row lock in
 * InnoDB; it must be the first statement of the transaction so that later reads see rows
 * committed by whoever held the lock before us (no stale snapshot, so no 3rd device by race).
 */
export const lockUser = (tx: Tx, userId: string) =>
  tx.user.updateMany({ where: { id: userId }, data: { id: userId } });

export function createAuthService(deps: { db: Db; env: Env }) {
  const { db, env } = deps;
  const accessCfg = { secret: env.JWT_ACCESS_SECRET, ttlSeconds: env.ACCESS_TOKEN_TTL_SECONDS };
  const refreshTtlMs = env.REFRESH_TOKEN_TTL_DAYS * DAY_MS;

  const codeHash = (userId: string, purpose: CodePurpose, code: string) =>
    hashEmailCode(env.JWT_ACCESS_SECRET, userId, purpose, code);

  // ---- email codes (SPEC A: 10 min, 5 attempts, 60 s cooldown) ----

  /** Replaces any open code of this purpose with a new one and queues the email. */
  async function issueCode(
    tx: Tx,
    user: Pick<User, 'id' | 'firstName' | 'email'>,
    purpose: CodePurpose,
    opts: { newEmail?: string } = {},
  ) {
    const latest = await tx.emailCode.findFirst({
      where: { userId: user.id, purpose },
      orderBy: { expiresAt: 'desc' },
    });
    // The table has no createdAt; the issue time is expiresAt - CODE_TTL_MS.
    if (
      latest &&
      Date.now() - (latest.expiresAt.getTime() - CODE_TTL_MS) < CODE_RESEND_COOLDOWN_MS
    ) {
      throw new AppError(429, 'RESEND_COOLDOWN');
    }
    // Only when an earlier code exists: an updateMany over an empty (userId, purpose) range takes
    // a gap lock, and two sign-ups at the same moment then deadlock (audit C-05).
    if (latest) {
      await tx.emailCode.updateMany({
        where: { userId: user.id, purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
    }
    const code = newEmailCode();
    await tx.emailCode.create({
      data: {
        userId: user.id,
        purpose,
        codeHash: codeHash(user.id, purpose, code),
        newEmail: opts.newEmail ?? null,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
    });
    const template = { VERIFY: 'verifyEmail', RESET: 'resetPassword', CHANGE_EMAIL: 'changeEmail' }[
      purpose
    ] as 'verifyEmail' | 'resetPassword' | 'changeEmail';
    await enqueueEmail(tx, opts.newEmail ?? user.email, template, {
      firstName: user.firstName,
      code,
    });
  }

  /**
   * Checks a submitted code and counts the attempt (atomically, so parallel guesses cannot
   * exceed the limit). On success returns the code row; the caller must then mark it used
   * with `useCode` inside the transaction that applies the change.
   */
  async function checkCode(userId: string, purpose: CodePurpose, code: string) {
    const row = await db.emailCode.findFirst({
      where: { userId, purpose, usedAt: null },
      orderBy: { expiresAt: 'desc' },
    });
    if (!row) throw new AppError(400, 'CODE_INVALID');
    if (row.expiresAt <= new Date()) throw new AppError(400, 'CODE_EXPIRED');
    const counted = await db.emailCode.updateMany({
      where: { id: row.id, usedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (counted.count !== 1) throw new AppError(429, 'CODE_ATTEMPTS_EXCEEDED');
    if (!safeEqualHex(row.codeHash, codeHash(userId, purpose, code))) {
      throw new AppError(400, 'CODE_INVALID');
    }
    return row;
  }

  /** Status precondition: a code works exactly once. */
  async function useCode(tx: Tx, codeId: string) {
    const used = await tx.emailCode.updateMany({
      where: { id: codeId, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new AppError(400, 'CODE_INVALID');
  }

  // ---- sessions ----

  async function createSession(
    tx: Tx,
    p: { userId: string; deviceId: string; familyId?: string; totpVerifiedAt?: Date | null },
  ) {
    const refreshToken = newRefreshToken();
    const session = await tx.session.create({
      data: {
        userId: p.userId,
        deviceId: p.deviceId,
        refreshTokenHash: hashRefreshToken(refreshToken),
        familyId: p.familyId ?? crypto.randomUUID(),
        expiresAt: new Date(Date.now() + refreshTtlMs),
        totpVerifiedAt: p.totpVerifiedAt ?? null,
      },
    });
    return { session, refreshToken };
  }

  async function tokenPair(
    userId: string,
    sessionId: string,
    refreshToken: string,
  ): Promise<TokenPair> {
    return {
      accessToken: await signAccessToken(accessCfg, { userId, sessionId }),
      refreshToken,
      expiresIn: accessCfg.ttlSeconds,
    };
  }

  const revokeDeviceSessions = (tx: Tx, userId: string, deviceId: string) =>
    tx.session.updateMany({
      where: { userId, deviceId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

  /** Revokes every session of the user, except `keepSessionId`. */
  const revokeUserSessions = (tx: Tx, userId: string, keepSessionId?: string) =>
    tx.session.updateMany({
      where: { userId, revokedAt: null, ...(keepSessionId ? { id: { not: keepSessionId } } : {}) },
      data: { revokedAt: new Date() },
    });

  /** SPEC B: max 2 devices. Throws DEVICE_LIMIT (with the list) when a new one would be the 3rd. */
  async function registerDevice(
    tx: Tx,
    userId: string,
    d: { deviceId: string; platform: string; model?: string | null },
  ) {
    const existing = await tx.device.findUnique({
      where: { userId_deviceId: { userId, deviceId: d.deviceId } },
    });
    if (existing) {
      await tx.device.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: new Date(),
          // A refresh does not know the platform ('unknown'): keep what the login stored.
          platform: d.platform === 'unknown' ? existing.platform : d.platform,
          model: d.model ?? existing.model,
        },
      });
      return;
    }
    const devices = await tx.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (devices.length >= MAX_DEVICES) {
      throw new AppError(403, 'DEVICE_LIMIT', undefined, { devices: devices.map(toDeviceDto) });
    }
    await tx.device.create({
      data: { userId, deviceId: d.deviceId, platform: d.platform, model: d.model ?? null },
    });
  }

  /**
   * Registers the device (SPEC B: max 2) and opens a new session family. The caller has already
   * proven the identity: a password (login) or a verified provider ID token (social login), which
   * is also what authorises `removeDeviceId`.
   */
  async function startSession(
    userId: string,
    input: {
      deviceId: string;
      platform: string;
      model?: string | undefined;
      removeDeviceId?: string | undefined;
    },
  ): Promise<TokenPair> {
    const { session, refreshToken } = await db.$transaction(async (tx) => {
      await lockUser(tx, userId);
      if (input.removeDeviceId) {
        const doomed = await tx.device.findFirst({ where: { id: input.removeDeviceId, userId } });
        if (doomed) {
          await tx.device.delete({ where: { id: doomed.id } });
          await revokeDeviceSessions(tx, userId, doomed.deviceId);
        }
      }
      await registerDevice(tx, userId, input);
      // Logging in again on a device replaces its earlier sessions.
      await revokeDeviceSessions(tx, userId, input.deviceId);
      return createSession(tx, { userId, deviceId: input.deviceId });
    });
    return tokenPair(userId, session.id, refreshToken);
  }

  // ---- lookups ----

  async function assertEmailFree(email: string, exceptUserId?: string) {
    // A username may equal an email (default username), so both columns are checked.
    const clash = await db.user.findFirst({
      where: {
        OR: [{ email }, { username: email }],
        ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new AppError(409, 'EMAIL_TAKEN');
  }

  return {
    // =============== A. register / verify ===============

    async register(input: RegisterRequest): Promise<UserDto> {
      const username = input.username ?? input.email;
      // An email-shaped username must be the user's own email, or it could shadow someone else's login.
      if (username.includes('@') && username !== input.email) {
        throw new AppError(400, 'VALIDATION_ERROR');
      }
      const clash = await db.user.findFirst({
        where: { OR: [{ email: input.email }, { username: input.email }, { username }] },
        select: { email: true, username: true },
      });
      if (clash) {
        throw clash.email === input.email || clash.username === input.email
          ? new AppError(409, 'EMAIL_TAKEN')
          : new AppError(409, 'USERNAME_TAKEN');
      }

      const passwordHash = await hashPassword(input.password);
      try {
        const user = await db.$transaction(async (tx) => {
          const created = await tx.user.create({
            data: {
              username,
              email: input.email,
              passwordHash,
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
            },
          });
          await issueCode(tx, created, 'VERIFY');
          return created;
        });
        return toUserDto(user);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'EMAIL_TAKEN');
        throw err;
      }
    },

    async verifyEmail(email: string, code: string): Promise<void> {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.status === 'DELETED') throw new AppError(400, 'CODE_INVALID');
      if (user.emailVerifiedAt) return; // already verified: idempotent
      const row = await checkCode(user.id, 'VERIFY', code);
      await db.$transaction(async (tx) => {
        await useCode(tx, row.id);
        await tx.user.updateMany({
          where: { id: user.id, emailVerifiedAt: null },
          data: { emailVerifiedAt: new Date() },
        });
      });
    },

    /** Always succeeds for unknown or already verified emails, so it does not reveal accounts. */
    async resendVerifyCode(email: string): Promise<void> {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.status === 'DELETED' || user.emailVerifiedAt) return;
      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        await issueCode(tx, user, 'VERIFY');
      });
    },

    // =============== B. login / refresh / logout ===============

    async login(input: LoginRequest): Promise<{ tokens: TokenPair; user: UserDto }> {
      const candidates = await db.user.findMany({
        where: { OR: [{ username: input.identifier }, { email: input.identifier }] },
      });
      let user: User | undefined;
      for (const c of candidates) {
        if (c.passwordHash && (await verifyPassword(c.passwordHash, input.password))) {
          user = c;
          break;
        }
      }
      if (candidates.length === 0) await burnPasswordCheck(input.password);
      if (!user || user.status === 'DELETED') throw new AppError(401, 'INVALID_CREDENTIALS');
      if (user.status === 'DISABLED') throw new AppError(403, 'ACCOUNT_DISABLED');

      return { tokens: await startSession(user.id, input), user: toUserDto(user) };
    },

    startSession,

    /**
     * Rotation with reuse detection. A token that was already rotated or revoked, or used from
     * another device, revokes the whole family (the revoke is committed, then 401 is returned).
     */
    async refresh(token: string, deviceId: string): Promise<TokenPair> {
      const hash = hashRefreshToken(token);
      const known = await db.session.findUnique({
        where: { refreshTokenHash: hash },
        select: { userId: true },
      });
      if (!known) throw new AppError(401, 'UNAUTHORIZED');

      const outcome = await db.$transaction(async (tx) => {
        await lockUser(tx, known.userId);
        const session = await tx.session.findUnique({
          where: { refreshTokenHash: hash },
          include: { user: true },
        });
        if (!session) return { kind: 'invalid' } as const;
        const now = new Date();
        const revokeFamily = () =>
          tx.session.updateMany({
            where: { familyId: session.familyId, revokedAt: null },
            data: { revokedAt: now },
          });

        if (session.revokedAt || session.deviceId !== deviceId) {
          await revokeFamily();
          return { kind: 'reuse' } as const;
        }
        if (session.expiresAt <= now) return { kind: 'invalid' } as const;
        if (session.user.status === 'DELETED') return { kind: 'invalid' } as const;
        if (session.user.status === 'DISABLED') return { kind: 'disabled' } as const;

        // Status precondition: only one request can rotate a given token.
        const rotated = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: { revokedAt: now },
        });
        if (rotated.count !== 1) {
          await revokeFamily();
          return { kind: 'reuse' } as const;
        }
        // Device limit on refresh: a device that was removed cannot come back past the limit.
        await registerDevice(tx, session.userId, { deviceId, platform: 'unknown' });
        const next = await createSession(tx, {
          userId: session.userId,
          deviceId,
          familyId: session.familyId,
          // A refreshed admin session stays TOTP-verified; a new login does not.
          totpVerifiedAt: session.totpVerifiedAt,
        });
        return { kind: 'ok', userId: session.userId, ...next } as const;
      });

      if (outcome.kind === 'disabled') throw new AppError(403, 'ACCOUNT_DISABLED');
      if (outcome.kind !== 'ok') throw new AppError(401, 'UNAUTHORIZED');
      return tokenPair(outcome.userId, outcome.session.id, outcome.refreshToken);
    },

    /** Idempotent. Logging out frees the device slot (max 2 devices are *signed in* at once). */
    async logout(token: string): Promise<void> {
      const session = await db.session.findUnique({
        where: { refreshTokenHash: hashRefreshToken(token) },
      });
      if (!session) return;
      await db.$transaction(async (tx) => {
        await lockUser(tx, session.userId);
        await revokeDeviceSessions(tx, session.userId, session.deviceId);
        await tx.device.deleteMany({
          where: { userId: session.userId, deviceId: session.deviceId },
        });
      });
    },

    // =============== H. password reset ===============

    /** Always succeeds, so it does not reveal which emails have accounts. */
    async forgotPassword(email: string): Promise<void> {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.status !== 'ACTIVE') return;
      try {
        await db.$transaction(async (tx) => {
          await lockUser(tx, user.id);
          await issueCode(tx, user, 'RESET');
        });
      } catch (err) {
        if (err instanceof AppError && err.code === 'RESEND_COOLDOWN') return;
        throw err;
      }
    },

    async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
      const user = await db.user.findUnique({ where: { email } });
      if (!user || user.status !== 'ACTIVE') throw new AppError(400, 'CODE_INVALID');
      const row = await checkCode(user.id, 'RESET', code);
      const passwordHash = await hashPassword(newPassword);
      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        await useCode(tx, row.id);
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await revokeUserSessions(tx, user.id);
      });
    },

    // =============== H. account (authenticated) ===============

    async changePassword(
      user: User,
      sessionId: string,
      currentPassword: string,
      newPassword: string,
    ): Promise<void> {
      if (!user.passwordHash || !(await verifyPassword(user.passwordHash, currentPassword))) {
        throw new AppError(401, 'INVALID_CREDENTIALS');
      }
      const passwordHash = await hashPassword(newPassword);
      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
        await revokeUserSessions(tx, user.id, sessionId);
      });
    },

    async requestEmailChange(user: User, newEmail: string, password: string): Promise<void> {
      if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
        throw new AppError(401, 'INVALID_CREDENTIALS');
      }
      if (newEmail === user.email) throw new AppError(400, 'VALIDATION_ERROR');
      await assertEmailFree(newEmail, user.id);
      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        await issueCode(tx, user, 'CHANGE_EMAIL', { newEmail });
      });
    },

    async confirmEmailChange(user: User, code: string): Promise<UserDto> {
      const row = await checkCode(user.id, 'CHANGE_EMAIL', code);
      const newEmail = row.newEmail;
      if (!newEmail) throw new AppError(400, 'CODE_INVALID');
      try {
        const updated = await db.$transaction(async (tx) => {
          await lockUser(tx, user.id);
          await useCode(tx, row.id);
          return tx.user.update({
            where: { id: user.id },
            data: {
              email: newEmail,
              emailVerifiedAt: new Date(),
              // The default username is the email, so it follows the email.
              ...(user.username === user.email ? { username: newEmail } : {}),
            },
          });
        });
        return toUserDto(updated);
      } catch (err) {
        if (isUniqueViolation(err)) throw new AppError(409, 'EMAIL_TAKEN');
        throw err;
      }
    },

    async listDevices(userId: string, currentDeviceId: string) {
      const devices = await db.device.findMany({
        where: { userId },
        orderBy: { lastSeenAt: 'desc' },
      });
      return devices.map((d) => ({ ...toDeviceDto(d), current: d.deviceId === currentDeviceId }));
    },

    /**
     * Stores (or clears, with null) the Expo push token of the calling session's device. A token
     * belongs to one device: the same phone signing in as another user moves it, so the old
     * account stops getting pushes meant for this phone.
     */
    async setPushToken(userId: string, deviceId: string, pushToken: string | null): Promise<void> {
      await db.$transaction(async (tx) => {
        const device = await tx.device.findUnique({
          where: { userId_deviceId: { userId, deviceId } },
          select: { id: true },
        });
        if (!device) throw new AppError(404, 'NOT_FOUND');
        if (pushToken) {
          await tx.device.updateMany({
            where: { pushToken, id: { not: device.id } },
            data: { pushToken: null },
          });
        }
        await tx.device.update({ where: { id: device.id }, data: { pushToken } });
      });
    },

    async removeDevice(user: User, id: string, password: string): Promise<void> {
      if (!user.passwordHash || !(await verifyPassword(user.passwordHash, password))) {
        throw new AppError(401, 'INVALID_CREDENTIALS');
      }
      await db.$transaction(async (tx) => {
        await lockUser(tx, user.id);
        const device = await tx.device.findFirst({ where: { id, userId: user.id } });
        if (!device) throw new AppError(404, 'NOT_FOUND');
        await tx.device.delete({ where: { id: device.id } });
        await revokeDeviceSessions(tx, user.id, device.deviceId);
      });
    },

    /** Soft delete: anonymize personal data, revoke sessions, keep subscriptions and payments. */
    async deleteAccount(userId: string): Promise<void> {
      await db.$transaction(async (tx) => {
        await lockUser(tx, userId);
        const done = await tx.user.updateMany({
          where: { id: userId, status: { not: 'DELETED' } },
          data: {
            status: 'DELETED',
            deletedAt: new Date(),
            username: `deleted-${userId}`,
            email: `deleted-${userId}@deleted.invalid`,
            emailVerifiedAt: null,
            passwordHash: null,
            totpSecret: null,
            firstName: 'Устгасан',
            lastName: 'Хэрэглэгч',
            phone: '',
          },
        });
        if (done.count !== 1) return; // already deleted: nothing more to do
        await revokeUserSessions(tx, userId);
        await tx.device.deleteMany({ where: { userId } });
        await tx.authIdentity.deleteMany({ where: { userId } });
        await tx.emailCode.deleteMany({ where: { userId } });
      });
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
