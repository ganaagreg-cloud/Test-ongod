import { z } from 'zod';

// Request/response schemas for /v1/auth and /v1/me (SPEC workflows A, B, H).
// Identifiers are normalised here (trimmed, lowercased) so every client and the API agree.

export const MAX_DEVICES = 2;
export const CODE_LENGTH = 6;

const normalizedString = (max: number) => z.string().trim().toLowerCase().min(1).max(max);

export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

/** 3-30 chars of [a-z0-9._], or an email (SPEC A). Case-insensitive. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine(
    (v) => /^[a-z0-9._]{3,30}$/.test(v) || (v.length <= 254 && z.email().safeParse(v).success),
    { message: 'invalid username' },
  );

export const passwordSchema = z.string().min(8).max(128);
export const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);
export const nameSchema = z.string().trim().min(1).max(100);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s-]{6,20}$/);

export const platformSchema = z.enum(['ios', 'android', 'web', 'admin']);
export const deviceIdSchema = z.string().trim().min(8).max(128);

const deviceInfo = {
  deviceId: deviceIdSchema,
  platform: platformSchema,
  model: z.string().trim().max(100).optional(),
};

// ---- DTOs ----

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  status: z.enum(['PENDING_PROFILE', 'ACTIVE', 'DISABLED', 'DELETED']),
  role: z.enum(['USER', 'ADMIN', 'OWNER']),
  /** ISO time the access ends, or null when there is no access. */
  accessUntil: z.iso.datetime().nullable(),
});
export type UserDto = z.infer<typeof userSchema>;

export const deviceSchema = z.object({
  id: z.string(),
  platform: z.string(),
  model: z.string().nullable(),
  lastSeenAt: z.iso.datetime(),
});
export type DeviceDto = z.infer<typeof deviceSchema>;

export const tokenPairSchema = z.object({
  accessToken: z.string(),
  /**
   * Opaque refresh token for the native apps. Absent for web (`platform: "web"`): the portal's
   * refresh token travels only in an httpOnly cookie that scripts cannot read (ADR-0026).
   */
  refreshToken: z.string().optional(),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int().positive(),
});
export type TokenPair = z.infer<typeof tokenPairSchema>;

// ---- /v1/auth ----

export const registerRequestSchema = z.object({
  lastName: nameSchema,
  firstName: nameSchema,
  phone: phoneSchema,
  email: emailSchema,
  /** Optional; defaults to the email. */
  username: usernameSchema.optional(),
  password: passwordSchema,
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export const registerResponseSchema = z.object({ user: userSchema });

export const verifyEmailRequestSchema = z.object({ email: emailSchema, code: codeSchema });
export const resendCodeRequestSchema = z.object({ email: emailSchema });

export const loginRequestSchema = z.object({
  /** Username or email. */
  identifier: normalizedString(254),
  password: z.string().min(1).max(128),
  ...deviceInfo,
  /** After DEVICE_LIMIT: the Device.id to remove (the password above is the confirmation). */
  removeDeviceId: z.string().min(1).max(64).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export const loginResponseSchema = tokenPairSchema.extend({ user: userSchema });

/** `refreshToken` is omitted by the web portal: the httpOnly cookie carries it. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
  deviceId: deviceIdSchema,
  /** Which web app's cookie to use: the portal ("web", default) or the admin ("admin"). */
  platform: z.enum(['web', 'admin']).optional(),
});
export const logoutRequestSchema = z.object({
  refreshToken: z.string().min(20).max(200).optional(),
  platform: z.enum(['web', 'admin']).optional(),
});

export const forgotPasswordRequestSchema = z.object({ email: emailSchema });
export const resetPasswordRequestSchema = z.object({
  email: emailSchema,
  code: codeSchema,
  newPassword: passwordSchema,
});

/** Details of the DEVICE_LIMIT error: the devices the user can remove. */
export const deviceLimitDetailsSchema = z.object({ devices: z.array(deviceSchema) });

// ---- /v1/me ----

export const meResponseSchema = z.object({ user: userSchema });

export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export const changeEmailRequestSchema = z.object({
  newEmail: emailSchema,
  password: z.string().min(1).max(128),
});
export const changeEmailVerifyRequestSchema = z.object({ code: codeSchema });

export const devicesResponseSchema = z.object({
  devices: z.array(deviceSchema.extend({ current: z.boolean() })),
});
export const removeDeviceRequestSchema = z.object({ password: z.string().min(1).max(128) });

// ---- Social login (SPEC C, behind SOCIAL_LOGIN) ----

export const authProviderSchema = z.enum(['GOOGLE', 'APPLE']);

const idTokenSchema = z.string().min(20).max(8192);
const nonceSchema = z.string().min(8).max(256);

/** POST /v1/auth/google. The nonce is optional for Google, checked when sent. */
export const googleLoginRequestSchema = z.object({
  idToken: idTokenSchema,
  nonce: nonceSchema.optional(),
  ...deviceInfo,
  /** After DEVICE_LIMIT: the Device.id to remove. The valid ID token is the confirmation. */
  removeDeviceId: z.string().min(1).max(64).optional(),
});

/** POST /v1/auth/apple. The nonce is required. */
export const appleLoginRequestSchema = googleLoginRequestSchema.extend({ nonce: nonceSchema });

/** POST /v1/auth/complete-profile: the mandatory step for PENDING_PROFILE users. */
export const completeProfileRequestSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  lastName: nameSchema,
  firstName: nameSchema,
  phone: phoneSchema,
});
export const completeProfileResponseSchema = z.object({ user: userSchema });

export const identitySchema = z.object({
  id: z.string(),
  provider: authProviderSchema,
  email: z.string(),
});
export type IdentityDto = z.infer<typeof identitySchema>;
export const identitiesResponseSchema = z.object({ identities: z.array(identitySchema) });

/** POST /v1/me/link/google and /v1/me/link/apple. */
export const linkGoogleRequestSchema = z.object({
  idToken: idTokenSchema,
  nonce: nonceSchema.optional(),
});
export const linkAppleRequestSchema = z.object({ idToken: idTokenSchema, nonce: nonceSchema });
export const linkResponseSchema = z.object({ identity: identitySchema });
