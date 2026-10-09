import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import type { mn as Mn } from '../src/i18n/mn';

export const ORIGIN = process.env.ADMIN_E2E_URL ?? 'http://localhost:3000';
export const MAILPIT = 'http://localhost:8025';
const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

export const shot = (name: string) =>
  fileURLToPath(new URL(`../../../docs/screens/${name}.png`, import.meta.url));

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

/** The current admin TOTP code of the local owner (the same helper `pnpm dev:totp` uses). */
export function totpCode(): string {
  const out = execFileSync('npx', ['pnpm', '--silent', 'dev:totp'], {
    cwd: repoRoot,
    shell: true,
    encoding: 'utf8',
  });
  const code = /\b(\d{6})\b/.exec(out)?.[1];
  if (!code) throw new Error('dev:totp printed no code');
  return code;
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

// A real 1x1 PNG: the API only checks the file signature for receipts.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

export interface Customer {
  username: string;
  referenceCode: string;
  name: string;
}

/** A new customer who has verified their email, picked a plan and pressed "Төлсөн". */
export async function customerWithSubmittedPayment(tag: string): Promise<Customer> {
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

  const form = new FormData();
  form.set('payerNote', `E2E тэмдэглэл ${tag}`);
  form.set('transferAt', new Date(stamp - 3600_000).toISOString());
  form.set('receipt', new Blob([PNG], { type: 'image/png' }), 'receipt.png');
  const submitted = await fetch(`${ORIGIN}/v1/subscriptions/${created.subscription.id}/submitted`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  if (!submitted.ok) throw new Error(`submit -> ${submitted.status} ${await submitted.text()}`);

  return {
    username,
    referenceCode: created.subscription.referenceCode,
    name: `Тест Админ-${tag}`,
  };
}

/** Signs in as the owner: password, then the authenticator code (setting it up the first time). */
export async function signIn(page: Page, mn: typeof Mn) {
  const { identifier, password } = ownerLogin();
  await page.goto('');
  await page.getByLabel(mn.login.identifier).fill(identifier);
  await page.getByLabel(mn.login.password).fill(password);
  await page.getByRole('button', { name: mn.login.submit }).click();

  const codeField = page.getByLabel(mn.totp.code);
  // Every run is a new browser, i.e. a new device. At the limit of two, use the login screen's
  // "remove one and sign in" button (this is also how an admin frees a slot).
  const full = page.getByText(mn.login.deviceLimitTitle);
  await codeField.or(full).waitFor();
  if (await full.isVisible()) {
    await page.getByRole('button', { name: mn.login.removeAndLogin }).first().click();
  }
  await codeField.waitFor();
  // On the setup screen the secret is stored when the QR code is shown, so dev:totp can read it.
  if (await page.getByRole('heading', { name: mn.totp.setupTitle }).isVisible()) {
    await page.locator('.admin-auth__secret').waitFor();
  }
  await codeField.fill(totpCode());
  await page.getByRole('button', { name: mn.totp.submit }).click();
}

/**
 * Tidies up after a run, through the admin screens (so it needs no extra device or login):
 * rejects e2e customers' payments that are still waiting and deletes leftover "E2E анги" drafts.
 * Runs even when a test failed halfway, so the owner's queue is not left with test data.
 *
 * It must never touch anything that is not test data: it waits for the filtered list from the
 * API, and then only acts on rows whose own text says they are e2e rows ("@e2e." usernames,
 * "E2E анги" titles). The first version acted on the first row of a not-yet-filtered list and
 * rejected a seeded payment and deleted a seeded draft (restored; see the 2026-10-09 log).
 */
export async function cleanUp(page: Page, mn: typeof Mn) {
  const filtered = (path: string, query: string) =>
    page.waitForResponse((res) => res.url().includes(path) && res.url().includes(query));

  await page.goto('payments'); // also closes anything a failed test left open
  const e2ePayments = page.getByRole('row').filter({ hasText: '@e2e.' });
  const payments = filtered('/admin/subscriptions', 'q=e2e');
  await page.getByLabel(mn.payments.searchLabel).fill('e2e.');
  await payments;
  for (let guard = 0; guard < 20 && (await e2ePayments.count()) > 0; guard++) {
    await e2ePayments.first().click();
    await page.keyboard.press('r');
    const reject = page.getByRole('dialog', { name: mn.payments.rejectTitle });
    await reject.getByLabel(mn.payments.rejectReason).fill('E2E: тестийн өгөгдөл цэвэрлэв');
    await reject.getByRole('button', { name: mn.payments.rejectSubmit }).click();
    await reject.waitFor({ state: 'hidden' });
  }

  await page.goto('episodes');
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
}

/** How many rows of a list are NOT test data (the cleanup must leave this number alone). */
export async function foreignRows(page: Page, screen: 'payments' | 'episodes'): Promise<number> {
  const api = screen === 'payments' ? '/admin/subscriptions' : '/admin/episodes';
  const marker = screen === 'payments' ? '@e2e.' : 'E2E анги';
  const loaded = page.waitForResponse((res) => res.url().includes(api));
  await page.goto(screen);
  await loaded;
  await page.getByRole('table').waitFor();
  return page
    .getByRole('row')
    .filter({ has: page.locator('td') })
    .filter({ hasNotText: marker })
    .count();
}
