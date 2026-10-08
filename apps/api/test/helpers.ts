import { buildApp, type AppDeps } from '../src/app';
import { createDb } from '../src/db';
import { parseEnv, type Env } from '../src/env';
import { useTestDatabase } from './test-env';

const url = useTestDatabase();

export const testDb = createDb(url);

export const CRON_SECRET = 'test-cron-secret-0123456789abcdef0123';

export function testEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    PUBLIC_BASE_URL: 'http://localhost:3000',
    DATABASE_URL: url,
    CRON_SECRET,
    JWT_ACCESS_SECRET: 'test-jwt-secret-0123456789abcdef012345',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    MAIL_FROM: 'Онгод <no-reply@example.com>',
    CORS_ORIGINS: 'http://localhost:5173',
    ...overrides,
  });
}

export function testApp(deps: Partial<AppDeps> = {}) {
  return buildApp({ env: testEnv(), db: testDb, ...deps });
}

/**
 * Empties every table (children before parents). Uses Prisma deleteMany, not raw SQL,
 * so it stays portable. Add new models here.
 */
export async function resetDb(db = testDb) {
  await db.$transaction([
    db.auditLog.deleteMany(),
    db.notification.deleteMany(),
    db.savedEpisode.deleteMany(),
    db.playbackProgress.deleteMany(),
    db.mediaAsset.deleteMany(),
    db.episode.deleteMany(),
    db.category.deleteMany(),
    db.payment.deleteMany(),
    db.subscription.deleteMany(),
    db.plan.deleteMany(),
    db.emailCode.deleteMany(),
    db.device.deleteMany(),
    db.session.deleteMany(),
    db.authIdentity.deleteMany(),
    db.user.deleteMany(),
    db.job.deleteMany(),
    db.appConfig.deleteMany(),
  ]);
}
