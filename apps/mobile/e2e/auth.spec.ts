import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mn } from '../src/i18n/mn';

// The sign-in screens of the app, run as Expo web in a browser (phone-sized) against the real
// API, database and Mailpit. What this cannot show: SecureStore, Google / Apple sign-in and the
// native keyboard. Those need a device (ADR-0015). Two screens are driven with mocked answers
// because the real API cannot produce them from a browser: "update required" and "complete
// profile". Creates e2e users in the dev database, like the portal and admin specs.
const API = process.env.MOBILE_E2E_API_URL ?? 'http://localhost:3100';
const MAILPIT = 'http://localhost:8025';
const shot = (name: string) => join(__dirname, '../../../docs/screens', `mobile-${name}.png`);

const up = async (url: string) =>
  fetch(url).then(
    (r) => r.ok,
    () => false,
  );
let stackUp = false;
test.beforeAll(async () => {
  stackUp = (await up(`${API}/health`)) && (await up(`${MAILPIT}/api/v1/info`));
});
test.beforeEach(() => {
  test.skip(!stackUp, 'start the API, Mailpit and Metro (web) to run the mobile auth flows');
});

const PASSWORD = 'e2e-Password-1';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function mailCount(to: string): Promise<number> {
  const found = (await fetch(
    `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
  ).then((r) => r.json())) as { messages_count?: number };
  return found.messages_count ?? 0;
}

/** The 6-digit code of the next email to this address (waits for it to arrive). */
async function nextCode(to: string, before: number): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    if ((await mailCount(to)) > before) {
      const found = (await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
      ).then((r) => r.json())) as { messages: Array<{ ID: string }> };
      const message = (await fetch(`${MAILPIT}/api/v1/message/${found.messages[0]!.ID}`).then((r) =>
        r.json(),
      )) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await sleep(500);
  }
  throw new Error(`no new email with a code for ${to}`);
}

const stamp = Date.now();
const user = {
  username: `e2e.mobile.${stamp}`,
  email: `e2e.mobile.${stamp}@example.com`,
  lastName: 'Тест',
  firstName: 'Утас',
  phone: '99112233',
};

const errors: string[] = [];
test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => errors.push(error.message));
});

/** Text that must never appear in the app (ADR-0006): the app shows no payment UI. */
const PAYMENT_WORDS = /төлбөр|төлөх|төлсөн|үнэ|эрх\s+ав|багц|банк|данс|шилжүүл|захиалга|төгрөг|₮/i;
async function expectNoPaymentText(page: Page) {
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toMatch(PAYMENT_WORDS);
}

async function openLogin(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: mn.welcome.login })).toBeVisible({
    timeout: 90_000,
  });
  await page.getByRole('button', { name: mn.welcome.login }).click();
}

async function logIn(page: Page, identifier: string, password: string) {
  await page.getByLabel(mn.login.identifier, { exact: true }).fill(identifier);
  await page.getByLabel(mn.login.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: mn.login.submit, exact: true }).click();
}

test('signed out: the Welcome screen, no payment text, the log in / register choice', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: mn.appName })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(mn.welcome.subtitle)).toBeVisible();
  await expect(page.getByRole('button', { name: mn.welcome.login })).toBeVisible();
  await expect(page.getByRole('button', { name: mn.welcome.register })).toBeVisible();
  await expectNoPaymentText(page);
  await page.screenshot({ path: shot('welcome') });
});

test('login: empty fields are explained, a wrong password shows the server message', async ({
  page,
}) => {
  await openLogin(page);
  await page.getByRole('button', { name: mn.login.submit, exact: true }).click();
  await expect(page.getByText(mn.errors.required)).toHaveCount(2);

  await logIn(page, 'nobody.here', 'wrong-password-1');
  await expect(page.getByText('Нэвтрэх нэр эсвэл нууц үг буруу байна.')).toBeVisible();
  await expect(page.getByRole('button', { name: mn.login.submit, exact: true })).toBeEnabled();
  await expectNoPaymentText(page);
  await page.screenshot({ path: shot('login') });
});

test('register: fields are checked before anything is sent', async ({ page }) => {
  let sent = 0;
  await page.route('**/v1/auth/register', (route) => {
    sent += 1;
    return route.continue();
  });
  await openLogin(page);
  await page.getByRole('button', { name: mn.login.register }).click();
  await page.getByLabel(mn.register.email, { exact: true }).fill('not-an-email');
  await page.getByLabel(mn.register.phone, { exact: true }).fill('abc');
  await page.getByLabel(mn.register.password, { exact: true }).fill('short');
  await page.getByLabel(mn.register.username, { exact: true }).fill('ab');
  await page.getByRole('button', { name: mn.register.submit, exact: true }).click();
  await expect(page.getByText(mn.errors.email)).toBeVisible();
  await expect(page.getByText(mn.errors.phone)).toBeVisible();
  await expect(page.getByText(mn.errors.password)).toBeVisible();
  await expect(page.getByText(mn.errors.username)).toBeVisible();
  expect(sent).toBe(0);
  await page.screenshot({ path: shot('register-errors') });
});

test('register, email code, login: the whole sign-up', async ({ page }) => {
  await openLogin(page);
  await page.getByRole('button', { name: mn.login.register }).click();
  await page.getByLabel(mn.register.lastName, { exact: true }).fill(user.lastName);
  await page.getByLabel(mn.register.firstName, { exact: true }).fill(user.firstName);
  await page.getByLabel(mn.register.phone, { exact: true }).fill(user.phone);
  await page.getByLabel(mn.register.email, { exact: true }).fill(user.email);
  await page.getByLabel(mn.register.username, { exact: true }).fill(user.username);
  await page.getByLabel(mn.register.password, { exact: true }).fill(PASSWORD);
  const before = await mailCount(user.email);
  await page.getByRole('button', { name: mn.register.submit, exact: true }).click();

  // email code screen
  await expect(page.getByText(mn.verify.title)).toBeVisible();
  await expect(page.getByText(mn.verify.text(user.email))).toBeVisible();
  await expect(
    page
      .getByRole('button', { name: mn.verify.resendIn(60) })
      .or(page.getByRole('button', { name: /Шинэ код авахад/ })),
  ).toBeDisabled();
  await page.screenshot({ path: shot('verify-email') });

  // a wrong code is refused with the server's message; the screen stays
  await page.getByLabel(mn.verify.code, { exact: true }).fill('000000');
  await expect(page.getByText('Код буруу байна.')).toBeVisible();
  await expect(page.getByText(mn.verify.title)).toBeVisible();

  // the right code (the 6th digit sends it) leads to the login form with a confirmation
  await page.getByLabel(mn.verify.code, { exact: true }).fill(await nextCode(user.email, before));
  await expect(page.getByText(mn.login.verified)).toBeVisible();
  await expect(page.getByLabel(mn.login.identifier, { exact: true })).toHaveValue(user.email);

  await logIn(page, user.email, PASSWORD);
  await expect(page.getByText(mn.home.greeting(user.firstName))).toBeVisible();
  await expectNoPaymentText(page);

  // nothing sensitive in web storage (the preview keeps tokens in memory only)
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./);
  await page.screenshot({ path: shot('home') });

  // logging out returns to the Welcome screen
  await page.getByRole('button', { name: mn.home.logout }).click();
  await expect(page.getByRole('button', { name: mn.welcome.login })).toBeVisible();
});

test('registering the same email again puts the error under the email field', async ({ page }) => {
  await openLogin(page);
  await page.getByRole('button', { name: mn.login.register }).click();
  await page.getByLabel(mn.register.lastName, { exact: true }).fill(user.lastName);
  await page.getByLabel(mn.register.firstName, { exact: true }).fill(user.firstName);
  await page.getByLabel(mn.register.phone, { exact: true }).fill(user.phone);
  await page.getByLabel(mn.register.email, { exact: true }).fill(user.email);
  await page.getByLabel(mn.register.password, { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: mn.register.submit, exact: true }).click();
  await expect(page.getByText('Энэ имэйл хаяг бүртгэлтэй байна.')).toBeVisible();
  await expect(page.getByText(mn.verify.title)).toBeHidden();
});

test('forgot password: code by email, new password, then log in with it', async ({ page }) => {
  const NEW_PASSWORD = 'e2e-NewPassword-2';
  await openLogin(page);
  await page.getByRole('button', { name: mn.login.forgot }).click();
  await page.getByLabel(mn.forgot.email, { exact: true }).fill(user.email);
  const before = await mailCount(user.email);
  await page.getByRole('button', { name: mn.forgot.submit, exact: true }).click();

  await expect(page.getByRole('heading', { name: mn.reset.title })).toBeVisible();
  await expect(page.getByLabel(mn.reset.email, { exact: true })).toHaveValue(user.email);
  await page.getByLabel(mn.reset.code, { exact: true }).fill(await nextCode(user.email, before));
  await page.getByLabel(mn.reset.newPassword, { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: mn.reset.submit, exact: true }).click();

  await expect(page.getByText(mn.login.passwordReset)).toBeVisible();
  // the flow came back to the login that was already open: there is only one login form
  await expect(page.getByLabel(mn.login.identifier, { exact: true })).toHaveCount(1);
  await expect(page.getByLabel(mn.login.identifier, { exact: true })).toHaveValue(user.email);
  await logIn(page, user.username, NEW_PASSWORD);
  await expect(page.getByText(mn.home.greeting(user.firstName))).toBeVisible();
});

/** A user with a verified email and no devices yet, made through the API. */
async function freshUser() {
  const id = `e2e.devices.${Date.now()}`;
  const email = `${id}@example.com`;
  const post = (path: string, body: unknown) =>
    fetch(`${API}/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const before = await mailCount(email);
  const registered = await post('/auth/register', {
    lastName: 'Тест',
    firstName: 'Төхөөрөмж',
    phone: '99112233',
    email,
    username: id,
    password: PASSWORD,
  });
  expect(registered.status).toBe(201);
  const verified = await post('/auth/verify-email', { email, code: await nextCode(email, before) });
  expect(verified.status).toBe(204);
  return { email, firstName: 'Төхөөрөмж' };
}

test('device limit: the 3rd device sees the other two and can remove one', async ({ browser }) => {
  // A new user: the others in this file already used up device slots in earlier tests.
  const owner = await freshUser();
  // Every browser context is a new phone: the preview keeps the device id in memory.
  const phones = await Promise.all(
    [1, 2, 3].map(() => browser.newContext({ viewport: { width: 430, height: 900 } })),
  );
  const pages = await Promise.all(phones.map((context) => context.newPage()));
  try {
    for (const page of pages.slice(0, 2)) {
      await openLogin(page);
      await logIn(page, owner.email, PASSWORD);
      await expect(page.getByText(mn.home.greeting(owner.firstName))).toBeVisible();
    }
    const third = pages[2]!;
    await openLogin(third);
    await logIn(third, owner.email, PASSWORD);

    await expect(third.getByText(mn.deviceLimit.title)).toBeVisible();
    const removeButtons = third.getByRole('button', { name: mn.deviceLimit.remove });
    await expect(removeButtons).toHaveCount(2);
    await expect(third.getByText(/Сүлд|Сүүлд/).first()).toBeVisible();
    await third.screenshot({ path: shot('device-limit') });

    await removeButtons.first().click();
    await expect(third.getByText(mn.home.greeting(owner.firstName))).toBeVisible();
  } finally {
    await Promise.all(phones.map((context) => context.close()));
  }
});

test('update required: below the server minimum the app is blocked', async ({ page }) => {
  await page.route('**/v1/app-config', (route) =>
    route.fulfill({
      json: { minVersion: { ios: '99.0.0', android: '99.0.0' }, socialLogin: false },
    }),
  );
  await page.goto('/');
  await expect(page.getByText(mn.update.title)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(mn.update.text)).toBeVisible();
  // no way around it: login and register are not reachable, not even by address
  await expect(page.getByRole('button', { name: mn.welcome.login })).toHaveCount(0);
  await page.goto('/login');
  await expect(page.getByText(mn.update.title)).toBeVisible();
  await expect(page.getByLabel(mn.login.identifier, { exact: true })).toHaveCount(0);
  await expectNoPaymentText(page);
  await page.screenshot({ path: shot('update-required') });
});

test('no connection to the server at start: the app still opens (login needs it anyway)', async ({
  page,
}) => {
  await page.route('**/v1/app-config', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('button', { name: mn.welcome.login })).toBeVisible({
    timeout: 90_000,
  });
});

test('complete profile: a locked social account must fill the form (answers mocked)', async ({
  page,
}) => {
  const pending = {
    id: 'u-pending',
    username: 'pending-abc',
    email: 'social.person@example.com',
    emailVerified: true,
    firstName: '',
    lastName: '',
    phone: '',
    status: 'PENDING_PROFILE',
    role: 'USER',
    accessUntil: null,
  };
  await page.route('**/v1/auth/login', (route) =>
    route.fulfill({
      json: {
        accessToken: 'a'.repeat(40),
        refreshToken: 'r'.repeat(40),
        expiresIn: 900,
        user: pending,
      },
    }),
  );
  let posted: unknown;
  await page.route('**/v1/auth/complete-profile', async (route) => {
    posted = route.request().postDataJSON();
    await route.fulfill({
      json: {
        user: {
          ...pending,
          username: 'social.person',
          firstName: 'Саран',
          lastName: 'Бат',
          phone: '99112233',
          status: 'ACTIVE',
        },
      },
    });
  });

  await openLogin(page);
  await logIn(page, 'social.person@example.com', 'x'.repeat(8));
  await expect(page.getByText(mn.completeProfile.title)).toBeVisible();
  // the username starts as the email (SPEC C)
  await expect(page.getByLabel(mn.completeProfile.username, { exact: true })).toHaveValue(
    'social.person@example.com',
  );
  await page.screenshot({ path: shot('complete-profile') });

  // incomplete: nothing is sent
  await page.getByRole('button', { name: mn.completeProfile.submit, exact: true }).click();
  await expect(page.getByText(mn.errors.required).first()).toBeVisible();
  expect(posted).toBeUndefined();

  await page.getByLabel(mn.completeProfile.lastName, { exact: true }).fill('Бат');
  await page.getByLabel(mn.completeProfile.firstName, { exact: true }).fill('Саран');
  await page.getByLabel(mn.completeProfile.phone, { exact: true }).fill('99112233');
  await page.getByLabel(mn.completeProfile.password, { exact: true }).fill('long-enough-1');
  await page.getByRole('button', { name: mn.completeProfile.submit, exact: true }).click();
  await expect(page.getByText(mn.home.greeting('Саран'))).toBeVisible();
  expect(posted).toEqual({
    username: 'social.person@example.com',
    password: 'long-enough-1',
    lastName: 'Бат',
    firstName: 'Саран',
    phone: '99112233',
  });
});

test.afterAll(() => {
  // Real script errors (not warnings) must not happen on any of the screens.
  expect(errors).toEqual([]);
});
