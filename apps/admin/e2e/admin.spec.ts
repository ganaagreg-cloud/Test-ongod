import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mn } from '../src/i18n/mn';
import {
  cleanUp,
  customerWithSubmittedPayment,
  foreignRows,
  MAILPIT,
  ORIGIN,
  shot,
  signIn,
  type Customer,
} from './helpers';

// The admin against the real API, database and Mailpit (the API must serve the admin build:
// SERVE_STATIC=true after `pnpm build`). Creates two e2e customers, one category and one episode
// in the dev database. One serial run with one session: a TOTP code works once per 30 s.
const up = async (url: string) =>
  fetch(url).then(
    (r) => r.ok,
    () => false,
  );
const stackUp = (await up(`${ORIGIN}/health`)) && (await up(`${MAILPIT}/api/v1/info`));
test.skip(!stackUp, 'start the API (SERVE_STATIC=true) and Mailpit to run the admin flow');

test.describe.configure({ mode: 'serial' });

let page: Page;
let rejected: Customer;
let approved: Customer;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  // One after the other: parallel registrations can deadlock in the API (see the 2026-10-09 log).
  rejected = await customerWithSubmittedPayment('a');
  approved = await customerWithSubmittedPayment('b');
  // Nobody decides this one: the cleanup in afterAll has to find it.
  await customerWithSubmittedPayment('c');
  await signIn(page, mn);
});

test.afterAll(async () => {
  // The cleanup removes the stray payment and any leftover test episodes, and nothing else:
  // the rows that are not test data are the same before and after.
  const before = {
    payments: await foreignRows(page, 'payments'),
    episodes: await foreignRows(page, 'episodes'),
  };
  await cleanUp(page, mn);
  expect(await foreignRows(page, 'payments')).toBe(before.payments);
  expect(await foreignRows(page, 'episodes')).toBe(before.episodes);
  await page.goto('payments');
  await page.getByLabel(mn.payments.searchLabel).fill('e2e.');
  await expect(page.getByRole('row').filter({ hasText: '@e2e.' })).toHaveCount(0);

  // Signing out ends the session for good: a reload stays on the login screen.
  const logout = page.getByRole('button', { name: mn.nav.logout });
  if (await logout.isVisible()) {
    await logout.click();
    await expect(page.getByRole('heading', { name: mn.login.title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: mn.login.title })).toBeVisible();
  }
  await page.close();
});

const toast = (text: string) => page.getByRole('status').filter({ hasText: text });
const dialog = (name: string) => page.getByRole('dialog', { name });

test('dashboard shows the counters, with payments to review', async () => {
  await expect(page.getByRole('heading', { name: mn.dashboard.title })).toBeVisible();
  const toReview = page.locator('.admin-counter', { hasText: mn.dashboard.paymentSubmitted });
  await expect(toReview).toBeVisible();
  const count = Number(await toReview.locator('.admin-counter__value').innerText());
  expect(count).toBeGreaterThanOrEqual(2);
  await expect(toReview).toHaveClass(/is-attention/);
  await page.screenshot({ path: shot('admin-dashboard') });
});

test('payments: search, side panel, and a keyboard reject that needs a reason', async () => {
  await page.getByRole('link', { name: mn.nav.payments }).click();

  // J / K move the selection down and up the queue, Esc closes the panel
  const rows = page.getByRole('row').filter({ has: page.locator('td') });
  await expect(rows.nth(2)).toBeVisible();
  await rows.first().click();
  await expect(rows.first()).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('j');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('j');
  await expect(rows.nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('k');
  await expect(rows.nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('complementary', { name: mn.payments.panel.title })).toBeHidden();

  await page.getByLabel(mn.payments.searchLabel).fill(rejected.referenceCode);
  const row = page.getByRole('row', { name: new RegExp(rejected.referenceCode) });
  await expect(row).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2); // header + the one match
  await row.click();

  const panel = page.getByRole('complementary', { name: mn.payments.panel.title });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(rejected.referenceCode)).toBeVisible();
  await expect(panel.getByText(`E2E тэмдэглэл a`)).toBeVisible();
  await expect(panel.getByText('99112233')).toBeVisible();
  await expect(panel.getByAltText(mn.payments.panel.receiptAlt)).toBeVisible();
  await page.screenshot({ path: shot('admin-payments') });

  await page.keyboard.press('r');
  const reject = dialog(mn.payments.rejectTitle);
  await expect(reject).toBeVisible();
  const submit = reject.getByRole('button', { name: mn.payments.rejectSubmit });
  await expect(submit).toBeDisabled();
  await reject.getByLabel(mn.payments.rejectReason).fill('   ');
  await expect(submit).toBeDisabled();
  await reject.getByLabel(mn.payments.rejectReason).fill('Дүн таарахгүй байна');
  await submit.click();
  await expect(toast(mn.payments.rejected)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('payments: approve asks for a confirmation first', async () => {
  await page.getByLabel(mn.payments.searchLabel).fill(approved.referenceCode);
  const row = page.getByRole('row', { name: new RegExp(approved.referenceCode) });
  await row.click();
  await page.keyboard.press('a');
  const confirm = dialog(mn.payments.approveConfirmTitle);
  await expect(confirm).toBeVisible();
  await expect(confirm.getByText(approved.referenceCode)).toBeVisible();
  // Cancelling changes nothing.
  await confirm.getByRole('button', { name: mn.confirm.cancel }).click();
  await expect(row).toBeVisible();
  await page.keyboard.press('a');
  await dialog(mn.payments.approveConfirmTitle)
    .getByRole('button', { name: mn.payments.approve })
    .click();
  await expect(toast(mn.payments.approved)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('payments: the history of a decided payment, and the CSV export', async () => {
  await page.getByLabel(mn.payments.statusLabel).selectOption('ACTIVE');
  await page.getByLabel(mn.payments.searchLabel).fill(approved.referenceCode);
  await page.getByRole('row', { name: new RegExp(approved.referenceCode) }).click();
  const panel = page.getByRole('complementary', { name: mn.payments.panel.title });
  await expect(panel.getByText('subscription.approve')).toBeVisible();

  await page.getByRole('button', { name: mn.payments.export.title }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog(mn.payments.export.title)
      .getByRole('button', { name: mn.payments.export.submit })
      .click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^payments-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString('utf8')).toContain(approved.referenceCode);
  await expect(toast(mn.payments.export.done)).toBeVisible();
});

test('users: search, grant, remove a device and revoke, each behind a confirmation', async () => {
  await page.getByRole('link', { name: mn.nav.users }).click();
  await page.getByLabel(mn.users.searchLabel).fill(approved.username);
  await page.getByRole('row', { name: new RegExp(approved.username) }).click();
  await expect(page.getByRole('heading', { name: approved.name })).toBeVisible();

  // devices
  await page.getByRole('button', { name: mn.users.detail.removeDevice }).click();
  const removing = dialog(mn.users.detail.removeDeviceTitle);
  await expect(removing).toBeVisible();
  await removing.getByRole('button', { name: mn.users.detail.removeDevice }).click();
  await expect(toast(mn.users.detail.deviceRemoved)).toBeVisible();
  await expect(page.getByText(mn.users.detail.noDevices)).toBeVisible();

  // grant
  await page.getByLabel(mn.users.detail.grantDays).fill('30');
  await page.getByRole('button', { name: mn.users.detail.grantSubmit }).click();
  const granting = dialog(mn.users.detail.grantConfirmTitle);
  await expect(granting).toContainText('30');
  await granting.getByRole('button', { name: mn.users.detail.grantSubmit }).click();
  await expect(toast(mn.users.detail.granted)).toBeVisible();

  // revoke the approved subscription (reason required)
  await page
    .getByRole('listitem')
    .filter({ hasText: approved.referenceCode })
    .getByRole('button', { name: mn.users.detail.revoke })
    .click();
  const revoking = dialog(mn.users.detail.revokeTitle);
  const confirmRevoke = revoking.getByRole('button', { name: mn.users.detail.revoke });
  await expect(confirmRevoke).toBeDisabled();
  await revoking.getByLabel(mn.users.detail.revokeReason).fill('E2E: буцаалт');
  await confirmRevoke.click();
  await expect(toast(mn.users.detail.revoked)).toBeVisible();
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: approved.referenceCode })
      .getByText(mn.subscriptionStatus.REVOKED),
  ).toBeVisible();
});

test('categories: create, reorder, edit and delete', async () => {
  const stamp = Date.now();
  const name = `Тест ангилал ${stamp}`;
  await page.getByRole('link', { name: mn.nav.categories }).click();
  await page.getByRole('button', { name: mn.categories.new }).first().click();
  const form = dialog(mn.categories.formCreate);
  await form.getByLabel(mn.categories.name).fill(name);
  // The slug is suggested from the Mongolian name.
  await expect(form.getByLabel(mn.categories.slug)).toHaveValue(/^[a-z0-9-]+$/);
  await form.getByLabel(mn.categories.slug).fill(`e2e-${stamp}`);
  await form.getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.categories.created)).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  const before = await page.getByRole('row').allInnerTexts();
  await row.getByRole('button', { name: mn.categories.moveUp(name) }).click();
  await expect(toast(mn.categories.reordered)).toBeVisible();
  await expect
    .poll(async () =>
      (await page.getByRole('row').allInnerTexts()).findIndex((t) => t.includes(name)),
    )
    .toBeLessThan(before.findIndex((t) => t.includes(name)));

  await row.getByRole('button', { name: mn.common.edit }).click();
  const editing = dialog(mn.categories.formEdit);
  await editing.getByLabel(mn.categories.name).fill(`${name} (засав)`);
  await editing.getByRole('button', { name: mn.common.save }).click();
  const edited = page.getByRole('row', { name: new RegExp(`${name} \\(засав\\)`) });
  await expect(edited).toBeVisible();

  await edited.getByRole('button', { name: mn.common.delete }).click();
  const deleting = dialog(mn.categories.deleteTitle);
  await expect(deleting).toContainText(`${name} (засав)`);
  await deleting.getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.categories.deleted)).toBeVisible();
  await expect(edited).toHaveCount(0);
});

test('episodes: create, cover, and an audio upload that resumes after a page refresh', async () => {
  test.setTimeout(150_000);
  await page.getByRole('link', { name: mn.nav.episodes }).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  const title = `E2E анги ${Date.now()}`;
  await page.getByLabel(mn.episodes.form.title).fill(title);
  const category = page.getByLabel(mn.episodes.form.category);
  await category.selectOption({ index: 1 });
  await page.getByRole('button', { name: mn.episodes.form.create }).click();
  await expect(toast(mn.episodes.created)).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText(mn.episodes.status.DRAFT).first()).toBeVisible();

  // nothing can be published yet, and the page says why
  await expect(page.getByRole('button', { name: mn.episodes.publish.now })).toBeDisabled();
  await expect(
    page.getByText(
      mn.episodes.missing.text(`${mn.episodes.missing.cover}, ${mn.episodes.missing.audio}`),
    ),
  ).toBeVisible();

  // cover
  const cover = await sharp({
    create: { width: 600, height: 600, channels: 3, background: '#887766' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel(mn.episodes.cover.choose)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: cover });
  await expect(toast(mn.episodes.cover.uploaded)).toBeVisible();

  // audio: 5 MB chunks, each held back 1.5 s so there is time to refresh in the middle
  await page.route('**/v1/admin/uploads/**', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  // A real file on disk: tus recognises a file by name, size and modification time, and a buffer
  // handed to the browser gets a new modification time on every selection.
  const folder = mkdtempSync(join(tmpdir(), 'ongod-e2e-'));
  const audio = {
    name: 'e2e-audio.mp3',
    size: 26 * 1024 * 1024,
    path: join(folder, 'e2e-audio.mp3'),
  };
  writeFileSync(audio.path, Buffer.alloc(audio.size, 7));
  // Count the chunks the server has acknowledged (progress events only say bytes were sent).
  let acknowledged = 0;
  page.on('response', (res) => {
    if (res.request().method() === 'PATCH' && res.status() === 204) acknowledged += 1;
  });
  await page.getByLabel(mn.episodes.audio.choose).setInputFiles(audio.path);
  const progress = page.locator('.admin-uploader__progress progress');
  await expect(progress).toBeVisible();
  await expect.poll(() => acknowledged, { timeout: 30_000 }).toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => Number(await progress.getAttribute('value')))
    .toBeLessThan(audio.size);

  await page.reload();
  // Restoring the session takes a refresh + /me + /admin/totp round trip.
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(mn.episodes.audio.resumeFound(audio.name))).toBeVisible();
  await page.screenshot({ path: shot('admin-episode-resume') });

  await page.getByLabel(mn.episodes.audio.choose).setInputFiles(audio.path);
  await expect(page.getByText(/%-иас үргэлжилж байна/)).toBeVisible();
  await expect(page.getByText(mn.episodes.audio.done)).toBeVisible({ timeout: 60_000 });

  // The server now stores the file; this stack has no usable storage or the bytes are not audio,
  // so the asset ends up FAILED with a reason and a retry button (SPEC acceptance test).
  const failed = page.getByText(mn.episodes.audio.failedTitle);
  await expect(failed).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: shot('admin-episode-failed') });
  await page.getByRole('button', { name: mn.episodes.audio.retry }).click();
  await expect(toast(mn.episodes.audio.retried)).toBeVisible();

  rmSync(folder, { recursive: true, force: true });

  // a draft can be deleted, after a confirmation
  await page.getByRole('button', { name: mn.episodes.deleteEpisode }).click();
  const deleting = dialog(mn.episodes.deleteConfirmTitle);
  await expect(deleting).toContainText(title);
  await deleting.getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.episodes.deleted)).toBeVisible();
  await expect(page.getByRole('heading', { name: mn.episodes.title })).toBeVisible();
});

test('audit log lists what was done, and can be filtered', async () => {
  await page.getByRole('link', { name: mn.nav.audit }).click();
  await expect(page.getByRole('heading', { name: mn.audit.title })).toBeVisible();
  await page.getByLabel(mn.audit.actionLabel).fill('subscription.reject');
  const rows = page.getByRole('row').filter({ hasText: 'subscription.reject' });
  await expect(rows.first()).toBeVisible();
  await rows.first().getByText(mn.audit.showData).click();
  await expect(rows.first().getByText('Дүн таарахгүй байна')).toBeVisible();
});

test('the session survives a reload without asking for the code again', async () => {
  await page.goto('');
  await expect(page.getByRole('heading', { name: mn.dashboard.title })).toBeVisible();
  // the access token is in memory only; nothing sensitive sits in web storage
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // no JWT
});
