import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { mn } from '../src/i18n/mn';

// CLAUDE.md and ADR-0006: the mobile apps (iOS AND Android) never show prices, bank details,
// plans or payment buttons. Payment happens only in the portal. This looks for payment words in
// everything the app ships, outside comments, so a careless string cannot slip through review.

const root = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * ADR-0044: the one approved exception. The no-access sheet shows this line (text only: no
 * button, no link, no price, no plan name). Exactly this string is removed before the patterns
 * run; any other use of "багц" still fails.
 */
const ACTIVATE_TEXT = 'Зөв үү? Тав уу? Premium, та багцаа идэвхжүүлнэ үү';

const stripComments = (code: string) =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .split(ACTIVATE_TEXT)
    .join('');

/**
 * The only places where payment words may appear: the flagged QPay test flow (ADR-0083) and the
 * in-app payment and gift screens (ADR-0076, ADR-0090). Both exist for the user only while the
 * switch is on; see the tests at the bottom.
 */
const FLAGGED = ['src/testpay/', 'src/inpay/', 'app/(app)/pay.tsx', 'app/(app)/gift/'];
const isFlagged = (file: string) => FLAGGED.some((f) => file.replaceAll('\\', '/').includes(f));
const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))].filter(
  (file) => !isFlagged(file),
);

/** Mongolian and English payment vocabulary. Matched case-insensitively. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['төлбөр (payment)', /төлбөр/i],
  ['төлөх / төлсөн (pay / paid)', /төл(?:өх|сөн|ж)/i],
  ['үнэ (price)', /үнэ(?!н)|үнийн/i],
  ['эрх авах (get access)', /эрх\s+ав/i],
  ['багц (plan)', /багц/i],
  ['банк (bank)', /банк/i],
  ['данс (account number)', /данс/i],
  ['шилжүүлэг (transfer)', /шилжүүл/i],
  ['захиалга (order)', /захиалга/i],
  ['төгрөг / ₮ (currency)', /төгрөг|₮/i],
  [
    'English payment words',
    /\b(?:price|pricing|payment|pay now|subscribe|subscription|checkout|purchase|billing|invoice|bank|plans?)\b/i,
  ],
];

test('there are files to check', () => {
  assert.ok(files.length > 30, `only ${files.length} files`);
});

for (const [label, pattern] of FORBIDDEN) {
  test(`no "${label}" anywhere in the app`, () => {
    const hits = files
      .filter((file) => pattern.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => file.replace(root, ''));
    assert.deepEqual(hits, []);
  });
}

test('the API wrapper has no payment endpoints', () => {
  const endpoints = stripComments(readFileSync(join(root, 'src/api/endpoints.ts'), 'utf8'));
  assert.doesNotMatch(endpoints, /\/subscriptions|\/plans|\/payments|\/admin/);
});

test('the activate text is the only allowed hit', () => {
  const hits = files.flatMap((file) => {
    const count = readFileSync(file, 'utf8').split(ACTIVATE_TEXT).length - 1;
    return count > 0 ? [`${file.replace(root, '').replaceAll('\\', '/')}:${count}`] : [];
  });
  assert.deepEqual(hits, ['src/i18n/mn.ts:1']);
  assert.equal(mn.noAccess.activate, ACTIVATE_TEXT);
});

test('the check does catch payment text', () => {
  for (const sample of [
    'Төлбөр хийх',
    'Үнэ: 100,000₮',
    'Эрх авах',
    'Банкны данс',
    'Choose a plan',
    'Subscribe',
  ]) {
    assert.ok(
      FORBIDDEN.some(([, pattern]) => pattern.test(sample)),
      `not caught: ${sample}`,
    );
  }
  for (const sample of [
    'Нэвтрэх',
    'Бүртгүүлэх',
    'Нууц үг солих',
    'Төхөөрөмжийн хязгаар хэтэрсэн',
  ]) {
    assert.ok(!FORBIDDEN.some(([, pattern]) => pattern.test(sample)), `wrongly flagged: ${sample}`);
  }
});

// ADR-0076, ADR-0083, ADR-0090: the flagged files may only reach the user while the switch is on.
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('the switch is off unless the server says so or a test build sets the flag', () => {
  assert.match(read('src/config/env.ts'), /EXPO_PUBLIC_MOBILE_PAYMENTS === '1'/);
  const eas = JSON.parse(read('eas.json'));
  assert.equal(eas.build.production.env?.EXPO_PUBLIC_MOBILE_PAYMENTS, undefined);
  // The server's answer defaults to off, in the schema and in the hook.
  assert.match(
    read('src/config/useAppConfig.ts'),
    /inAppPayment: query\.data\?\.inAppPayment \?\? false/,
  );
  assert.match(
    read('src/inpay/useInAppPayment.ts'),
    /return inAppPayment \|\| env\.mobilePayments;/,
  );
});

test('every payment and gift route redirects away while the switch is off', () => {
  const routes = ['app/(app)/pay.tsx', ...sourceFiles(join(root, 'app/(app)/gift'))].map((file) =>
    file.replace(root, '').replaceAll('\\', '/'),
  );
  assert.ok(routes.length >= 3, `only ${routes.length} routes`);
  for (const route of routes) {
    assert.match(read(route), /return useInAppPayment\(\) \? <\w+[^>]*\/> : <Redirect /, route);
  }
});

test('screens outside the flagged folders show payment or gift entries only behind the switch', () => {
  const users = files
    .filter((file) => /inpayMn|payMn|['"`]\/gift|['"`]\/pay['"`]/.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace(root, '').replaceAll('\\', '/'))
    .sort();
  assert.deepEqual(users, [
    'app/(app)/(tabs)/profile.tsx',
    'app/index.tsx',
    'src/screens/NoAccessSheet.tsx',
  ]);
  for (const file of users) {
    const code = read(file);
    assert.match(code, /const paymentsOn = useInAppPayment\(\);/, file);
    // Every use of a payment text or route sits inside a `paymentsOn ? (...)` branch.
    const guarded = code
      .split(/paymentsOn \? \(/)
      .slice(1)
      .join('');
    const uses = code.match(/inpayMn\.|payMn\.|['"`]\/gift|['"`]\/pay['"`]/g) ?? [];
    const guardedUses = guarded.match(/inpayMn\.|payMn\.|['"`]\/gift|['"`]\/pay['"`]/g) ?? [];
    assert.ok(uses.length > 0, file);
    assert.equal(guardedUses.length, uses.length, `${file}: an entry outside the switch`);
  }
});

test('the server config schema keeps the switch off for an older server', async () => {
  const { appConfigResponseSchema } = await import('@ongod/shared');
  const parsed = appConfigResponseSchema.parse({
    minVersion: { ios: '0.0.0', android: '0.0.0' },
    socialLogin: false,
  });
  assert.equal(parsed.inAppPayment, false);
});
