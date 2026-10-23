import { expect, test } from '@playwright/test';
import { fontFamily, fontWeights, type FontRole } from '@ongod/tokens';
import { screenPath } from './screens';

const SAMPLE = 'ӨҮөү';
// Screenshots: test-results/screens/ by default, docs/screens/ with UPDATE_SCREENS=1 (screens.ts).
const screenshotPath = screenPath('font-check-web');

test('Lora and Inter render Mongolian Cyrillic (Ө/Ү) on web', async ({ page }) => {
  await page.goto('/dev/ui');
  // The page is lazy-loaded; fonts only start loading once its text is in the DOM.
  await expect(page.locator('.dev-ui')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);

  expect(await page.evaluate((s) => document.fonts.check('16px Inter', s), SAMPLE)).toBe(true);
  expect(await page.evaluate((s) => document.fonts.check('16px Lora', s), SAMPLE)).toBe(true);

  // fonts.check() is also true when no @font-face matches at all, so additionally require
  // that the face covering U+04E8 (Ө) is actually loaded for every family and weight.
  for (const role of Object.keys(fontWeights) as FontRole[]) {
    for (const weight of fontWeights[role]) {
      const loaded = await page.evaluate(
        ({ family, weight }) => {
          const covers = (range: string, cp: number) =>
            range.split(',').some((part) => {
              const [lo, hi = lo] = part.trim().replace(/^U\+/i, '').split('-');
              return cp >= parseInt(lo!, 16) && cp <= parseInt(hi!, 16);
            });
          return [...document.fonts].some(
            (f) =>
              f.family.replace(/['"]/g, '') === family &&
              f.weight === String(weight) &&
              covers(f.unicodeRange, 0x04e8) &&
              f.status === 'loaded',
          );
        },
        { family: fontFamily[role], weight },
      );
      expect(loaded, `${fontFamily[role]} ${weight} cyrillic-ext face loaded`).toBe(true);
    }
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
});
