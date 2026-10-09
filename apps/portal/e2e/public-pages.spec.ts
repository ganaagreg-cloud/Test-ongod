import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const shot = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screens/portal-${name}.png`, import.meta.url));

// A phone-sized window: the portal is mobile first.
test.use({ viewport: { width: 390, height: 844 } });

const PAGES: Array<{ path: string; name: string; heading: string }> = [
  { path: '/', name: 'landing', heading: 'Онгод' },
  { path: '/plans', name: 'plans', heading: 'Эрх авах' },
  { path: '/login', name: 'login', heading: 'Нэвтрэх' },
  { path: '/register', name: 'register', heading: 'Бүртгүүлэх' },
  { path: '/privacy', name: 'privacy', heading: 'Нууцлалын бодлого' },
  { path: '/terms', name: 'terms', heading: 'Үйлчилгээний нөхцөл' },
  { path: '/delete-account', name: 'delete-account', heading: 'Бүртгэл устгах' },
];

for (const { path, name, heading } of PAGES) {
  test(`public page ${path}: heading, SEO tags, no horizontal scroll, no console errors`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    // Exactly one h1, a title and a description, indexable.
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page).toHaveTitle(/Онгод/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /.{20,}/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');

    // Mobile first: nothing wider than the screen.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);

    await page.screenshot({ path: shot(name), fullPage: true });
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
  });
}

test('the legal placeholders are clearly marked for the owner', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByRole('alert')).toContainText('TODO');
  }
  await page.goto('/delete-account');
  await expect(page.getByText('Профайл → Тохиргоо → Бүртгэл устгах')).toBeVisible();
  await expect(page.getByText('Нэвтэрч орсны дараа бүртгэлээ устгах боломжтой.')).toBeVisible();
});

test('pages behind the login send anonymous visitors to the login, and are not indexable', async ({
  page,
}) => {
  for (const path of ['/account', '/pay', '/status']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
  await page.goto('/verify');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
});

test('an unknown address shows the not-found page', async ({ page }) => {
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { name: 'Хуудас олдсонгүй' })).toBeVisible();
});
