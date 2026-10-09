import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Visual check of the mobile app's UI kit through Expo web. Needs Metro running
// (`pnpm dev:mobile:web`), so it only runs when MOBILE_WEB_URL is set:
//   MOBILE_WEB_URL=http://localhost:8081 pnpm test:e2e
const base = process.env.MOBILE_WEB_URL;
const shot = fileURLToPath(new URL('../../../docs/screens/ui-kit-mobile-web.png', import.meta.url));

test.skip(!base, 'set MOBILE_WEB_URL to run the mobile web check');

test('mobile /dev/ui: every component renders, fonts have Ө/Ү, no console errors', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto(`${base}/dev/ui`);
  await expect(page.getByText('Mongolian glyph test')).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.fonts.ready);

  // Sections of the kit.
  for (const title of [
    'Button',
    'Input',
    'Chip',
    'Badge',
    'EpisodeRow',
    'EpisodeCard',
    'ListItem',
    'Skeleton',
    'EmptyState',
    'Sheet and Toast',
    'Icons',
  ]) {
    await expect(page.getByRole('heading', { name: title, exact: true }), title).toBeAttached();
  }

  // The no-access sheet opens and closes.
  await page.getByRole('button', { name: 'Sheet нээх' }).click();
  await expect(page.getByText('Таны эрх идэвхгүй байна')).toBeVisible();
  await page.getByRole('button', { name: 'Эрхээ шалгах' }).click();
  await expect(page.getByText('Таны эрх идэвхгүй байна')).toBeHidden();

  // Every expo-font family has its own Ө/ө/Ү/ү glyphs.
  const missing = await page.evaluate(async () => {
    const glyphs = ['Ө', 'ө', 'Ү', 'ү'];
    const ctx = document.createElement('canvas').getContext('2d')!;
    const width = (font: string, g: string) => {
      ctx.font = font;
      return ctx.measureText(g).width;
    };
    const out: Record<string, string> = {};
    for (const family of [
      'Lora_400Regular',
      'Lora_600SemiBold',
      'Inter_400Regular',
      'Inter_500Medium',
      'Inter_600SemiBold',
    ]) {
      const font = `32px ${family}`;
      await document.fonts.load(font, glyphs.join(''));
      out[family] = glyphs
        .filter((g) => {
          const a = width(`${font}, monospace`, g);
          return !(
            Math.abs(a - width(`${font}, serif`, g)) < 0.01 &&
            Math.abs(a - width('32px serif', g)) > 0.01 &&
            Math.abs(a - width('32px monospace', g)) > 0.01
          );
        })
        .join('');
    }
    return out;
  });
  expect(missing).toEqual({
    Lora_400Regular: '',
    Lora_600SemiBold: '',
    Inter_400Regular: '',
    Inter_500Medium: '',
    Inter_600SemiBold: '',
  });

  // Expand the inner ScrollView so one screenshot shows the whole page.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll<HTMLElement>('div')) {
      const style = getComputedStyle(el);
      if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
        // Keep the app background once the scroll container is no longer the page.
        document.documentElement.style.background = style.backgroundColor;
        el.style.overflow = 'visible';
        el.style.height = 'auto';
        for (let p = el.parentElement; p; p = p.parentElement) {
          p.style.height = 'auto';
          p.style.overflow = 'visible';
        }
        break;
      }
    }
  });
  await page.screenshot({ path: shot, fullPage: true });
  expect(errors).toEqual([]);
});
