import { defineConfig } from 'vitest/config';

/** Tests that need no MySQL (no global setup, no per-test DB wipe). Run with `pnpm test:unit`. */
export default defineConfig({
  test: {
    include: ['test/bunny-token.test.ts', 'test/catalog-cursor.test.ts'],
    testTimeout: 20_000,
  },
});
