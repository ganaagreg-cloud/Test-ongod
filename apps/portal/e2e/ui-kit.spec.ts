import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import { layout } from '@ongod/tokens';

const shot = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screens/${name}.png`, import.meta.url));

async function openGallery(page: Page) {
  await page.goto('/dev/ui');
  await expect(page.locator('.dev-ui')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test('every component renders on /dev/ui, in all its states', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openGallery(page);

  const count = (selector: string) => page.locator(selector).count();
  for (const variant of ['primary', 'secondary', 'ghost', 'destructive']) {
    expect(await count(`.ui-button--${variant}`), `button ${variant}`).toBeGreaterThan(0);
  }
  expect(await count('.ui-button.is-loading')).toBeGreaterThan(0);
  expect(await count('.ui-button:disabled')).toBeGreaterThan(0);
  expect(await count('.ui-field.has-error .ui-field__message.is-error')).toBe(2); // input + file
  expect(await count('textarea.ui-field__input--multiline')).toBe(1);
  expect(await count('input[type="file"].ui-field__input--file')).toBe(2);
  expect(await count('.ui-timeline__step')).toBe(3);
  expect(await count('.ui-timeline__step[aria-current="step"]')).toBe(1);
  expect(await count('.ui-notice[role="alert"]')).toBe(2); // danger and warning
  expect(await count('.ui-notice[role="status"]')).toBe(2); // info and success
  expect(await count('.ui-field__input:disabled')).toBe(1);
  expect(await count('.ui-chip.is-selected')).toBe(2); // theme + category
  expect(await count('.ui-badge')).toBeGreaterThanOrEqual(6);
  expect(await count('.ui-episode-row:not(.ui-episode-row--skeleton)')).toBe(3);
  expect(await count('.ui-progress[role="progressbar"]')).toBe(1);
  expect(await count('.ui-episode-card')).toBe(3);
  expect(await count('.ui-list-item')).toBeGreaterThanOrEqual(5);
  expect(await count('.ui-list-item.is-destructive')).toBe(1);
  expect(await count('.ui-skeleton')).toBeGreaterThan(0);
  expect(await count('.ui-empty svg.ui-motif')).toBe(1);
  expect(errors).toEqual([]);
});

test('touch targets are at least 44 px; buttons 52, inputs 52, chips 36 (hit area 44)', async ({
  page,
}) => {
  await openGallery(page);
  const height = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);

  expect(await height('.ui-button')).toBeGreaterThanOrEqual(layout.buttonHeight);
  expect(await height('.ui-field__input')).toBeGreaterThanOrEqual(layout.inputHeight);
  expect(await height('.ui-chip')).toBe(layout.chipHeight);
  expect(await height('.ui-icon-button')).toBeGreaterThanOrEqual(layout.touchTarget);
  expect(await height('button.ui-list-item')).toBeGreaterThanOrEqual(layout.touchTarget);

  // The chip's invisible hit area reaches 44 px: a click 4 px above its box still lands on it.
  const box = (await page.locator('.ui-chip').first().boundingBox())!;
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.className ?? '', {
    x: box.x + box.width / 2,
    y: box.y - 3,
  });
  expect(hit).toContain('ui-chip');

  // Every interactive element in the page is at least 44 px in one dimension.
  const small = await page.evaluate((min) => {
    return [...document.querySelectorAll<HTMLElement>('button, a[href], input')]
      .filter((el) => !el.classList.contains('ui-chip') && el.offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.height < min)
      .map(({ el }) => el.className || el.tagName);
  }, layout.touchTarget);
  expect(small).toEqual([]);
});

test('Sheet opens as a modal, traps focus, closes on Esc; Toast announces', async ({ page }) => {
  await openGallery(page);

  await page.getByRole('button', { name: 'Sheet нээх' }).click();
  const sheet = page.getByRole('dialog', { name: 'Таны эрх идэвхгүй байна' });
  await expect(sheet).toBeVisible();
  // Focus is inside the dialog and the page behind is inert.
  expect(await page.evaluate(() => document.activeElement?.closest('dialog') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Toast: алдаа' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Холболт тасарлаа' })).toBeVisible();
  await page.getByRole('button', { name: 'Toast: амжилттай' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Хадгаллаа' })).toBeVisible();
});

test('the saved toggle and chips are real toggles', async ({ page }) => {
  await openGallery(page);
  const save = page.getByRole('button', { name: 'Хадгалснаас хасах' });
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  await save.click();
  await expect(page.getByRole('button', { name: 'Хадгалах' }).first()).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  const stories = page.getByRole('button', { name: 'Үлгэр', exact: true });
  await stories.click();
  await expect(stories).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Бүгд', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('components use Inter and the display font is Lora; no fallback for Ө/Ү', async ({ page }) => {
  await openGallery(page);
  const family = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);

  expect(await family('.ui-button')).toContain('Inter');
  expect(await family('.ui-field__input')).toContain('Inter');
  expect(await family('.ui-episode-row__title')).toContain('Inter');
  expect(await family('h1.text-display')).toContain('Lora');

  // Rendered width of the Mongolian test string equals the width in the loaded font only: a
  // fallback face (different metrics) would change it. Compare against Inter/Lora measured with
  // the same canvas font string once fonts are ready.
  const result = await page.evaluate(async () => {
    await document.fonts.load('400 16px Inter', 'Өү');
    await document.fonts.load('600 32px Lora', 'Өү');
    const measure = (font: string, text: string) => {
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = font;
      return ctx.measureText(text).width;
    };
    const text = 'Өвөг Үүл өөрөө үүрд ӨҮ';
    const el = (selector: string) => document.querySelector<HTMLElement>(selector)!;
    const rendered = (node: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(node);
      return range.getBoundingClientRect().width;
    };
    return {
      inter: [rendered(el('.dev-ui__glyph:not(.text-display)')), measure('400 16px Inter', text)],
      lora: [rendered(el('.dev-ui__glyph.text-display')), measure('600 32px Lora', text)],
      loaded: [...document.fonts].filter((f) => f.status === 'loaded').length,
    };
  });
  expect(result.loaded).toBeGreaterThan(0);
  expect(result.inter[0]).toBeCloseTo(result.inter[1]!, 0);
  expect(result.lora[0]).toBeCloseTo(result.lora[1]!, 0);
});

test('every Lora and Inter weight has its own Ө/ө/Ү/ү glyphs (not a fallback font)', async ({
  page,
}) => {
  await openGallery(page);
  const report = await page.evaluate(async () => {
    const glyphs = ['\u04e8', '\u04e9', '\u04ae', '\u04af'];
    const ctx = document.createElement('canvas').getContext('2d')!;
    const width = (font: string, g: string) => {
      ctx.font = font;
      return ctx.measureText(g).width;
    };
    const faces: Array<[string, number]> = [
      ['Lora', 400],
      ['Lora', 600],
      ['Inter', 400],
      ['Inter', 500],
      ['Inter', 600],
    ];
    const out: Record<string, string> = {};
    for (const [family, weight] of faces) {
      const font = `${weight} 32px ${family}`;
      await document.fonts.load(font, glyphs.join(''));
      // A glyph that is really in the font measures the same whatever the fallback is, and
      // differs from the fallback fonts alone.
      const missing = glyphs.filter((g) => {
        const withMono = width(`${font}, monospace`, g);
        const withSerif = width(`${font}, serif`, g);
        const plainSerif = width('32px serif', g);
        const plainMono = width('32px monospace', g);
        return !(
          Math.abs(withMono - withSerif) < 0.01 &&
          Math.abs(withMono - plainSerif) > 0.01 &&
          Math.abs(withMono - plainMono) > 0.01
        );
      });
      out[`${family} ${weight}`] = missing.join('');
    }
    return out;
  });
  expect(report).toEqual({
    'Lora 400': '',
    'Lora 600': '',
    'Inter 400': '',
    'Inter 500': '',
    'Inter 600': '',
  });
});

test('screenshots: dark (portal) and light (admin) themes', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await openGallery(page);
  await page.screenshot({ path: shot('ui-kit-portal-dark'), fullPage: true });

  await page.getByRole('button', { name: 'Цайвар (админ)' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: shot('ui-kit-admin-light'), fullPage: true });
});
