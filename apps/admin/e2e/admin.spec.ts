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
// in the dev database. One serial run with one session.
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
      mn.episodes.missing.text(`${mn.episodes.missing.cover}, ${mn.episodes.missing.media}`),
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
  await expect(toast(mn.episodes.created)).toBeVisible();
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  return title;
}

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
  await expect(toast(mn.episodes.created)).toBeVisible();
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
  await page.getByLabel(mn.episodes.searchLabel).fill(String(stamp));
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
