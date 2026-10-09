import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

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

const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = [...sourceFiles(join(root, 'src')), ...sourceFiles(join(root, 'app'))];

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
