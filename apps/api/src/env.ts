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

// Bunny Stream: video episodes (ADR-0038). Separate from the storage keys above.
const STREAM_KEYS = [
  'BUNNY_STREAM_LIBRARY_ID',
  'BUNNY_STREAM_API_KEY',
  'BUNNY_STREAM_CDN_HOSTNAME',
  'BUNNY_STREAM_TOKEN_KEY',
] as const;

export const missingStreamKeys = (env: Partial<Record<(typeof STREAM_KEYS)[number], unknown>>) =>
  STREAM_KEYS.filter((k) => !env[k]);

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

    /** Published contact for the stores' user-content rules (SPEC L, ADR-0061). Empty = no comments in the app. */
    SUPPORT_EMAIL: z.preprocess(emptyToUndefined, z.email().optional()),
    /** Comma-separated words that make a comment be refused (ADR-0061). Empty = only the link filter. */
    COMMENT_BANNED_WORDS: csv,

    DATABASE_URL: z.string().regex(/^mysql:\/\//, 'must be a mysql:// URL'),

    JOB_WORKER_ENABLED: bool.default(true),
    JOB_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2000),
    /** A RUNNING job older than this (from its own start) is reclaimed (ADR-0045). 2 hours. */
    JOB_LOCK_TIMEOUT_MS: z.coerce.number().int().positive().default(7_200_000),
    CRON_SECRET: z.string().min(32),

    SOCIAL_LOGIN: bool.default(false),
    /** Google OAuth client IDs (web, iOS and Android) accepted as the ID token audience. */
    GOOGLE_CLIENT_IDS: csv,
    /** Apple audiences: the iOS bundle ID and, for web, the Services ID. */
    APPLE_CLIENT_IDS: csv,

    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    /** A just-rotated refresh token sent again within this many seconds is a lost response, not theft (ADR-0045). 0 disables it. */
    REFRESH_GRACE_SECONDS: z.coerce.number().int().min(0).default(10),
    /**
     * Login/register/code endpoints: attempts per window, per IP, per identifier and IP, and
     * per identifier alone (the higher ceiling, across all IPs; ADR-0045).
     */
    AUTH_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(30),
    AUTH_RATE_LIMIT_IDENTIFIER_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_IDENTIFIER_CEILING: z.coerce.number().int().positive().default(100),
    /** Token refreshes per device per window; no per-IP bucket (ADR-0054). */
    AUTH_REFRESH_DEVICE_MAX: z.coerce.number().int().positive().default(60),
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
    /** Stream video library id (a number in the dashboard). */
    BUNNY_STREAM_LIBRARY_ID: z.preprocess(emptyToUndefined, z.string().regex(/^\d+$/).optional()),
    BUNNY_STREAM_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    /** The library's CDN hostname without scheme, e.g. vz-abc123.b-cdn.net. */
    BUNNY_STREAM_CDN_HOSTNAME: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .regex(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i, 'hostname only, no scheme or path')
        .optional(),
    ),
    /** Token Authentication key of the library's pull zone (signed HLS URLs). */
    BUNNY_STREAM_TOKEN_KEY: z.preprocess(emptyToUndefined, z.string().optional()),

    // QPay through Wire (ADR-0041). Without WIRE_API_KEY the portal uses a mock checkout, which
    // is refused in production unless ALLOW_MOCK_PAYMENTS=1 (never set that on the live site).
    WIRE_API_KEY: z.preprocess(emptyToUndefined, z.string().optional()),
    WIRE_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().optional()),
    /** `sandbox` while testing with an sk_test key; the live operator id (e.g. qpay) in production. */
    WIRE_ALLOWED_OPERATORS: csv.transform((v) => (v.length > 0 ? v : ['sandbox'])),
    ALLOW_MOCK_PAYMENTS: bool.default(false),
    /** Cron payment sync (ADR-0047): no new Wire call starts after this much of a tick. 20 s. */
    WIRE_SYNC_BUDGET_MS: z.coerce.number().int().positive().default(20_000),

    /**
     * Private working folder for uploads: tus chunks, finished audio waiting for Bunny, covers
     * waiting for Bunny. Never inside a static folder. Without Bunny settings (development only)
     * the "stored" files are kept under <UPLOADS_DIR>/published instead.
     */
    UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
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
      for (const key of [...missingBunnyKeys(env), ...missingStreamKeys(env)]) {
        ctx.addIssue({ code: 'custom', path: [key], message: 'required in production' });
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

/** The Bunny Stream settings video needs; throws naming the missing keys (never values). */
export function requireStream(env: Env) {
  const missing = missingStreamKeys(env);
  if (missing.length > 0) throw new Error(`Missing Bunny Stream env: ${missing.join(', ')}`);
  return {
    libraryId: env.BUNNY_STREAM_LIBRARY_ID!,
    apiKey: env.BUNNY_STREAM_API_KEY!,
    cdnHost: env.BUNNY_STREAM_CDN_HOSTNAME!,
    tokenKey: env.BUNNY_STREAM_TOKEN_KEY!,
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
