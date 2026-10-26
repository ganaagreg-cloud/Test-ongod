import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import type { mn as Mn } from '../src/i18n/mn';

export const ORIGIN = process.env.ADMIN_E2E_URL ?? 'http://localhost:3000';
export const MAILPIT = 'http://localhost:8025';

/**
 * Where screenshots go (ADR-0045): test-results/screens/ at the repo root (ignored) by default, so
 * a run leaves no changed files in git; the tracked docs/screens/ only with UPDATE_SCREENS=1.
 */
export const shot = (name: string) =>
  fileURLToPath(
    new URL(
      `../../../${process.env.UPDATE_SCREENS === '1' ? 'docs/screens' : 'test-results/screens'}/${name}.png`,
      import.meta.url,
    ),
  );

/** The owner's login from the local .env. Read here, never printed. */
export function ownerLogin(): { identifier: string; password: string } {
  const env = Object.fromEntries(
    readFileSync(new URL('../../../.env', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]!.replace(/^"(.*)"$/, '$1')]),
  );
  if (!env.SEED_OWNER_PASSWORD) throw new Error('SEED_OWNER_PASSWORD is not set in .env');
  return { identifier: 'owner', password: env.SEED_OWNER_PASSWORD };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The newest 6-digit code mailed to this address. */
export async function emailedCode(to: string): Promise<string> {
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
    await sleep(1000);
  }
  throw new Error(`no email with a code for ${to}`);
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${ORIGIN}/v1${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export interface Customer {
  username: string;
  referenceCode: string;
  name: string;
}

/**
 * A new customer who has verified their email and paid a plan at the mock QPay checkout (the
 * stack has no Wire keys, ADR-0041): an ACTIVE subscription with a QPAY payment, no admin step.
 */
export async function customerWhoPaid(tag: string): Promise<Customer> {
  const stamp = Date.now();
  const username = `e2e.${tag}.${stamp}`;
  const email = `${username}@example.com`;
  const password = 'e2e-Password-1';

  await post('/auth/register', {
    lastName: 'Тест',
    firstName: `Админ-${tag}`,
    phone: '99112233',
    email,
    username,
    password,
  });
  await post('/auth/verify-email', { email, code: await emailedCode(email) });
  const login = await post<{ accessToken: string }>('/auth/login', {
    identifier: username,
    password,
    deviceId: `e2e-device-${tag}-${stamp}`,
    platform: 'ios',
    model: 'E2E Phone',
  });
  const token = login.accessToken;

  const plans = await fetch(`${ORIGIN}/v1/plans`).then(
    (r) => r.json() as Promise<{ plans: Array<{ id: string }> }>,
  );
  const created = await post<{ subscription: { id: string; referenceCode: string } }>(
    '/subscriptions',
    { planId: plans.plans[0]!.id },
    token,
  );

  const paid = await post<{ subscription: { status: string } }>(
    `/subscriptions/${created.subscription.id}/mock`,
    { outcome: 'success' },
    token,
  );
  if (paid.subscription.status !== 'ACTIVE') throw new Error('the mock payment did not activate');

  return {
    username,
    referenceCode: created.subscription.referenceCode,
    name: `Тест Админ-${tag}`,
  };
}

/** Signs in as the owner with the password. */
export async function signIn(page: Page, mn: typeof Mn) {
  const { identifier, password } = ownerLogin();
  await page.goto('');
  await page.getByLabel(mn.login.identifier).fill(identifier);
  await page.getByLabel(mn.login.password).fill(password);
  await page.getByRole('button', { name: mn.login.submit }).click();

  const ready = page.getByRole('navigation', { name: mn.nav.label });
  // Every run is a new browser, i.e. a new device. At the limit of two, use the login screen's
  // "remove one and sign in" button (this is also how an admin frees a slot).
  const full = page.getByText(mn.login.deviceLimitTitle);
  await ready.or(full).waitFor();
  if (await full.isVisible()) {
    await page.getByRole('button', { name: mn.login.removeAndLogin }).first().click();
  }
  await ready.waitFor();
}

/**
 * Tidies up after a run, through the admin screens (so it needs no extra device or login):
 * deletes leftover "E2E анги" drafts. Runs even when a test failed halfway.
 *
 * It must never touch anything that is not test data: it waits for the filtered list from the
 * API, and then only acts on rows whose own text says they are e2e rows ("E2E анги" titles). The
 * first version acted on the first row of a not-yet-filtered list and deleted a seeded draft
 * (restored; see the 2026-10-09 log).
 */
export async function cleanUp(page: Page, mn: typeof Mn) {
  const filtered = (path: string, query: string) =>
    page.waitForResponse((res) => res.url().includes(path) && res.url().includes(query));

  await page.goto('episodes'); // also closes anything a failed test left open
  const e2eEpisodes = page.getByRole('row').filter({ hasText: 'E2E анги' });
  const episodes = filtered('/admin/episodes', 'q=E2E');
  await page.getByLabel(mn.episodes.searchLabel).fill('E2E анги');
  await episodes;
  for (let guard = 0; guard < 20 && (await e2eEpisodes.count()) > 0; guard++) {
    await e2eEpisodes.first().click();
    await page.getByRole('button', { name: mn.episodes.deleteEpisode }).click();
    const confirm = page.getByRole('dialog', { name: mn.episodes.deleteConfirmTitle });
    await confirm.getByRole('button', { name: mn.common.delete }).click();
    await page.getByRole('heading', { name: mn.episodes.title }).waitFor();
    // back on the list; wait for the unfiltered list to be replaced by the filtered one again
    const again = filtered('/admin/episodes', 'q=E2E');
    await page.getByLabel(mn.episodes.searchLabel).fill('E2E анги');
    await again;
  }

  // Series, lists, tags and categories the tests made. Order matters: a category with episodes
  // cannot go, and the episodes are already deleted above.
  await sweep(page, mn, mn.nav.series, async (row) => {
    await row.getByRole('button', { name: mn.common.edit }).click({ timeout: 5000 });
    await page.getByRole('button', { name: mn.series.deleteSeries }).click({ timeout: 5000 });
    await page
      .getByRole('dialog', { name: mn.series.deleteTitle })
      .getByRole('button', { name: mn.common.delete })
      .click();
  });
  const viaRowButton = (title: string) => async (row: Locator) => {
    await row.getByRole('button', { name: mn.common.delete }).click({ timeout: 5000 });
    await page
      .getByRole('dialog', { name: title })
      .getByRole('button', { name: mn.common.delete })
      .click();
  };
  await sweep(page, mn, mn.nav.playlists, viaRowButton(mn.playlists.deleteTitle));
  await sweep(page, mn, mn.nav.tags, viaRowButton(mn.tags.deleteTitle));
  await sweep(page, mn, mn.nav.categories, viaRowButton(mn.categories.deleteTitle));
}

/**
 * Opens a list from the sidebar and deletes its rows whose text says "E2E" (and only those), one
 * at a time, until none is left. `remove` does the deleting for one row.
 */
async function sweep(
  page: Page,
  mn: typeof Mn,
  navLabel: string,
  remove: (row: Locator) => Promise<void>,
) {
  const link = page
    .getByRole('navigation', { name: mn.nav.label })
    .getByRole('link', { name: navLabel, exact: true });
  const mine = () => page.getByRole('row').filter({ hasText: E2E_MARK });
  for (let guard = 0; guard < 20; guard++) {
    await link.click();
    // The page's own heading: rows of the page we just left must not be counted.
    await page.getByRole('heading', { level: 1, name: navLabel }).waitFor();
    // The list first shows cached data (with the row just deleted) or nothing yet: let it refetch.
    await page.waitForLoadState('networkidle');
    if ((await mine().count()) === 0) return;
    // A row that vanishes under the click (the list refreshed) is not an error: look again.
    await remove(mine().first()).catch(() => undefined);
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
  }
}

/** Every record the e2e tests create has this in its name (the one-time script uses it too). */
export const E2E_MARK = 'E2E';

/** How many rows of a list are NOT test data (the cleanup must leave this number alone). */
export async function foreignEpisodes(page: Page): Promise<number> {
  const marker = 'E2E анги';
  const loaded = page.waitForResponse((res) => res.url().includes('/admin/episodes'));
  await page.goto('episodes');
  await loaded;
  // While loading, the table is aria-busy and shows aria-hidden skeleton rows, which would count
  // as 0 rows (it did on 2026-10-17 in the afterAll check).
  await page.locator('table:not([aria-busy])').waitFor();
  return page
    .getByRole('row')
    .filter({ has: page.locator('td') })
    .filter({ hasNotText: marker })
    .count();
}
