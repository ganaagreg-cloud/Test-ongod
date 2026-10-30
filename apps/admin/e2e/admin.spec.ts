import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { mn } from '../src/i18n/mn';
import {
  cleanUp,
  customerWhoPaid,
  foreignEpisodes,
  MAILPIT,
  ORIGIN,
  shot,
  signIn,
  type Customer,
} from './helpers';

// The admin against the real API, database and Mailpit (the API must serve the admin build:
// SERVE_STATIC=true after `pnpm build`). Creates an e2e customer who paid at the mock QPay
// checkout, categories and episodes in the dev database. One serial run with one session.
const up = async (url: string) =>
  fetch(url).then(
    (r) => r.ok,
    () => false,
  );
const stackUp = (await up(`${ORIGIN}/health`)) && (await up(`${MAILPIT}/api/v1/info`));
test.skip(!stackUp, 'start the API (SERVE_STATIC=true) and Mailpit to run the admin flow');

test.describe.configure({ mode: 'serial' });

let page: Page;
let paid: Customer;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  paid = await customerWhoPaid('a');
  await signIn(page, mn);
});

test.afterAll(async () => {
  // Each sweep opens a list and deletes the e2e rows one by one; the default 90 s is not enough.
  test.setTimeout(240_000);
  // The cleanup removes leftover test episodes and nothing else: the rows that are not test data
  // are the same before and after.
  const before = await foreignEpisodes(page);
  await cleanUp(page, mn);
  expect(await foreignEpisodes(page)).toBe(before);

  // Signing out ends the session for good: a reload stays on the login screen.
  const userMenu = page.getByRole('button', { name: mn.nav.userMenu });
  if (await userMenu.isVisible()) {
    await userMenu.click();
    await page.getByRole('menuitem', { name: mn.nav.logout }).click();
    await expect(page.getByRole('heading', { name: mn.login.title })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: mn.login.title })).toBeVisible();
  }
  await page.close();
});

const toast = (text: string) => page.getByRole('status').filter({ hasText: text });
/** A sidebar link: the dashboard has links with the same words (ADR-0056). */
const navLink = (name: string) =>
  page.getByRole('navigation', { name: mn.nav.label }).getByRole('link', { name, exact: true });
const dialog = (name: string) => page.getByRole('dialog', { name });

test('dashboard shows the counters and the cards; there is no payments queue any more', async () => {
  await expect(page.getByRole('heading', { name: mn.dashboard.title })).toBeVisible();
  const counters = page.locator('.admin-counter');
  await expect(counters).toHaveCount(5);
  await expect(counters.filter({ hasText: mn.dashboard.revenue })).toBeVisible();
  await expect(counters.filter({ hasText: mn.dashboard.pendingPayment })).toBeVisible();
  // ADR-0056: the four cards.
  for (const title of [
    mn.dashboard.recentPayments,
    mn.dashboard.upcoming,
    mn.dashboard.mediaProblems,
    mn.dashboard.expiringSoon,
  ]) {
    await expect(page.getByRole('region', { name: title })).toBeVisible();
  }
  await expect(page.getByText('Шалгах төлбөр')).toHaveCount(0);
  await page.screenshot({ path: shot('admin-dashboard') });
});

test('payments: the list of every request, search, side panel and its history', async () => {
  await navLink(mn.nav.payments).click();
  // The list starts on ACTIVE; the removed bank-transfer states are not offered.
  const filter = page.getByLabel(mn.payments.statusLabel);
  await expect(filter).toHaveValue('ACTIVE');
  await expect(filter.locator('option[value="PAYMENT_SUBMITTED"]')).toHaveCount(0);
  await expect(filter.locator('option[value="REJECTED"]')).toHaveCount(0);

  await page.getByLabel(mn.payments.searchLabel).fill(paid.referenceCode);
  const row = page.getByRole('row', { name: new RegExp(paid.referenceCode) });
  await expect(row).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2); // header + the one match
  await row.click();

  const panel = page.getByRole('complementary', { name: mn.payments.panel.title });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(paid.referenceCode)).toBeVisible();
  await expect(panel.getByText('99112233')).toBeVisible();
  await expect(panel.getByText(mn.payments.methods.MOCK)).toBeVisible();
  // The member paid at the checkout: the history shows it, nobody approved anything.
  await expect(panel.getByText('subscription.paid')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Батлах' })).toHaveCount(0);
  await page.screenshot({ path: shot('admin-payments') });

  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
});

test('payments: the CSV export', async () => {
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
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain(paid.referenceCode);
  expect(csv).toContain('QPAY');
  await expect(toast(mn.payments.export.done)).toBeVisible();
});

test('users: search, grant, remove a device and revoke, each behind a confirmation', async () => {
  await navLink(mn.nav.users).click();
  await page.getByLabel(mn.users.searchLabel).fill(paid.username);
  await page.getByRole('row', { name: new RegExp(paid.username) }).click();
  await expect(page.getByRole('heading', { name: paid.name })).toBeVisible();

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

  // revoke the paid subscription (reason required)
  await page
    .getByRole('listitem')
    .filter({ hasText: paid.referenceCode })
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
      .filter({ hasText: paid.referenceCode })
      .getByText(mn.subscriptionStatus.REVOKED),
  ).toBeVisible();
});

test('categories: create, reorder, edit and delete', async () => {
  const stamp = Date.now();
  const name = `Тест ангилал ${stamp}`;
  await navLink(mn.nav.categories).click();
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

test('categories: upload a cover and see the preview', async () => {
  const stamp = Date.now();
  const name = `Зурагтай ангилал ${stamp}`;
  await navLink(mn.nav.categories).click();
  await page.getByRole('button', { name: mn.categories.new }).first().click();
  const form = dialog(mn.categories.formCreate);
  await form.getByLabel(mn.categories.name).fill(name);
  await form.getByLabel(mn.categories.slug).fill(`e2e-cover-${stamp}`);
  await form.getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.categories.created)).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(name) });
  await row.getByRole('button', { name: mn.common.edit }).click();
  const editing = dialog(mn.categories.formEdit);
  await expect(editing.getByRole('img', { name: mn.categories.cover.alt })).toHaveCount(0);

  const cover = await sharp({
    create: { width: 1280, height: 720, channels: 3, background: '#887766' },
  })
    .png()
    .toBuffer();
  await editing
    .getByLabel(mn.episodes.cover.choose)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: cover });
  await expect(toast(mn.episodes.cover.uploaded)).toBeVisible();
  // A background job stores the picture; the form looks again until it shows.
  await expect(editing.getByRole('img', { name: mn.categories.cover.alt })).toBeVisible({
    timeout: 30_000,
  });
  await editing.getByRole('button', { name: mn.common.cancel }).click();

  await row.getByRole('button', { name: mn.common.delete }).click();
  const deleting = dialog(mn.categories.deleteTitle);
  await deleting.getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.categories.deleted)).toBeVisible();
});

test('episodes: create, cover, and an audio upload that resumes after a page refresh', async () => {
  test.setTimeout(150_000);
  await navLink(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  const title = `E2E анги ${Date.now()}`;
  await page.getByLabel(mn.episodes.form.title).fill(title);
  const category = page.getByLabel(mn.episodes.form.category);
  await category.selectOption({ index: 1 });
  await page.getByRole('button', { name: mn.episodes.form.create }).click();
  await expect(toast(mn.episodes.workspace.saved).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await expect(page.getByText(mn.episodes.status.DRAFT).first()).toBeVisible();

  // nothing can be published yet, and the page says why
  await expect(page.getByRole('button', { name: mn.episodes.publish.now })).toBeDisabled();
  // The checklist: title and category are done, cover and file are not.
  const checklist = page.getByRole('list', { name: mn.episodes.workspace.checklistTitle });
  await expect(checklist.locator('li.is-ok')).toHaveCount(1);
  await expect(checklist.locator('li:not(.is-ok)')).toHaveText([
    mn.episodes.workspace.checkCover,
    mn.episodes.workspace.checkMedia,
  ]);

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
  // Restoring the session takes a refresh + /me round trip.
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

// The sidebar link (the detail pages have a back link with a similar name).
const sidebar = (name: string) =>
  page.getByRole('navigation', { name: mn.nav.label }).getByRole('link', { name, exact: true });

// A draft e2e episode through the screens; returns its title.
async function createDraft(label: string, stamp: number): Promise<string> {
  const title = `E2E анги ${label} ${stamp}`;
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  await page.getByLabel(mn.episodes.form.title).fill(title);
  await page.getByLabel(mn.episodes.form.category).selectOption({ index: 1 });
  await page.getByRole('button', { name: mn.episodes.form.create }).click();
  await expect(toast(mn.episodes.workspace.saved).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  return title;
}

test('one page: files picked before the draft exists wait, then go up when it is made', async () => {
  const title = `E2E анги ${Date.now()}`;
  await sidebar(mn.nav.episodes).click();
  // No remembered category (ADR-0068), so the files have to wait for one.
  await page.evaluate(() => localStorage.removeItem('ongod:admin-last-category'));
  await page.getByRole('button', { name: mn.episodes.new }).click();

  // A cover and an audio file first, with no category yet: both are kept and nothing is created.
  const cover = await sharp({
    create: { width: 600, height: 600, channels: 3, background: '#665544' },
  })
    .png()
    .toBuffer();
  await page
    .getByLabel(mn.episodes.cover.choose)
    .setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: cover });
  await expect(page.getByRole('img', { name: mn.episodes.cover.alt })).toBeVisible();
  const folder = mkdtempSync(join(tmpdir(), 'ongod-e2e-'));
  const audioPath = join(folder, 'e2e-staged.mp3');
  writeFileSync(audioPath, Buffer.alloc(1024 * 1024, 3));
  await page.getByLabel(mn.episodes.audio.choose).setInputFiles(audioPath);
  await expect(page.getByText('e2e-staged.mp3')).toBeVisible();
  await expect(page).toHaveURL(/episodes\/new$/);
  // The file name is the starting title.
  await expect(page.getByLabel(mn.episodes.form.title)).toHaveValue('e2e-staged');

  // A category picked: the draft is made by itself (no Үүсгэх), the URL moves, the files go up.
  const chunk = page.waitForResponse(
    (res) =>
      res.request().method() === 'PATCH' &&
      res.url().includes('/v1/admin/uploads/') &&
      res.status() === 204,
  );
  await page.getByLabel(mn.episodes.form.title).fill(title);
  await page.getByLabel(mn.episodes.form.category).selectOption({ index: 1 });
  await expect(toast(mn.episodes.workspace.saved).first()).toBeVisible();
  await expect(page).toHaveURL(/episodes\/(?!new)[a-z0-9]+$/);
  await expect(toast(mn.episodes.cover.uploaded)).toBeVisible();
  await chunk;
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  rmSync(folder, { recursive: true, force: true });
});

test('a picked file names the item, keeps the last category and starts at once; leaving asks first', async () => {
  // ADR-0068. The test before made a draft, so this browser remembers its category.
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  await page.route('**/v1/admin/uploads/**', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 2500));
    // Leaving aborts the upload: the held-back chunk may already be gone.
    await route.continue().catch(() => undefined);
  });
  const name = `E2E анги ${Date.now()}`;
  await page.getByLabel(mn.episodes.audio.choose).setInputFiles({
    name: `${name}.mp3`,
    mimeType: 'audio/mpeg',
    buffer: Buffer.alloc(12 * 1024 * 1024, 5),
  });
  // No Үүсгэх: the title comes from the file name and the draft is made right away.
  await expect(page).toHaveURL(/episodes\/(?!new)[a-z0-9]+$/);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await expect(page.locator('.admin-uploader__progress progress')).toBeVisible();

  // Leaving during the upload asks; "Болих" stays, "Гарах" leaves.
  await sidebar(mn.nav.episodes).click();
  await expect(dialog(mn.episodes.leave.uploadingTitle)).toBeVisible();
  await dialog(mn.episodes.leave.uploadingTitle)
    .getByRole('button', { name: mn.common.cancel })
    .click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
  await sidebar(mn.nav.episodes).click();
  await dialog(mn.episodes.leave.uploadingTitle)
    .getByRole('button', { name: mn.episodes.leave.leave })
    .click();
  await expect(page.getByRole('heading', { name: mn.episodes.title, level: 1 })).toBeVisible();
  await page.unroute('**/v1/admin/uploads/**');
});

test('an item with a ready file shows a small "Файл солих" instead of the big drop zone', async () => {
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('row', { name: /Их Монгол улсын зам/ }).click();
  await expect(page.getByText(mn.episodes.audio.replaceCompact)).toBeVisible();
  await expect(page.getByText(mn.episodes.workspace.fileEmpty)).toHaveCount(0);
});

test('Олон файл: several files make one draft each; a wrong file is shown and not sent', async () => {
  // ADR-0070. The category is the one remembered from the drafts made above.
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.bulkUpload.button }).click();
  await expect(
    page.getByRole('heading', { name: mn.episodes.bulkUpload.title, level: 1 }),
  ).toBeVisible();
  const stamp = Date.now();
  const names = [`E2E анги ${stamp} A`, `E2E анги ${stamp} B`];
  await page.getByLabel(mn.episodes.bulkUpload.choose).setInputFiles([
    ...names.map((name) => ({
      name: `${name}.mp3`,
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(64 * 1024, 2),
    })),
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not media') },
  ]);
  const list = page.getByRole('list', { name: mn.episodes.bulkUpload.listLabel });
  await expect(list.getByRole('listitem')).toHaveCount(3);
  await expect(list.getByText(mn.episodes.audio.invalidType)).toBeVisible();

  await page.getByRole('button', { name: mn.episodes.bulkUpload.start(2) }).click();
  await expect(page.getByText(mn.episodes.bulkUpload.finished(2))).toBeVisible({ timeout: 30_000 });
  await expect(list.getByRole('link', { name: mn.episodes.bulkUpload.open })).toHaveCount(2);

  await sidebar(mn.nav.episodes).click();
  for (const name of names) await expect(page.getByText(name, { exact: true })).toBeVisible();
});

test('Олон файл: leaving during the upload stops the list, as the warning says (re-audit)', async () => {
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.bulkUpload.button }).click();
  await page.route('**/v1/admin/uploads/**', async (route) => {
    if (route.request().method() === 'PATCH') await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => undefined);
  });
  const stamp = Date.now();
  const names = [`E2E зогсох ${stamp} A`, `E2E зогсох ${stamp} B`];
  await page.getByLabel(mn.episodes.bulkUpload.choose).setInputFiles(
    names.map((name) => ({
      name: `${name}.mp3`,
      mimeType: 'audio/mpeg',
      buffer: Buffer.alloc(12 * 1024 * 1024, 4),
    })),
  );
  await page.getByRole('button', { name: mn.episodes.bulkUpload.start(2) }).click();
  await expect(page.locator('.admin-bulk-list progress')).toBeVisible();

  await sidebar(mn.nav.episodes).click();
  await dialog(mn.episodes.leave.uploadingTitle)
    .getByRole('button', { name: mn.episodes.leave.leave })
    .click();
  await expect(page.getByRole('heading', { name: mn.episodes.title, level: 1 })).toBeVisible();
  await page.unroute('**/v1/admin/uploads/**');
  // The first draft exists (to resume on); the second file was never started.
  await page.waitForTimeout(4000);
  await page.reload();
  await expect(page.getByText(names[0]!, { exact: true })).toBeVisible();
  await expect(page.getByText(names[1]!, { exact: true })).toHaveCount(0);
});

test('series: create, add two existing items, move the second up, order survives a reload', async () => {
  const stamp = Date.now();
  const first = await createDraft('A', stamp);
  const second = await createDraft('B', stamp);

  await sidebar(mn.nav.series).click();
  await page.getByRole('button', { name: mn.series.new }).first().click();
  const title = `E2E цуврал ${stamp}`;
  await page.getByLabel(mn.series.form.title).fill(title);
  await page.getByLabel(mn.series.form.slug).fill(`e2e-series-${stamp}`);
  await page.getByRole('button', { name: mn.series.form.create }).click();
  await expect(toast(mn.series.created)).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  // add the two existing items, one after the other (each takes the next part)
  const picker = page.locator('section', { hasText: mn.picker.title });
  await picker.getByLabel(mn.picker.searchLabel).fill(String(stamp));
  for (const item of [first, second]) {
    const pick = picker.getByRole('listitem').filter({ hasText: item });
    await pick.getByRole('button', { name: mn.picker.add }).click();
    await expect(pick.getByRole('button', { name: mn.picker.added })).toBeVisible();
  }

  const items = page.locator('section', { hasText: mn.series.items.title }).first();
  const order = async () =>
    (await items.getByRole('listitem').allInnerTexts()).map((text) =>
      text.includes(first) ? 'first' : text.includes(second) ? 'second' : '?',
    );
  await expect.poll(order).toEqual(['first', 'second']);

  await page.getByRole('button', { name: mn.sortable.moveUp(second) }).click();
  await expect(toast(mn.series.items.reordered)).toBeVisible();
  await expect.poll(order).toEqual(['second', 'first']);

  await page.reload();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect.poll(order).toEqual(['second', 'first']);

  // delete the series (the items stay), then the two drafts
  await page.getByRole('button', { name: mn.series.deleteSeries }).click();
  await dialog(mn.series.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.series.deleted)).toBeVisible();

  for (const draft of [first, second]) {
    await sidebar(mn.nav.episodes).click();
    await page.getByLabel(mn.episodes.searchLabel).fill(draft);
    await page.getByRole('row').filter({ hasText: draft }).click();
    await page.getByRole('button', { name: mn.episodes.deleteEpisode }).click();
    await dialog(mn.episodes.deleteConfirmTitle)
      .getByRole('button', { name: mn.common.delete })
      .click();
    await expect(toast(mn.episodes.deleted)).toBeVisible();
  }
});

test('playlists: create one shown on the home page, Онцлох cannot be deleted', async () => {
  const stamp = Date.now();
  await sidebar(mn.nav.playlists).click();
  await page.getByRole('button', { name: mn.playlists.new }).first().click();
  const title = `E2E жагсаалт ${stamp}`;
  await page.getByLabel(mn.playlists.form.title).fill(title);
  await page.getByLabel(mn.playlists.form.slug).fill(`e2e-playlist-${stamp}`);
  await page.getByLabel(mn.playlists.form.showOnHome).check();
  await page.getByRole('button', { name: mn.playlists.form.create }).click();
  await expect(toast(mn.playlists.created)).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();

  await sidebar(mn.nav.playlists).click();
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toContainText(mn.playlists.onHome);
  // it is in the home-order list too
  await expect(
    page.locator('section', { hasText: mn.playlists.home.title }).getByText(title),
  ).toBeVisible();

  // Онцлох (id `featured`) is refused by the server and the error shows as a toast
  const featured = page.getByRole('row').filter({ hasText: mn.playlists.featured }).first();
  await featured.getByRole('button', { name: mn.common.delete }).click();
  await dialog(mn.playlists.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(featured).toBeVisible();

  await row.getByRole('button', { name: mn.common.delete }).click();
  await dialog(mn.playlists.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.playlists.deleted)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('tags: create and delete', async () => {
  const name = `E2E шошго ${Date.now()}`;
  await sidebar(mn.nav.tags).click();
  await page.getByRole('button', { name: mn.tags.new }).first().click();
  await dialog(mn.tags.formCreate).getByLabel(mn.tags.name).fill(name);
  await dialog(mn.tags.formCreate).getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.tags.created)).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: mn.common.delete }).click();
  await dialog(mn.tags.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.tags.deleted)).toBeVisible();
  await expect(row).toHaveCount(0);
});

test('plans: add a switched-off plan, change its price; the days lock once it is used', async () => {
  // Plans cannot be deleted (ADR-0059): the test plan is created switched off, so the portal
  // never offers it.
  const name = `E2E багц ${Date.now()}`;
  await navLink(mn.nav.plans).click();
  await expect(page.getByRole('heading', { level: 1, name: mn.plans.title })).toBeVisible();
  await page.getByRole('button', { name: mn.plans.new }).first().click();
  const create = dialog(mn.plans.formCreate);
  await create.getByLabel(mn.plans.name).fill(name);
  await create.getByLabel(mn.plans.price).fill('15,000');
  await create.getByLabel(mn.plans.durationDays).fill('30');
  await create.getByLabel(mn.plans.activeLabel).uncheck();
  await create.getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.plans.created)).toBeVisible();

  const row = page.getByRole('row', { name: new RegExp(name) });
  await expect(row).toContainText('15,000₮');
  await expect(row).toContainText(mn.plans.days(30));
  await expect(row).toContainText(mn.plans.inactive);
  await row.getByRole('button', { name: mn.common.edit }).click();
  const edit = dialog(mn.plans.formEdit);
  await expect(edit.getByLabel(mn.plans.durationDays)).toBeEnabled();
  await edit.getByLabel(mn.plans.price).fill('17000');
  await edit.getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.common.saved)).toBeVisible();
  await expect(row).toContainText('17,000₮');

  // The seeded yearly plan has subscriptions: its days cannot change.
  // 365 days read as "1 жил" (planLength).
  const yearly = page
    .getByRole('row')
    .filter({ hasText: mn.plans.days(365) })
    .first();
  await yearly.getByRole('button', { name: mn.common.edit }).click();
  await expect(dialog(mn.plans.formEdit).getByLabel(mn.plans.durationDays)).toBeDisabled();
  await expect(dialog(mn.plans.formEdit)).toContainText(mn.plans.daysLocked);
  await dialog(mn.plans.formEdit).getByRole('button', { name: mn.common.cancel }).click();
});

test('gifts: the page lists gifts by status and shows the unredeemed amount', async () => {
  await navLink(mn.nav.gifts).click();
  await expect(page.getByRole('heading', { level: 1, name: mn.gifts.title })).toBeVisible();
  await expect(page.getByText(/Ашиглагдаагүй бэлгийн дүн: [\d,]+₮/)).toBeVisible();
  await page.getByLabel(mn.gifts.statusLabel).selectOption('REDEEMED');
  // Gifts redeemed by the portal e2e run, if any, show a code-less row with a recipient.
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByLabel(mn.gifts.statusLabel).selectOption('PAID');
  await expect(page.getByRole('table')).toBeVisible();
});

test('comments: the moderation page opens with the reported filter and can switch', async () => {
  await navLink(mn.nav.comments).click();
  await expect(page.getByRole('heading', { level: 1, name: mn.comments.title })).toBeVisible();
  await expect(page.getByLabel(mn.comments.filterLabel)).toHaveValue('REPORTED');
  await page.getByLabel(mn.comments.filterLabel).selectOption('VISIBLE');
  await expect(page.getByRole('table')).toBeVisible();
});

// Deletes one e2e draft through its edit screen (found by its exact title in the list).
async function deleteDraft(title: string) {
  await sidebar(mn.nav.episodes).click();
  await page.getByLabel(mn.episodes.searchLabel).fill(title);
  await page.getByRole('row').filter({ hasText: title }).first().click();
  await page.getByRole('button', { name: mn.episodes.deleteEpisode }).click();
  await dialog(mn.episodes.deleteConfirmTitle)
    .getByRole('button', { name: mn.common.delete })
    .click();
  // back on the list (an earlier toast may still be on screen, so do not wait for a toast)
  await expect(page.getByRole('heading', { name: mn.episodes.title })).toBeVisible();
  await expect(page.getByLabel(mn.episodes.searchLabel)).toBeVisible();
}

test('content: series, part and tags are saved; filter by tag; bulk tag; duplicate', async () => {
  test.setTimeout(150_000);
  const stamp = Date.now();
  const seriesTitle = `E2E цуврал ${stamp}`;
  const tagOne = `E2E шошго ${stamp}`;
  const tagTwo = `E2E бөөнөөр ${stamp}`;
  const first = `E2E анги A ${stamp}`;
  const second = `E2E анги B ${stamp}`;
  const f = mn.episodes.form;

  // fixtures: a series and a second tag (the first tag is created in the picker with Enter)
  await sidebar(mn.nav.series).click();
  await page.getByRole('button', { name: mn.series.new }).first().click();
  await page.getByLabel(mn.series.form.title).fill(seriesTitle);
  await page.getByLabel(mn.series.form.slug).fill(`e2e-series-${stamp}`);
  await page.getByRole('button', { name: mn.series.form.create }).click();
  await expect(toast(mn.series.created)).toBeVisible();

  await sidebar(mn.nav.tags).click();
  await page.getByRole('button', { name: mn.tags.new }).first().click();
  await dialog(mn.tags.formCreate).getByLabel(mn.tags.name).fill(tagTwo);
  await dialog(mn.tags.formCreate).getByRole('button', { name: mn.common.save }).click();
  await expect(toast(mn.tags.created)).toBeVisible();

  // first item: series + part 3 + a new tag made with Enter; all still there after a reload
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  await page.getByLabel(f.title, { exact: true }).fill(first);
  await page.getByLabel(f.category, { exact: true }).selectOption({ index: 1 });
  await expect(page.getByLabel(f.part, { exact: true })).toHaveCount(0); // only with a series
  await page.getByLabel(f.series, { exact: true }).selectOption({ label: seriesTitle });
  await page.getByLabel(f.part, { exact: true }).fill('3');
  const picker = page.getByLabel(f.tags, { exact: true });
  await picker.fill(tagOne);
  await picker.press('Enter');
  await expect(
    page.getByRole('button', { name: mn.episodes.tagPicker.remove(tagOne) }),
  ).toBeVisible();
  await page.getByRole('button', { name: f.create }).click();
  await expect(toast(mn.episodes.workspace.saved).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: first, level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: first, level: 1 })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByLabel(f.series, { exact: true })).toHaveValue(/.+/);
  await expect(page.getByLabel(f.series, { exact: true }).locator('option:checked')).toHaveText(
    seriesTitle,
  );
  await expect(page.getByLabel(f.part, { exact: true })).toHaveValue('3');
  await expect(
    page.getByRole('button', { name: mn.episodes.tagPicker.remove(tagOne) }),
  ).toBeVisible();

  // second item: same series, the part left empty (the next one is taken), same tag by Enter
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.new }).click();
  await page.getByLabel(f.title, { exact: true }).fill(second);
  await page.getByLabel(f.category, { exact: true }).selectOption({ index: 1 });
  await page.getByLabel(f.series, { exact: true }).selectOption({ label: seriesTitle });
  const again = page.getByLabel(f.tags, { exact: true });
  await again.fill(tagOne);
  await again.press('Enter');
  await expect(
    page.getByRole('button', { name: mn.episodes.tagPicker.remove(tagOne) }),
  ).toBeVisible();
  await page.getByRole('button', { name: f.create }).click();
  await expect(page.getByRole('heading', { name: second, level: 1 })).toBeVisible();
  await expect(page.getByLabel(f.part, { exact: true })).toHaveValue('4');

  // the list: filter by the tag, the series column shows the series
  await sidebar(mn.nav.episodes).click();
  // The search is debounced and a changed filter clears the selection: let it apply before ticking rows.
  const searched = page.waitForResponse(
    (res) => res.url().includes('/v1/admin/episodes') && res.url().includes('q=' + stamp),
  );
  await page.getByLabel(mn.episodes.searchLabel).fill(String(stamp));
  await searched;
  // Tag, series, list, file status and sort sit in the collapsible filter panel.
  await page.getByRole('button', { name: mn.episodes.filterPanel.toggle }).click();
  await page.getByLabel(mn.episodes.filters.tag, { exact: true }).selectOption({ label: tagOne });
  const rowOf = (title: string) => page.getByRole('row').filter({ hasText: title });
  await expect(rowOf(first)).toBeVisible();
  await expect(rowOf(second)).toBeVisible();
  await expect(rowOf(first)).toContainText(seriesTitle);
  await page.getByLabel(mn.episodes.filters.tag, { exact: true }).selectOption({ label: tagTwo });
  await expect(rowOf(first)).toHaveCount(0);
  await page.getByLabel(mn.episodes.filters.tag, { exact: true }).selectOption({ label: tagOne });
  await expect(rowOf(first)).toBeVisible();

  // bulk: select both rows and add the second tag
  await page.getByLabel(mn.episodes.columns.selectRow(first)).check();
  await page.getByLabel(mn.episodes.columns.selectRow(second)).check();
  const bar = page.getByRole('region', { name: mn.episodes.bulk.region });
  await expect(bar).toContainText(mn.episodes.bulk.selected(2));
  await bar.getByLabel(mn.episodes.bulk.action, { exact: true }).selectOption({
    label: mn.episodes.bulk.types.addTag,
  });
  await bar.getByLabel(mn.episodes.bulk.tag, { exact: true }).selectOption({ label: tagTwo });
  await bar.getByRole('button', { name: mn.episodes.bulk.apply }).click();
  await expect(toast(mn.episodes.bulk.done(2))).toBeVisible();
  await expect(bar).toHaveCount(0); // the selection is cleared
  await page.getByLabel(mn.episodes.filters.tag, { exact: true }).selectOption({ label: tagTwo });
  await expect(rowOf(first)).toBeVisible();
  await expect(rowOf(second)).toBeVisible();

  // duplicate: lands on the copy's edit page, titled with "(хуулбар)"
  await rowOf(first).click();
  await page.getByRole('button', { name: mn.episodes.duplicate.button }).click();
  await expect(toast(mn.episodes.duplicate.done)).toBeVisible();
  await expect(page.getByRole('heading', { name: /\(хуулбар\)/, level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: first, level: 1 })).toContainText(first);

  // clean up: the three drafts, then the series and both tags
  await deleteDraft(`${first} (хуулбар)`);
  await deleteDraft(first);
  await deleteDraft(second);
  await sidebar(mn.nav.series).click();
  await page
    .getByRole('row', { name: new RegExp(seriesTitle) })
    .getByRole('button', { name: mn.common.edit })
    .click();
  await page.getByRole('button', { name: mn.series.deleteSeries }).click();
  await dialog(mn.series.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
  await expect(toast(mn.series.deleted)).toBeVisible();
  await sidebar(mn.nav.tags).click();
  for (const name of [tagOne, tagTwo]) {
    const row = page.getByRole('row', { name: new RegExp(name) });
    await row.getByRole('button', { name: mn.common.delete }).click();
    await dialog(mn.tags.deleteTitle).getByRole('button', { name: mn.common.delete }).click();
    await expect(toast(mn.tags.deleted)).toBeVisible();
    await expect(row).toHaveCount(0);
  }
});

test('free: mark an item free, see the badge, mark it paid again', async () => {
  const stamp = Date.now();
  const title = await createDraft('Free', stamp);
  const checkbox = page.getByLabel(mn.episodes.free, { exact: true });
  const listRow = async () => {
    await sidebar(mn.nav.episodes).click();
    await page.getByLabel(mn.episodes.searchLabel).fill(title);
    return page.getByRole('row').filter({ hasText: title });
  };

  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await page.getByRole('button', { name: mn.common.save }).first().click();
  await expect(toast(mn.common.saved)).toBeVisible();
  let row = await listRow();
  await expect(row.locator('.ui-badge', { hasText: mn.episodes.free })).toBeVisible();

  await row.click();
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await page.getByRole('button', { name: mn.common.save }).first().click();
  await expect(toast(mn.common.saved)).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  row = await listRow();
  await expect(row).toBeVisible();
  await expect(row.locator('.ui-badge', { hasText: mn.episodes.free })).toHaveCount(0);

  await deleteDraft(title);
});

test('content: the calendar shows a scheduled item on its day and opens it', async () => {
  const stamp = Date.now();
  const title = await createDraft('Cal', stamp);
  const draftId = /\/episodes\/([^/?#]+)/.exec(page.url())?.[1] ?? '';
  expect(draftId).not.toBe('');
  const loaded = page.waitForResponse(
    (res) =>
      res.url().endsWith(`/v1/admin/episodes/${draftId}`) && res.request().method() === 'GET',
  );
  await page.reload();
  const draft = ((await (await loaded).json()) as { episode: Record<string, unknown> }).episode;

  // Scheduling needs a cover and a READY file, which this stack cannot make (storage is not
  // usable, see the upload test). So the calendar's own list request gets the draft back as if it
  // were scheduled for today at noon (Ulaanbaatar): the grid, the chip and the link are real.
  const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);
  const calendarRequest = /\/v1\/admin\/episodes\?(?:.*&)?from=/;
  await page.route(calendarRequest, async (route) => {
    const real = await route.fetch();
    const body = (await real.json()) as { items: unknown[]; total: number };
    // The API answers instants in UTC ("Z"), so the mock does too: noon in Ulaanbaatar.
    const scheduledFor = new Date(`${today}T12:00:00+08:00`).toISOString();
    body.items.push({ ...draft, status: 'SCHEDULED', scheduledFor });
    body.total += 1;
    await route.fulfill({ response: real, json: body });
  });

  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.view.calendar }).click();
  await expect(page).toHaveURL(/view=calendar/);
  const chip = page.locator(`[data-day="${today}"]`).getByRole('link', { name: new RegExp(title) });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveClass(/ui-badge--info/); // scheduled = the same tone as the list badge

  // the view survives a reload (it lives in the URL)
  await page.reload();
  await expect(chip).toBeVisible({ timeout: 20_000 });

  // a click opens the item
  await chip.click();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.unroute(calendarRequest);

  // back to the list view: the toggle clears the URL
  await sidebar(mn.nav.episodes).click();
  await page.getByRole('button', { name: mn.episodes.view.list }).click();
  await expect(page).not.toHaveURL(/view=calendar/);

  await deleteDraft(title);
});

test('audit log lists what was done, and can be filtered', async () => {
  await navLink(mn.nav.audit).click();
  await expect(page.getByRole('heading', { name: mn.audit.title })).toBeVisible();
  await page.getByLabel(mn.audit.actionLabel).fill('subscription.revoke');
  const rows = page.getByRole('row').filter({ hasText: 'subscription.revoke' });
  await expect(rows.first()).toBeVisible();
  await rows.first().getByText(mn.audit.showData).click();
  await expect(rows.first().getByText('E2E: буцаалт')).toBeVisible();
});

test('the session survives a reload without asking for the code again', async () => {
  await page.goto('');
  await expect(page.getByRole('heading', { name: mn.dashboard.title })).toBeVisible();
  // the access token is in memory only; nothing sensitive sits in web storage
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
  expect(stored).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // no JWT
});
