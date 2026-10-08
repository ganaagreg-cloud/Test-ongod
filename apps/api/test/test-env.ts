import { existsSync } from 'node:fs';

/**
 * Loads the root .env and points DATABASE_URL at TEST_DATABASE_URL.
 * Refuses to run unless the database name ends in _test: the test database is wiped.
 */
export function useTestDatabase(): string {
  const rootEnv = new URL('../../../.env', import.meta.url);
  if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith('_test')) {
    throw new Error(`TEST_DATABASE_URL must point at a database ending in _test, got "${dbName}"`);
  }

  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  return url;
}
