import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

// The whole customer journey against the real API, database and Mailpit (pnpm dev must be
// running): register, email code, login, plan, pay, "Төлсөн" with a receipt, review, approval,
// access. Skipped when the API is not up. Each run creates one e2e-... user in the dev database.
const API = 'http://localhost:3000';
const MAILPIT = 'http://localhost:8025';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const shots = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screens/${name}.png`, import.meta.url));

const apiUp = await fetch(`${API}/health`).then(
  (r) => r.ok,
  () => false,
);
const mailUp = await fetch(`${MAILPIT}/api/v1/info`).then(
  (r) => r.ok,
  () => false,
);
test.skip(!apiUp || !mailUp, 'start the stack with pnpm dev to run the payment flow');

const PASSWORD = 'e2e-Password-1';

/** The newest 6-digit code mailed to this address (the email job runs within a couple of seconds). */
async function emailedCode(to: string): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt++) {
    const found = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    ).then((r) => r.json() as Promise<{ messages?: Array<{ ID: string }> }>);
    const id = found.messages?.[0]?.ID;
    if (id) {
      const message = (await fetch(`${MAILPIT}/api/v1/message/${id}`).then((r) => r.json())) as {
        Text: string;
      };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`no email with a code for ${to}`);
}

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);

async function register(page: Page, email: string, username: string) {
  await page.goto('/register');
  await page.getByLabel('Овог').fill('Бат');
  await page.getByLabel('Нэр', { exact: true }).fill('Эрдэнэ');
  await page.getByLabel('Утасны дугаар').fill('99112233');
  await page.getByLabel('Имэйл').fill(email);
  await page.getByLabel('Нэвтрэх нэр (заавал биш)').fill(username);
  await page.getByLabel('Нууц үг', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Бүртгүүлэх' }).click();
}

test('register -> verify -> pay -> review -> approved -> access', async ({ page, context }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const email = `e2e-${stamp}@example.com`;
  const username = `e2e${stamp}`;
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page.clock.install();

  // ---- register and verify the email ----
  await register(page, email, username);
  await expect(page.getByRole('heading', { name: 'Имэйлээ баталгаажуулна уу' })).toBeVisible();
  await page.getByLabel('Баталгаажуулах код').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Баталгаажуулах' }).click();
  await expect(page.getByText('Имэйл баталгаажлаа. Одоо нэвтэрч болно.')).toBeVisible();

  // ---- login: the refresh token is an httpOnly cookie, the access token is not stored ----
  await page.getByLabel('Нууц үг').fill(PASSWORD);
  await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();
  await expect(page.getByText('Идэвхгүй', { exact: true })).toBeVisible();

  const cookie = (await context.cookies()).find((c) => c.name === 'ongod_rt');
  expect(cookie, 'refresh cookie').toBeDefined();
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/v1/auth' });
  const visible = await page.evaluate(() => ({
    cookie: document.cookie,
    local: Object.entries(localStorage),
    session: Object.entries(sessionStorage),
  }));
  expect(visible.cookie).not.toContain('ongod_rt');
  expect(visible.local.map(([key]) => key).sort()).toEqual(['ongod:device', 'ongod:session']);
  expect(visible.session).toEqual([]);
  for (const [, value] of [...visible.local, ...visible.session]) {
    expect(value, 'no token in web storage').not.toMatch(/^eyJ|\.[\w-]{20,}\./);
    expect(value).not.toContain(cookie!.value);
  }

  // A reload keeps the session through the cookie (silent refresh), without a login screen.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();
  await expect(page.getByText('@' + username)).toBeVisible();

  // ---- plan -> pay ----
  await page.getByRole('link', { name: 'Эрх авах' }).first().click();
  await expect(page.getByRole('heading', { name: 'Эрх авах' })).toBeVisible();
  await page.getByRole('button', { name: 'Сонгох' }).click();
  await expect(page.getByRole('heading', { name: 'Төлбөр хийх' })).toBeVisible();

  const reference = (await page.getByTestId('reference-code').textContent())!.trim();
  expect(reference).toMatch(/^ONG-[2-9A-HJKMNP-Z]{5}$/);
  await expect(page.getByText('Жишээ банк')).toBeVisible();
  await expect(page.getByText('5000000000')).toBeVisible();
  await expect(page.getByText('100,000₮')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Банкныхаа апп-аар' })).toBeVisible();
  await page.screenshot({ path: shots('portal-pay'), fullPage: true });

  // Copy buttons put the value on the clipboard and say so.
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Хуулах: Гүйлгээний утга' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Хуулагдлаа' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reference);

  // Bad files are refused in the browser, before any upload.
  const picker = page.getByLabel('Баримтын зураг (заавал биш)');
  await picker.setInputFiles({
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4'),
  });
  await expect(page.getByText('Зөвхөн JPEG, PNG эсвэл WebP зураг оруулна уу.')).toBeVisible();
  await picker.setInputFiles({
    name: 'big.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
  });
  await expect(page.getByText('Зураг 5 MB-аас том байна.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Төлсөн', exact: true })).toBeDisabled();

  // ---- "Төлсөн" with a receipt ----
  await picker.setInputFiles({ name: 'receipt.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await page.getByLabel('Тэмдэглэл (заавал биш)').fill('Хаан банкнаас шилжүүлсэн');
  await page.getByRole('button', { name: 'Төлсөн', exact: true }).click();

  // ---- review: the timeline says "Шалгаж байна" ----
  await expect(page.getByRole('heading', { name: 'Төлбөрийн төлөв' })).toBeVisible();
  const review = page.getByRole('listitem').filter({ hasText: 'Шалгаж байна' });
  await expect(review).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText(reference)).toBeVisible();
  await page.screenshot({ path: shots('portal-status-review'), fullPage: true });

  // ---- the owner approves; within 30 s the page notices by itself ----
  const approved = execFileSync('pnpm', ['--silent', 'dev:approve', reference], {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
  });
  expect(approved).toContain(`${reference}: ACTIVE`);
  await page.clock.fastForward(31_000);
  await expect(page.getByText('Одоо Онгод аппаар нэвтэрч сонсоорой.')).toBeVisible();
  await expect(page.getByText(/Таны эрх \d{4}\.\d{2}\.\d{2} хүртэл хүчинтэй\./)).toBeVisible();
  await page.screenshot({ path: shots('portal-status-active'), fullPage: true });

  // ---- the account shows the access; renewing is offered ----
  await page.getByRole('link', { name: 'Миний бүртгэл' }).click();
  await expect(page.getByText(/Идэвхтэй · \d{4}\.\d{2}\.\d{2} хүртэл/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Эрх сунгах' })).toBeVisible();

  // ---- logout ends the session and clears the cookie ----
  await page.getByRole('button', { name: 'Гарах' }).first().click();
  await expect(page.getByRole('link', { name: 'Нэвтрэх' }).first()).toBeVisible();
  expect((await context.cookies()).find((c) => c.name === 'ongod_rt')).toBeUndefined();
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);

  expect(consoleErrors.filter((e) => !/401|favicon/.test(e))).toEqual([]);
});

test('a rejected payment shows the reason and offers another try', async ({ page }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const email = `e2e-reject-${stamp}@example.com`;
  await page.clock.install();

  await register(page, email, `e2er${stamp}`);
  await page.getByLabel('Баталгаажуулах код').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Баталгаажуулах' }).click();
  await page.getByLabel('Нууц үг').fill(PASSWORD);
  await page.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();
  await page.goto('/plans');
  await page.getByRole('button', { name: 'Сонгох' }).click();
  const reference = (await page.getByTestId('reference-code').textContent())!.trim();
  await page.getByRole('button', { name: 'Төлсөн', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Төлбөрийн төлөв' })).toBeVisible();

  execFileSync('pnpm', ['--silent', 'dev:approve', reference, 'reject', 'Дүн таарахгүй байна'], {
    cwd: repoRoot,
    shell: true,
  });
  await page.clock.fastForward(31_000);
  await expect(page.getByText('Төлбөр баталгаажсангүй')).toBeVisible();
  await expect(page.getByText('Шалтгаан: Дүн таарахгүй байна')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Дахин оролдох' })).toBeVisible();
});

test('the third device is refused with a list to remove one (SPEC B)', async ({ browser }) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const email = `e2e-devices-${stamp}@example.com`;
  const first = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page = await first.newPage();
  await register(page, email, `e2ed${stamp}`);
  await page.getByLabel('Баталгаажуулах код').fill(await emailedCode(email));
  await page.getByRole('button', { name: 'Баталгаажуулах' }).click();

  const login = async (p: Page) => {
    await p.goto('/login');
    await p.getByLabel('Имэйл эсвэл нэвтрэх нэр').fill(email);
    await p.getByLabel('Нууц үг').fill(PASSWORD);
    await p.getByRole('button', { name: 'Нэвтрэх', exact: true }).click();
  };
  await login(page); // device 1
  await expect(page.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();

  const second = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page2 = await second.newPage();
  await login(page2); // device 2
  await expect(page2.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();

  const third = await browser.newContext({ baseURL: 'http://localhost:5173' });
  const page3 = await third.newPage();
  await login(page3); // device 3: refused
  await expect(page3.getByRole('heading', { name: 'Төхөөрөмжийн хязгаар хэтэрсэн' })).toBeVisible();
  await expect(page3.getByRole('button', { name: 'Хасаад нэвтрэх' })).toHaveCount(2);
  await page3.getByRole('button', { name: 'Хасаад нэвтрэх' }).first().click();
  await expect(page3.getByRole('heading', { name: 'Миний бүртгэл' })).toBeVisible();

  await Promise.all([first.close(), second.close(), third.close()]);
});
