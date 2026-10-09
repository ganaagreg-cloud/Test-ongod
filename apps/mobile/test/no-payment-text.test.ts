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

// A line comment starts at the start of a line or after whitespace, so "https://" inside a
// string is not cut off (a cut string would hide what follows it, audit D-04).
const stripComments = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

// app.config.ts holds the store-facing name and permissions: scanned too.
const files = [
  ...sourceFiles(join(root, 'src')),
  ...sourceFiles(join(root, 'app')),
  join(root, 'app.config.ts'),
];

/** Mongolian and English payment vocabulary. Matched case-insensitively. */
const FORBIDDEN: Array<[string, RegExp]> = [
  ['төлбөр (payment)', /төлбөр/i],
  ['төлөх / төлсөн / төлнө (pay / paid)', /төл(?:өх|сөн|ж|нө)/i],
  ['үнэ (price)', /үнэ(?!н)|үнийн/i],
  ['эрх авах / сунгах (get / extend access)', /эрх\S*\s+(?:ав|сун)/i],
  ['худалдан авах (buy)', /худалд/i],
  ['гишүүн болох (become a member)', /гишүүн\s+бол/i],
  ['QPay / MNT', /qpay|\bmnt\b/i],
  ['багц (plan)', /багц/i],
  ['банк (bank)', /банк/i],
  ['данс (account number)', /данс/i],
  ['шилжүүлэг (transfer)', /шилжүүл/i],
  ['захиалга (order)', /захиалга/i],
  ['төгрөг / ₮ (currency)', /төгрөг|₮/i],
  [
    'English payment words',
    /\b(?:price|pricing|payment|pay|pay now|buy|subscribe|subscription|checkout|purchase|purchases|billing|invoice|bank|plans?|premium|upgrade|unlock)\b/i,
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
    // Found missing by the audit of 2026-10-09:
    'Эрхээ авах',
    'Эрх сунгах',
    'Худалдан авах',
    'Төлнө үү',
    'Buy now',
    'Pay',
    'QPay',
    'Гишүүн болох',
    'Upgrade to premium',
    '100000 MNT',
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
    'Таны эрх идэвхгүй байна.',
    'Эрхээ шалгах',
  ]) {
    assert.ok(!FORBIDDEN.some(([, pattern]) => pattern.test(sample)), `wrongly flagged: ${sample}`);
  }
});
