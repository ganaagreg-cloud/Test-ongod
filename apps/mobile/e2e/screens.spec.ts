import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from '@playwright/test';

// Screenshots of the kit gallery (/dev/ui) on both surfaces, for docs/screens/ (design review).
// Needs Metro on MOBILE_WEB_URL (default http://localhost:8081). Run:
//   pnpm exec playwright test e2e/screens.spec.ts
// Output: docs/screens/kit-<surface>-<section>.png
const OUT = `${resolve(process.cwd(), '../../docs/screens')}/`;
const SECTIONS = [
  'type',
  'colors',
  'buttons',
  'inputs',
  'selection',
  'code',
  'episodes',
  'home',
  'nav',
  'feedback',
  'motion',
  'icons',
];

test.describe.configure({ mode: 'serial' });

for (const surface of ['dark', 'cream'] as const) {
  for (const section of SECTIONS) {
    test(`kit ${surface} ${section}`, async ({ page }) => {
      mkdirSync(OUT, { recursive: true });
      await page.setViewportSize({
        width: 390,
        height: section === 'type' || section === 'episodes' ? 1500 : 1000,
      });
      await page.goto(`/dev/ui?surface=${surface}&section=${section}`);
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${OUT}kit-${surface}-${section}.png` });
    });
  }
}
