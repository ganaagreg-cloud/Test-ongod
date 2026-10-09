import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApp, type AppDeps } from '../src/app';
import { createDb } from '../src/db';
import { parseEnv, type Env } from '../src/env';
import { createLocalMediaStorage, uploadDirs, type MediaRuntime } from '../src/media/storage';
import { useTestDatabase } from './test-env';

const url = useTestDatabase();

export const testDb = createDb(url);

export const CRON_SECRET = 'test-cron-secret-0123456789abcdef0123';

/** Fake Bunny settings: URLs are signed for real, nothing talks to Bunny. */
export const BUNNY_TEST = {
  BUNNY_STORAGE_ZONE: 'test-zone',
  BUNNY_STORAGE_API_KEY: 'test-storage-password',
  BUNNY_PULL_ZONE_HOST: 'test-zone.b-cdn.net',
  BUNNY_CDN_TOKEN_KEY: 'test-token-key-0123456789abcdef',
};

/** Fake bank account and a throw-away receipts folder (never the real ./data/receipts). */
export const PAYMENT_TEST = {
  BANK_NAME: 'Хаан банк',
  BANK_ACCOUNT: '5000123456',
  BANK_ACCOUNT_HOLDER: 'Бат Болд',
  RECEIPTS_DIR: join(tmpdir(), 'ongod-test-receipts'),
};

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
    ...BUNNY_TEST,
    ...PAYMENT_TEST,
    ...overrides,
  });
}

/** A media runtime in a throw-away folder: "storage" is a local directory, never Bunny. */
export function testMediaRuntime(): MediaRuntime {
  const dirs = uploadDirs(mkdtempSync(join(tmpdir(), 'ongod-media-')));
  return { dirs, storage: createLocalMediaStorage(dirs.published) };
}

export function testApp(deps: Partial<AppDeps> = {}) {
  return buildApp({ env: testEnv(), db: testDb, mediaRuntime: testMediaRuntime(), ...deps });
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
