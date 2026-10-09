import { isAbsolute } from 'node:path';
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const csv = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);

/** Settings that media features (covers, playback, uploads) cannot work without. */
const BUNNY_KEYS = [
  'BUNNY_STORAGE_ZONE',
  'BUNNY_STORAGE_API_KEY',
  'BUNNY_PULL_ZONE_HOST',
  'BUNNY_CDN_TOKEN_KEY',
] as const;

export const missingBunnyKeys = (env: Partial<Record<(typeof BUNNY_KEYS)[number], unknown>>) =>
  BUNNY_KEYS.filter((k) => !env[k]);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default('0.0.0.0'),
    PUBLIC_BASE_URL: z.url(),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    TRUST_PROXY: bool.default(false),
    CORS_ORIGINS: csv,
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW: z.string().default('1 minute'),
    SERVE_STATIC: bool.default(false),
    LOG_FILE: z.preprocess(emptyToUndefined, z.string().optional()),
    LOG_FILE_MAX_SIZE: z.string().default('20m'),
    LOG_FILE_COUNT: z.coerce.number().int().positive().default(14),

    ALERT_EMAILS: csv.pipe(z.array(z.email())),
    ALERT_THROTTLE_MINUTES: z.coerce.number().int().positive().default(60),

    DATABASE_URL: z.string().regex(/^mysql:\/\//, 'must be a mysql:// URL'),

    JOB_WORKER_ENABLED: bool.default(true),
    JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
    CRON_SECRET: z.string().min(32),

    SOCIAL_LOGIN: bool.default(false),
    /** Google OAuth client IDs (web, iOS and Android) accepted as the ID token audience. */
    GOOGLE_CLIENT_IDS: csv,
    /** Apple audiences: the iOS bundle ID and, for web, the Services ID. */
    APPLE_CLIENT_IDS: csv,

    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** Login/register/code endpoints: attempts per window, per IP and per identifier. */
    AUTH_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(100),
    AUTH_RATE_LIMIT_IDENTIFIER_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

    // Bunny (ADR-0004/0005). Optional here; code that needs them calls requireBunny().
    BUNNY_STORAGE_ZONE: z.preprocess(emptyToUndefined, z.string().optional()),
    BUNNY_STORAGE_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    /** Storage region prefix: empty or "de" = Frankfurt, else uk, ny, la, sg, se, br, jh, syd. */
    BUNNY_STORAGE_REGION: z.preprocess(
      emptyToUndefined,
      z.enum(['de', 'uk', 'ny', 'la', 'sg', 'se', 'br', 'jh', 'syd']).optional(),
    ),
    /** Pull zone hostname without scheme, e.g. ongod-dev.b-cdn.net. */
    BUNNY_PULL_ZONE_HOST: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i, 'hostname only, no scheme or path')
        .optional(),
    ),
    BUNNY_CDN_TOKEN_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

    // Bank transfer details shown in the portal (SPEC D). Required in production.
    BANK_NAME: z.preprocess(emptyToUndefined, z.string().optional()),
    BANK_ACCOUNT: z.preprocess(emptyToUndefined, z.string().optional()),
    BANK_ACCOUNT_HOLDER: z.preprocess(emptyToUndefined, z.string().optional()),

    /** Private folder for payment receipt images. Never inside the static (public) folders. */
    RECEIPTS_DIR: z.string().min(1).default('./data/receipts'),
    /**
     * Private working folder for uploads: tus chunks, finished audio waiting for Bunny, covers
     * waiting for Bunny. Never inside a static folder. Without Bunny settings (development only)
     * the "stored" files are kept under <UPLOADS_DIR>/published instead.
     */
    UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
    /** Name shown in the authenticator app for admin TOTP. */
    TOTP_ISSUER: z.string().min(1).max(50).default('Ongod Admin'),
    /** Expo push access token; only needed if "enhanced push security" is on in the Expo project. */
    EXPO_ACCESS_TOKEN: z.preprocess(emptyToUndefined, z.string().optional()),

    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().positive(),
    SMTP_SECURE: bool.default(false),
    SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
    MAIL_FROM: z.string().min(3),

    SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
    SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  })
  .superRefine((env, ctx) => {
    // Without Bunny there are no covers and no playback: refuse to start in production.
    if (env.NODE_ENV === 'production') {
      // The .env.example placeholders are long enough to pass min(32) but are public (audit C-08).
      for (const key of ['JWT_ACCESS_SECRET', 'CRON_SECRET'] as const) {
        if (/replace|change-me|example/i.test(env[key])) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'placeholder value in production' });
        }
      }
      // Relative folders depend on the working directory and can be lost on redeploy (audit F-08).
      for (const key of ['RECEIPTS_DIR', 'UPLOADS_DIR'] as const) {
        if (!isAbsolute(env[key])) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: 'must be an absolute path in production',
          });
        }
      }
      for (const key of missingBunnyKeys(env)) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
      }
      for (const key of ['BANK_NAME', 'BANK_ACCOUNT', 'BANK_ACCOUNT_HOLDER'] as const) {
        if (!env[key]) {
          ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
        }
      }
    }
    // Apple 4.8: Google on iOS needs Sign in with Apple, so the flag needs both (ADR-0009).
    if (!env.SOCIAL_LOGIN) return;
    for (const key of ['GOOGLE_CLIENT_IDS', 'APPLE_CLIENT_IDS'] as const) {
      if (env[key].length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'required when SOCIAL_LOGIN is true',
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

/** The Bunny settings every media feature needs; throws naming the missing keys (never values). */
export function requireBunny(env: Env) {
  const missing = missingBunnyKeys(env);
  if (missing.length > 0) throw new Error(`Missing Bunny env: ${missing.join(', ')}`);
  return {
    storageZone: env.BUNNY_STORAGE_ZONE!,
    storageApiKey: env.BUNNY_STORAGE_API_KEY!,
    storageRegion: env.BUNNY_STORAGE_REGION ?? 'de',
    pullZoneHost: env.BUNNY_PULL_ZONE_HOST!,
    tokenKey: env.BUNNY_CDN_TOKEN_KEY!,
  };
}

/**
 * Parses env and throws with the names of invalid keys (never their values).
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment:\n${problems}`);
  }
  return result.data;
}

/** Fail fast: print what is wrong and exit before anything else starts. */
export function loadEnvOrExit(): Env {
  try {
    return parseEnv();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
}
