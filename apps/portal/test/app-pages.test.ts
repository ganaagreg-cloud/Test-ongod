import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// ADR-0006 / audit D-01: the pages the mobile apps open (/app/*) must not lead to a purchase.
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

test('the app-only layout has no navigation, links or plans', () => {
  const layout = read('../src/layout/AppLayout.tsx');
  assert.doesNotMatch(layout, /NavLink|<Link|href=|to=|plans|mn\.nav/);
});

test('the /app routes sit outside the normal Layout', () => {
  const app = read('../src/App.tsx');
  const appBlock = app.slice(app.indexOf('path="app"'), app.indexOf('<Route element={<Layout'));
  assert.match(appBlock, /AppTerms/);
  assert.match(appBlock, /AppPrivacy/);
  assert.match(appBlock, /AppSupport/);
  assert.doesNotMatch(appBlock, /Plans|Pay|Account|Login|Register/);
});

test('the app terms leave out the payment section and the app support page has no link', () => {
  const legal = read('../src/pages/Legal.tsx');
  assert.match(legal, /app && section\.payment/);
  assert.match(legal, /app \? null/);
  const mn = read('../src/i18n/mn.ts');
  assert.match(mn, /payment: true,\s*\n\s*title: 'Эрх ба төлбөр'/);
});

test('the mobile app links to the app-only terms page', () => {
  const welcome = readFileSync(
    new URL('../../mobile/app/(auth)/welcome.tsx', import.meta.url),
    'utf8',
  );
  assert.match(welcome, /portalLink\(env\.portalUrl, '\/app\/terms'\)/);
});
