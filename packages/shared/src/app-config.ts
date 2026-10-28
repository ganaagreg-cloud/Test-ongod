import { z } from 'zod';

/** Dotted numeric version, e.g. "1.4.0". */
export const semverSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

/**
 * GET /v1/app-config. Public, read by the mobile app on start.
 * Must never contain prices, plans or payment details (mobile shows no payment UI).
 */
export const appConfigResponseSchema = z.object({
  minVersion: z.object({ ios: semverSchema, android: semverSchema }),
  socialLogin: z.boolean(),
  /** Published contact for the stores' user-content rules (SPEC L). Null = no contact line under the comments (a store build needs one, ADR-0062). */
  supportEmail: z.string().nullable(),
});

export type AppConfigResponse = z.infer<typeof appConfigResponseSchema>;

/** AppConfig table keys. */
export const appConfigKeys = {
  minVersionIos: 'min_version_ios',
  minVersionAndroid: 'min_version_android',
} as const;
