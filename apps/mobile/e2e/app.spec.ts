import { expect, test, type Page } from '@playwright/test';
// One member on one browser for the whole spec: each new browser is a new device, and the
// account allows two (SPEC B).
import { mn } from '../src/i18n/mn';
import { screenPath } from './screens';

// The phase 3 screens (ADR-0039) as Expo web against the real API and the seeded catalog
// (pnpm --filter @ongod/api db:seed): tabs, Нүүр, Сан (search, category, sort), the bookmark and
// Хадгалсан, the Player with the no-access sheet, Профайл, Тохиргоо (personal info), devices.
// The member is new, so it has no access: playing must show the store-safe no-access sheet.
const API = process.env.MOBILE_E2E_API_URL ?? 'http://localhost:3100';
const MAILPIT = 'http://localhost:8025';
// Screenshots: test-results/screens/ by default, docs/screens/ with UPDATE_SCREENS=1 (screens.ts).
const shot = (name: string) => screenPath(`mobile-${name}`);
const settle = (page: Page) => page.waitForTimeout(1500);

const up = (url: string) =>
  fetch(url).then(
    (r) => r.ok,
    () => false,
  );
let stackUp = false;
test.beforeAll(async () => {
  stackUp = (await up(`${API}/health`)) && (await up(`${MAILPIT}/api/v1/info`));
});
test.beforeEach(() => {
  test.skip(!stackUp, 'start the API, Mailpit and Metro (web), and seed the database');
});

const PASSWORD = 'e2e-Password-1';
const stamp = Date.now();
const member = {
  email: `e2e.app.${stamp}@example.com`,
  lastName: 'Апп',
  firstName: 'Сувд',
  phone: '99112244',
};

/** Text that must never appear in the app (ADR-0006). */
const PAYMENT_WORDS =
  /төлбөр|төлөх|төлсөн|үнэ(?!н)|эрх\s+ав|багц|банк|данс|шилжүүл|захиалга|төгрөг|₮/i;
async function expectNoPaymentText(page: Page) {
  expect(await page.evaluate(() => document.body.innerText)).not.toMatch(PAYMENT_WORDS);
}

const errors: string[] = [];
let page: Page;

/** Registers and verifies the member through the API (the sign-up screens have their own spec). */
async function createMember() {
  const post = (path: string, body: unknown) =>
    fetch(`${API}/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const res = await post('/auth/register', { ...member, password: PASSWORD });
  expect(res.status).toBe(201);
  for (let attempt = 0; attempt < 40; attempt++) {
    const found = (await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${member.email}`)}`,
    ).then((r) => r.json())) as { messages: Array<{ ID: string }> };
    if (found.messages.length > 0) {
      const message = (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then((r) =>
        r.json(),
      )) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) {
        expect((await post('/auth/verify-email', { email: member.email, code })).ok).toBe(true);
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('no verification email');
}

async function signIn() {
  await page.goto('/');
  await page.getByRole('button', { name: mn.welcome.login }).click({ timeout: 90_000 });
  await page.getByLabel(mn.login.identifier, { exact: true }).fill(member.email);
  await page.getByLabel(mn.login.password, { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: mn.login.submit, exact: true }).click();
  await expect(page.getByRole('heading', { name: member.firstName, exact: true })).toBeVisible();
}

const tab = (name: string) => page.getByRole('tab', { name, exact: true });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  if (!stackUp) return;
  page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await createMember();
  await signIn();
});
test.afterAll(async () => {
  expect(errors, 'no uncaught errors in the app').toEqual([]);
  await page?.close();
});

test('Нүүр: hero, new, categories, this week; the tabs', async () => {
  // The seeded catalog: newest first, the scheduled episode in the countdown card.
  await expect(page.getByRole('heading', { name: mn.home.latest })).toBeVisible();
  await expect(page.getByRole('heading', { name: mn.home.categories })).toBeVisible();
  await expect(page.getByRole('heading', { name: mn.home.thisWeek })).toBeVisible();
  await expect(page.getByText('Гэрийн ёс')).toBeVisible();
  await expect(page.getByText(/Нээгдэхэд \d+ өдөр \d+:\d\d:\d\d/)).toBeVisible();
  await expect(page.getByRole('heading', { name: mn.home.continue })).toHaveCount(0);
  await expectNoPaymentText(page);
  await settle(page);
  await page.screenshot({ path: shot('tab-home'), fullPage: true });

  for (const [name, heading] of [
    [mn.tabs.library, mn.library.title],
    [mn.tabs.saved, mn.saved.title],
    [mn.tabs.profile, `${member.firstName} ${member.lastName}`],
    [mn.tabs.home, member.firstName],
  ] as const) {
    await tab(name).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
});

test('Сан: search, category chips, sort; a category card opens it filtered', async () => {
  await page
    .getByRole('button', { name: /Ёс заншил/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: mn.library.title })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Ёс заншил', selected: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Цагаан сарын уламжлал/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Хүннү гүрний үүсэл/ })).toHaveCount(0);

  await page.getByRole('tab', { name: mn.library.all }).click();
  await expect(page.getByRole('button', { name: /Хүннү гүрний үүсэл/ })).toBeVisible();
  await page.getByLabel(mn.library.search).fill('Малчин');
  await expect(page.getByRole('button', { name: /Малчин өвөөгийн яриа/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Хүннү гүрний үүсэл/ })).toHaveCount(0);

  await page.getByLabel(mn.library.search).fill('байхгүйүг');
  await expect(page.getByText(mn.library.emptyTitle)).toBeVisible();
  await page.getByRole('button', { name: mn.library.clear }).first().click();

  // Longest first: the 41-minute episode leads.
  await page.getByRole('radio', { name: mn.library.sortLongest }).click();
  const rows = page.getByRole('button', { name: /· \d{4}$/ });
  await expect(rows.first()).toHaveAccessibleName(/Малчин өвөөгийн яриа/);
  await expectNoPaymentText(page);
  await settle(page);
  await page.screenshot({ path: shot('tab-library') });
});

test('the bookmark: save in Сан, find it in Хадгалсан, remove it there', async () => {
  await tab(mn.tabs.saved).click();
  await expect(page.getByText(mn.saved.emptyTitle)).toBeVisible();
  await page.getByRole('button', { name: mn.saved.browse }).click();
  await expect(page.getByRole('heading', { name: mn.library.title })).toBeVisible();
  await page.getByRole('button', { name: mn.episode.save }).first().click();
  await expect(page.getByRole('button', { name: mn.episode.unsave })).toHaveCount(1);

  await tab(mn.tabs.saved).click();
  await expect(page.getByRole('button', { name: mn.episode.unsave })).toHaveCount(1);
  await page.getByRole('button', { name: mn.episode.unsave }).click();
  await expect(page.getByText(mn.saved.emptyTitle)).toBeVisible();
});

test('Player: details, then play without access shows the no-access sheet only', async () => {
  await tab(mn.tabs.library).click();
  await page.getByRole('button', { name: /Их Монгол улсын зам/ }).click();
  await expect(page.getByText(mn.player.nowPlaying)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Их Монгол улсын зам' })).toBeVisible();
  await expect(page.getByText('Түүх · 2026 · 38 мин')).toBeVisible();
  await expect(
    page.getByRole('button', { name: mn.player.description, exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: mn.episode.play }).last().click();
  await expect(page.getByText(mn.noAccess.title)).toBeVisible();
  await expectNoPaymentText(page);
  await page.getByRole('button', { name: mn.noAccess.check }).click();
  await expect(page.getByText(mn.noAccess.still)).toBeVisible();
  await settle(page);
  await page.screenshot({ path: shot('player-no-access') });
  // In the sheet the backdrop and the close button are both "Хаах"; the button comes last.
  await page.locator('[aria-modal="true"]').getByRole('button', { name: mn.close }).last().click();
  await expect(page.getByText(mn.noAccess.title)).toHaveCount(0);
  await page.getByRole('button', { name: mn.player.close }).first().click();
  await expect(page.getByText(mn.player.nowPlaying)).toHaveCount(0);
});

test('Профайл and Тохиргоо: inactive access, edit personal information, devices', async () => {
  await tab(mn.tabs.profile).click();
  await expect(page.getByText(mn.profile.accessInactive)).toBeVisible();
  await expect(page.getByText(`@${member.email}`)).toBeVisible();
  await expectNoPaymentText(page);
  await settle(page);
  await page.screenshot({ path: shot('tab-profile') });

  await page.getByRole('button', { name: mn.profile.settings }).click();
  await expect(page.getByRole('heading', { name: mn.settings.title })).toBeVisible();
  const first = page.getByLabel(mn.settings.firstName, { exact: true });
  await first.fill('');
  await page.getByRole('button', { name: mn.settings.save }).click();
  await expect(page.getByText(mn.errors.required)).toBeVisible();
  await first.fill('Сувдаа');
  await page.getByRole('button', { name: mn.settings.save }).click();
  await expect(page.getByText(mn.settings.saved)).toBeVisible();

  await page.getByRole('button', { name: mn.back }).click();
  await expect(
    page.getByRole('heading', { name: `Сувдаа ${member.lastName}`, exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: mn.profile.devices }).click();
  await expect(page.getByText(mn.devices.current)).toBeVisible();
});
