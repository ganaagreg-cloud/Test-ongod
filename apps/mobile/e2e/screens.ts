import { join } from 'node:path';

/**
 * Where e2e screenshots go (ADR-0045). By default an ignored folder, test-results/screens/ at the
 * repo root, so a test run leaves no changed files in git. With UPDATE_SCREENS=1 they go to the
 * tracked docs/screens/ (design review), e.g. `UPDATE_SCREENS=1 pnpm test:e2e`.
 */
export const screenPath = (name: string) =>
  join(
    __dirname,
    '../../..',
    process.env.UPDATE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens',
    `${name}.png`,
  );
