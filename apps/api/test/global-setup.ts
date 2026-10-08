import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { useTestDatabase } from './test-env';

/**
 * Once per run: apply pending migrations to the test database (non-destructive).
 * Rows are wiped before each test by test/setup.ts. If the test schema ever drifts
 * (e.g. an edited migration), reset it by hand: see README "Tests".
 */
export default function setup() {
  useTestDatabase();
  const apiDir = fileURLToPath(new URL('..', import.meta.url));
  execFileSync('prisma', ['migrate', 'deploy'], {
    cwd: apiDir,
    env: process.env,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
}
