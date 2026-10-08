import { z } from 'zod';

/** Error codes the API can return. Clients switch on these, never on messages. */
export const errorCodes = [
  'NOT_FOUND',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RATE_LIMITED',
  'BAD_REQUEST',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
  // Auth (SPEC A, B, H)
  'INVALID_CREDENTIALS',
  'EMAIL_TAKEN',
  'USERNAME_TAKEN',
  'CODE_INVALID',
  'CODE_EXPIRED',
  'CODE_ATTEMPTS_EXCEEDED',
  'RESEND_COOLDOWN',
  'DEVICE_LIMIT',
  'ACCOUNT_DISABLED',
  // Social login (SPEC C)
  'LINK_REQUIRED',
  'PROFILE_INCOMPLETE',
  'SOCIAL_TOKEN_INVALID',
  'SOCIAL_EMAIL_REQUIRED',
  'IDENTITY_TAKEN',
  'LAST_LOGIN_METHOD',
  // Playback (SPEC G)
  'NO_ACCESS',
  'DEVICE_NOT_REGISTERED',
  'MEDIA_NOT_READY',
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Every API error response has this shape: { error: { code, message } }. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    /** Extra data for a few codes, e.g. the device list for DEVICE_LIMIT. */
    details: z.unknown().optional(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
