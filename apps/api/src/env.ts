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
    AUTH_RATE_LIMIT_IP_MAX: z.coerce.number().int().positive().default(30),
    AUTH_RATE_LIMIT_IDENTIFIER_MAX: z.coerce.number().int().positive().default(10),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(900),

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
