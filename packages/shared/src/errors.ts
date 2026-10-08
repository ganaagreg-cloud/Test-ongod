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
] as const;

export const errorCodeSchema = z.enum(errorCodes);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** Every API error response has this shape: { error: { code, message } }. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
